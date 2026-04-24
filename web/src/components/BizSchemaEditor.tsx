import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { AlertTriangle, CheckCircle2, Loader2, Save } from "lucide-react";
import { useTranslation } from "../i18n";
import { useModal } from "./Modal";
import * as BizBackend from "../backend/BizBackend";
import type {
  BizSchemaConflict,
  SaveAuthorizationModelResult,
} from "../backend/BizBackend";
import BizSchemaDslEditor from "./BizSchemaDslEditor";
import BizSchemaChangePlan from "./BizSchemaChangePlan";
import BizSchemaVisualEditor from "./BizSchemaVisualEditor";
import BizSchemaTypeGraph from "./BizSchemaTypeGraph";
import {
  emptyAST,
  findIncompleteRelations,
  parseSchemaJson,
  schemaReducer,
  serializeAstToDsl,
} from "./bizSchemaAst";
import { lintSchema } from "./bizSchemaLint";

// BizSchemaEditor is the unifying container for the ReBAC schema UI
// (spec §8.2). It owns:
//
//   - `dsl`: the canonical text that gets sent to the save endpoint.
//   - `ast`: the structured view rendered by the Visual tab.
//   - A `leadSource` flag: who last edited `dsl` — "user-dsl" when the
//     admin typed in the DSL tab, "visual" when it came from
//     serialising the AST after a visual edit. This flag is what
//     prevents the two tabs from clobbering each other's work during a
//     single edit cycle.
//
// Flow:
//   DSL edit   → setDsl; leadSource="user-dsl". Debounced dry-run. On
//                success, dispatch LOAD from the parsed JSON so the
//                Visual tab catches up.
//   Visual edit → dispatch; leadSource="visual". Effect re-derives
//                 dsl = serializeAstToDsl(ast), keeping the canonical
//                 text in sync.
//
// Save always posts `dsl` — so whichever tab was driving wins.

const DSL_TEMPLATE = `model
  schema 1.1

type user

type document
  relations
    define viewer: [user]
`;

type DryRunState =
  | { kind: "idle" }
  | { kind: "validating" }
  | { kind: "valid" }
  | { kind: "unchanged" }
  | { kind: "conflict"; conflicts: BizSchemaConflict[] }
  | { kind: "error"; message: string };

const DRY_RUN_DEBOUNCE_MS = 500;

type LeadSource = "user-dsl" | "visual";

interface Props {
  appId: string;
}

export default function BizSchemaEditor({ appId }: Props) {
  const { t } = useTranslation();
  const modal = useModal();

  const [dsl, setDsl] = useState<string>("");
  const [savedDsl, setSavedDsl] = useState<string>("");
  const [ast, dispatch] = useReducer(schemaReducer, emptyAST());
  const [subTab, setSubTab] = useState<"dsl" | "visual" | "graph">("dsl");
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dryRun, setDryRun] = useState<DryRunState>({ kind: "idle" });
  const [planOpen, setPlanOpen] = useState(false);
  const [pendingConflicts, setPendingConflicts] = useState<BizSchemaConflict[]>([]);
  const leadSourceRef = useRef<LeadSource>("user-dsl");

  const reqIdRef = useRef(0);
  const debounceRef = useRef<number | null>(null);
  // Ref-mirror of ast so the dry-run effect can read it without
  // depending on its identity. A real dep would cause an infinite
  // loop: dry-run success → dispatch LOAD → ast identity changes →
  // effect re-fires → another dry-run → LOAD → …
  const astRef = useRef(ast);
  useEffect(() => {
    astRef.current = ast;
  }, [ast]);

  // Initial load: populate canonical DSL + parsed AST in one go.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    BizBackend.getBizAuthorizationModel(appId)
      .then((res) => {
        if (cancelled) return;
        if (res.status === "ok" && res.data?.schemaDsl) {
          setDsl(res.data.schemaDsl);
          setSavedDsl(res.data.schemaDsl);
          if (res.data.schemaJson) {
            const parsed = parseSchemaJson(res.data.schemaJson);
            dispatch({ type: "LOAD", ast: parsed });
            if (parsed.types.length > 0) setSelectedTypeId(parsed.types[0].id);
          }
          leadSourceRef.current = "user-dsl";
        } else {
          setDsl(DSL_TEMPLATE);
          setSavedDsl("");
          dispatch({ type: "LOAD", ast: emptyAST() });
          leadSourceRef.current = "user-dsl";
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [appId]);

  // Visual → DSL: if the last editor was the Visual tab, serialise AST
  // and push it into `dsl`. Guarded against loops: we only write when
  // the serialised text differs from the current `dsl`, so the
  // resulting setDsl doesn't trigger a re-run of this same effect.
  useEffect(() => {
    if (loading) return;
    if (leadSourceRef.current !== "visual") return;
    const serialised = serializeAstToDsl(ast);
    if (serialised !== dsl) setDsl(serialised);
  }, [ast, loading, dsl]);

  // DSL → validation → AST sync. Only while the DSL tab is the lead
  // editor: if the visual tab was the last mover, the dsl already
  // reflects the AST and there's nothing new to parse.
  useEffect(() => {
    if (loading) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const text = dsl;
    if (!text.trim()) {
      setDryRun({ kind: "idle" });
      return;
    }
    // Visual-lead short-circuit: the reducer seeds new relations with
    // `this` + empty restrictions, which serialises to `define X: []`
    // — rejected by OpenFGA's parser. Intercept here so the admin
    // sees a friendly nudge instead of the raw `mismatched input ']'`
    // backend error while they're still editing.
    if (leadSourceRef.current === "visual") {
      const incomplete = findIncompleteRelations(astRef.current);
      if (incomplete.length > 0) {
        const sample = incomplete
          .slice(0, 3)
          .map((r) => `${r.typeName}.${r.relationName}`)
          .join(", ");
        const suffix = incomplete.length > 3 ? ` (+${incomplete.length - 3})` : "";
        setDryRun({
          kind: "error",
          message: `${t("rebac.schema.relationNeedsRestriction")}: ${sample}${suffix}`,
        });
        return;
      }
    }
    const token = ++reqIdRef.current;
    setDryRun({ kind: "validating" });
    debounceRef.current = window.setTimeout(() => {
      BizBackend.saveBizAuthorizationModel(appId, text, true)
        .then((res) => {
          if (token !== reqIdRef.current) return;
          if (res.status !== "ok" || !res.data) {
            setDryRun({ kind: "error", message: res.msg || t("rebac.common.error") });
            return;
          }
          const r = res.data as SaveAuthorizationModelResult;
          switch (r.outcome) {
            case "unchanged":
              setDryRun({ kind: "unchanged" });
              if (leadSourceRef.current === "user-dsl" && r.schemaJson) {
                dispatch({ type: "LOAD", ast: parseSchemaJson(r.schemaJson) });
              }
              return;
            case "advanced":
              setDryRun({ kind: "valid" });
              if (leadSourceRef.current === "user-dsl" && r.schemaJson) {
                dispatch({ type: "LOAD", ast: parseSchemaJson(r.schemaJson) });
              }
              return;
            case "conflict":
              setDryRun({
                kind: "conflict",
                conflicts: r.conflicts || [],
              });
              return;
          }
        })
        .catch((err: unknown) => {
          if (token !== reqIdRef.current) return;
          setDryRun({
            kind: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        });
    }, DRY_RUN_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // `ast` is read via astRef above to avoid re-firing this effect
    // every time LOAD changes ast identity (would cause infinite
    // dry-run loop).
  }, [appId, dsl, loading, t]);

  const dirty = dsl !== savedDsl;

  // Save is only allowed once dry-run has *confirmed* the DSL is
  // parseable (`valid` / `unchanged`). `idle` used to be in the allow-
  // list to cover the pre-debounce window, but that let Ctrl-S bypass
  // validation during the few ms between paste and validate — review
  // finding R2.
  const canSave = useMemo(() => {
    if (loading || saving) return false;
    if (!dirty) return false;
    return dryRun.kind === "valid" || dryRun.kind === "unchanged";
  }, [loading, saving, dirty, dryRun.kind]);

  const lintWarnings = useMemo(() => lintSchema(ast), [ast]);

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const res = await BizBackend.saveBizAuthorizationModel(appId, dsl, false);
      if (res.status !== "ok" || !res.data) {
        modal.toast(res.msg || t("rebac.common.error"), "error");
        return;
      }
      const r = res.data as SaveAuthorizationModelResult;
      switch (r.outcome) {
        case "advanced":
          // Clear leadSource before LOAD — otherwise the visual→DSL
          // effect fires right after dispatch and, if the backend's
          // protojson emits types/relations in a different order
          // than the user's DSL, rewrites `dsl` and flips `dirty`
          // back to true immediately after a successful save (R1).
          leadSourceRef.current = "user-dsl";
          setSavedDsl(dsl);
          setDryRun({ kind: "unchanged" });
          if (r.schemaJson) {
            dispatch({ type: "LOAD", ast: parseSchemaJson(r.schemaJson) });
          }
          modal.toast(t("rebac.schema.outcomeAdvanced"), "success");
          return;
        case "unchanged":
          leadSourceRef.current = "user-dsl";
          setSavedDsl(dsl);
          setDryRun({ kind: "unchanged" });
          modal.toast(t("rebac.schema.outcomeUnchanged"), "info");
          return;
        case "conflict":
          setDryRun({ kind: "conflict", conflicts: r.conflicts || [] });
          setPendingConflicts(r.conflicts ?? []);
          setPlanOpen(true);
          return;
      }
    } catch (err) {
      modal.toast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setSaving(false);
    }
  }, [appId, canSave, dsl, modal, t]);

  const handleForceCleanup = async () => {
    setSaving(true);
    try {
      const deletes = pendingConflicts.map((c) => ({
        object: c.object,
        relation: c.relation,
        user: c.user,
      }));
      if (deletes.length > 0) {
        const delRes = await BizBackend.writeBizTuples({ appId, deletes });
        if (delRes.status !== "ok") {
          modal.toast(delRes.msg || t("rebac.common.error"), "error");
          return;
        }
      }
      const res = await BizBackend.saveBizAuthorizationModel(appId, dsl, false);
      if (res.status !== "ok" || !res.data) {
        // Deletes already succeeded — don't leave the modal showing phantom
        // "affected" tuples, and surface a specific message so the admin knows
        // which step failed.
        setPendingConflicts([]);
        modal.toast(
          `${t("rebac.schema.plan.savePartialFailure")}${res.msg ? `: ${res.msg}` : ""}`,
          "error",
        );
        return;
      }
      const r = res.data as SaveAuthorizationModelResult;
      if (r.outcome === "conflict") {
        // Race: more tuples were written between our delete and save.
        // Refresh the conflict list and keep the modal open.
        setDryRun({ kind: "conflict", conflicts: r.conflicts || [] });
        setPendingConflicts(r.conflicts ?? []);
        return;
      }
      // advanced | unchanged — save succeeded.
      leadSourceRef.current = "user-dsl";
      setSavedDsl(dsl);
      setDryRun({ kind: "unchanged" });
      if (r.schemaJson) {
        dispatch({ type: "LOAD", ast: parseSchemaJson(r.schemaJson) });
      }
      modal.toast(t("rebac.schema.outcomeAdvanced"), "success");
      setPlanOpen(false);
      setPendingConflicts([]);
    } catch (err) {
      modal.toast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setSaving(false);
    }
  };

  // Ctrl/Cmd-S global shortcut. Gated on canSave so this behaves
  // identically to the visible Save button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (canSave) void handleSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canSave, handleSave]);

  const handleDslChange = (next: string) => {
    leadSourceRef.current = "user-dsl";
    setDsl(next);
  };

  const dispatchFromVisual = (action: Parameters<typeof dispatch>[0]) => {
    leadSourceRef.current = "visual";
    dispatch(action);
  };

  const handleReset = () => {
    leadSourceRef.current = "user-dsl";
    setDsl(savedDsl || DSL_TEMPLATE);
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-surface-1 p-6 text-center text-[13px] text-text-muted">
        {t("rebac.common.loading")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-1 p-1">
            <button
              type="button"
              className={`px-3 py-1 rounded text-[12px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40 ${
                subTab === "dsl"
                  ? "bg-accent-primary text-white"
                  : "text-text-muted hover:text-text-primary"
              }`}
              onClick={() => setSubTab("dsl")}
            >
              {t("rebac.schema.tabDsl")}
            </button>
            <button
              type="button"
              className={`px-3 py-1 rounded text-[12px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40 ${
                subTab === "visual"
                  ? "bg-accent-primary text-white"
                  : "text-text-muted hover:text-text-primary"
              }`}
              onClick={() => setSubTab("visual")}
            >
              {t("rebac.schema.tabVisual")}
            </button>
            <button
              type="button"
              className={`px-3 py-1 rounded text-[12px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40 ${
                subTab === "graph"
                  ? "bg-accent-primary text-white"
                  : "text-text-muted hover:text-text-primary"
              }`}
              onClick={() => setSubTab("graph")}
            >
              {t("rebac.schema.tabGraph")}
            </button>
          </div>
          <DryRunPill state={dryRun} dirty={dirty} t={t} />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg text-[13px] border border-border text-text-primary hover:bg-surface-2 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40"
            disabled={!dirty || saving}
            onClick={handleReset}
          >
            {t("rebac.common.cancel")}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium bg-accent-primary text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40"
            disabled={!canSave}
            onClick={() => void handleSave()}
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            {saving ? t("rebac.schema.saving") : t("rebac.schema.save")}
          </button>
        </div>
      </div>

      {subTab === "dsl" ? (
        <BizSchemaDslEditor
          value={dsl}
          onChange={handleDslChange}
          lintWarnings={lintWarnings}
          onInsertSnippet={(snippet) => {
            // Append snippet at end with a newline separator.
            // Cursor-aware insert is a follow-up.
            setDsl((d) => d + (d.endsWith("\n") ? "" : "\n") + snippet);
            leadSourceRef.current = "user-dsl";
          }}
        />
      ) : subTab === "visual" ? (
        <>
          {dryRun.kind === "error" ? (
            <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-[12px] text-text-muted">
              {t("rebac.schema.lockedByParseError")}
            </div>
          ) : null}
          <BizSchemaVisualEditor
            ast={ast}
            dispatch={dispatchFromVisual}
            selectedTypeId={selectedTypeId}
            onSelectType={setSelectedTypeId}
          />
        </>
      ) : (
        <BizSchemaTypeGraph ast={ast} />
      )}

      {dryRun.kind === "error" && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-text-primary">
                {t("rebac.schema.parseError")}
              </p>
              <pre className="mt-1 text-[12px] text-text-muted whitespace-pre-wrap break-words font-mono">
                {dryRun.message}
              </pre>
            </div>
          </div>
        </div>
      )}

      {dryRun.kind === "conflict" && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-text-primary">
                {t("rebac.schema.outcomeConflict")}
              </p>
              <p className="mt-1 text-[12px] text-text-muted">
                {t("rebac.schema.conflictDialog.hint")}
              </p>
              <ul className="mt-2 space-y-1 max-h-48 overflow-auto">
                {dryRun.conflicts.map((c) => (
                  <li
                    key={c.tupleId}
                    className="text-[12px] font-mono text-text-primary"
                  >
                    <span className="text-text-muted">#{c.tupleId}</span>{" "}
                    {c.object}#{c.relation}@{c.user}
                    <span className="text-text-muted"> — {c.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <BizSchemaChangePlan
        open={planOpen}
        savedDsl={savedDsl}
        nextDsl={dsl}
        conflicts={pendingConflicts}
        saving={saving}
        onCancel={() => {
          setPlanOpen(false);
          setPendingConflicts([]);
        }}
        onForceCleanupAndSave={() => void handleForceCleanup()}
      />
    </div>
  );
}

function DryRunPill({
  state,
  dirty,
  t,
}: {
  state: DryRunState;
  dirty: boolean;
  t: (k: string) => string;
}) {
  if (state.kind === "validating") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-text-muted">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        {t("rebac.schema.validating")}
      </span>
    );
  }
  if (state.kind === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-danger font-medium">
        <AlertTriangle className="w-3.5 h-3.5" />
        {t("rebac.schema.parseError")}
      </span>
    );
  }
  if (state.kind === "conflict") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-warning font-medium">
        <AlertTriangle className="w-3.5 h-3.5" />
        {t("rebac.schema.outcomeConflict")}
      </span>
    );
  }
  if (state.kind === "valid") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-success font-medium">
        <CheckCircle2 className="w-3.5 h-3.5" />
        {dirty ? t("rebac.schema.valid") : t("rebac.schema.saved")}
      </span>
    );
  }
  if (state.kind === "unchanged") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-text-muted">
        <CheckCircle2 className="w-3.5 h-3.5" />
        {t("rebac.schema.saved")}
      </span>
    );
  }
  return (
    <span className="text-[12px] text-text-muted">
      {dirty ? t("rebac.schema.unsaved") : ""}
    </span>
  );
}
