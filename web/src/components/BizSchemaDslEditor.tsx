import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { AlertTriangle, CheckCircle2, Loader2, Save } from "lucide-react";
import { useTranslation } from "../i18n";
import { useModal } from "./Modal";
import * as BizBackend from "../backend/BizBackend";
import type {
  BizSchemaConflict,
  SaveAuthorizationModelResult,
} from "../backend/BizBackend";

// Starter template for apps that have no saved schema yet. Keeping it
// minimal (one type, one relation) so the admin has a working shape to
// extend rather than a blank canvas; aligns with spec §5.1's example.
const DSL_TEMPLATE = `model
  schema 1.1

type user

type document
  relations
    define viewer: [user]
`;

// Dry-run outcome state machine. Collapsing these into a discriminated
// union keeps the render function a flat switch — no sentinel strings,
// no parallel booleans.
type DryRunState =
  | { kind: "idle" }
  | { kind: "validating" }
  | { kind: "valid" }
  | { kind: "unchanged" }
  | { kind: "conflict"; conflicts: BizSchemaConflict[] }
  | { kind: "error"; message: string };

// Debounce window for dry-run validation. Long enough that the editor
// doesn't flood the backend during normal typing; short enough that
// pasting a schema shows validation within half a "pause".
const DRY_RUN_DEBOUNCE_MS = 500;

interface Props {
  appId: string;
}

export default function BizSchemaDslEditor({ appId }: Props) {
  const { t } = useTranslation();
  const modal = useModal();

  const [dsl, setDsl] = useState<string>("");
  // The baseline we loaded from the server; `dsl` diverging from this is
  // what "unsaved" means. Re-set after every successful save so the
  // banner flips back to saved.
  const [savedDsl, setSavedDsl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dryRun, setDryRun] = useState<DryRunState>({ kind: "idle" });

  // Debounce timer — kept in a ref so successive keystrokes cancel the
  // previous validation without re-subscribing useEffect to `dsl`.
  const debounceRef = useRef<number | null>(null);
  // Request-ordering token. A stale validation finishing after a newer
  // one would otherwise overwrite fresh state; we discard results whose
  // token != current.
  const reqIdRef = useRef(0);

  // Initial load: fetch current schema (if any) and seed both the
  // editor value and the saved-baseline. Missing-schema surfaces as a
  // backend error, which we treat as "empty app, show template".
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    BizBackend.getBizAuthorizationModel(appId)
      .then((res) => {
        if (cancelled) return;
        if (res.status === "ok" && res.data?.schemaDsl) {
          setDsl(res.data.schemaDsl);
          setSavedDsl(res.data.schemaDsl);
        } else {
          // No schema on disk yet — prefill the template so the admin
          // has something to edit. Baseline stays empty so it registers
          // as unsaved, signalling there's work to do.
          setDsl(DSL_TEMPLATE);
          setSavedDsl("");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [appId]);

  const runDryRun = useCallback(
    (dslValue: string) => {
      const token = ++reqIdRef.current;
      if (!dslValue.trim()) {
        setDryRun({ kind: "idle" });
        return;
      }
      setDryRun({ kind: "validating" });
      BizBackend.saveBizAuthorizationModel(appId, dslValue, true)
        .then((res) => {
          if (token !== reqIdRef.current) return;
          if (res.status !== "ok" || !res.data) {
            setDryRun({ kind: "error", message: res.msg || t("rebac.common.error") });
            return;
          }
          const result = res.data as SaveAuthorizationModelResult;
          switch (result.outcome) {
            case "unchanged":
              setDryRun({ kind: "unchanged" });
              return;
            case "advanced":
              setDryRun({ kind: "valid" });
              return;
            case "conflict":
              setDryRun({ kind: "conflict", conflicts: result.conflicts || [] });
              return;
          }
        })
        .catch((err: unknown) => {
          if (token !== reqIdRef.current) return;
          const msg = err instanceof Error ? err.message : String(err);
          setDryRun({ kind: "error", message: msg });
        });
    },
    [appId, t],
  );

  // Debounce dry-run against edits. A cleanup on unmount prevents a
  // fire-after-unmount warning on quick tab-switches.
  useEffect(() => {
    if (loading) return;
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      runDryRun(dsl);
    }, DRY_RUN_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [dsl, loading, runDryRun]);

  const dirty = dsl !== savedDsl;
  const canSave = useMemo(() => {
    if (saving || loading) return false;
    if (!dirty) return false;
    // Permit "valid" and — generously — "idle" (first render before
    // debounce fires). Block "error" and "conflict" because backend
    // would reject them anyway.
    return dryRun.kind === "valid" || dryRun.kind === "idle";
  }, [saving, loading, dirty, dryRun.kind]);

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const res = await BizBackend.saveBizAuthorizationModel(appId, dsl, false);
      if (res.status !== "ok" || !res.data) {
        modal.toast(res.msg || t("rebac.common.error"), "error");
        return;
      }
      const result = res.data as SaveAuthorizationModelResult;
      switch (result.outcome) {
        case "advanced":
          setSavedDsl(dsl);
          setDryRun({ kind: "unchanged" });
          modal.toast(t("rebac.schema.outcomeAdvanced"), "success");
          return;
        case "unchanged":
          setSavedDsl(dsl);
          setDryRun({ kind: "unchanged" });
          modal.toast(t("rebac.schema.outcomeUnchanged"), "info");
          return;
        case "conflict":
          setDryRun({ kind: "conflict", conflicts: result.conflicts || [] });
          modal.toast(t("rebac.schema.outcomeConflict"), "error");
          return;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      modal.toast(msg, "error");
    } finally {
      setSaving(false);
    }
  }, [appId, canSave, dsl, modal, t]);

  // Keyboard shortcut: ⌘/Ctrl-S saves. Guard behind canSave so the
  // shortcut behaves the same as the button.
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <DryRunPill state={dryRun} dirty={dirty} t={t} />
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg text-[13px] border border-border text-text-primary hover:bg-surface-2 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!dirty || saving}
            onClick={() => setDsl(savedDsl || DSL_TEMPLATE)}
          >
            {t("rebac.common.cancel")}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium bg-accent-primary text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
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

      <div className="rounded-lg border border-border overflow-hidden">
        <CodeMirror
          value={dsl}
          onChange={setDsl}
          height="420px"
          theme={oneDark}
          basicSetup={{
            lineNumbers: true,
            foldGutter: false,
            highlightActiveLine: true,
            autocompletion: false,
          }}
        />
      </div>

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
  t: (k: any) => string;
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
  // idle
  return (
    <span className="text-[12px] text-text-muted">
      {dirty ? t("rebac.schema.unsaved") : ""}
    </span>
  );
}
