import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Loader2, HelpCircle, ChevronRight } from "lucide-react";
import { useTranslation } from "../i18n";
import { useModal } from "./Modal";
import * as BizBackend from "../backend/BizBackend";
import { parseSchemaJson } from "./bizSchemaAst";
import type { SchemaAST } from "./bizSchemaAst";

// Identity-lens browser for ReBAC. Two modes:
//   - "by-user": pick (objectType, relation, user) → list accessible
//     objects via bizListObjects.
//   - "by-object": pick (object, relation, userFilter) → list users
//     who qualify via bizListUsers.
// Each result row has an optional "Why?" button that jumps to the
// Tester with the tuple pre-filled (handled by the parent page via
// the onInvestigate callback).

type Mode = "by-user" | "by-object";

interface Props {
  appId: string;
  /** Optional callback used by AppAuthorizationPage to jump to the
   *  Tester tab with a pre-filled tuple. If omitted, the "Why?"
   *  button is hidden. */
  onInvestigate?: (tuple: { object: string; relation: string; user: string }) => void;
}

export default function BizReBACBrowser({ appId, onInvestigate }: Props) {
  const { t } = useTranslation();
  const modal = useModal();

  const [mode, setMode] = useState<Mode>("by-user");
  const [schema, setSchema] = useState<SchemaAST | null>(null);
  const [loadingSchema, setLoadingSchema] = useState(true);

  // by-user inputs
  const [user, setUser] = useState("");
  const [objectType, setObjectType] = useState("");
  const [uRelation, setURelation] = useState("");
  // by-object inputs
  const [object, setObject] = useState("");
  const [oRelation, setORelation] = useState("");
  const [userFilter, setUserFilter] = useState("");

  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<string[]>([]);
  const [nextToken, setNextToken] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setLoadingSchema(true);
    BizBackend.getBizAuthorizationModel(appId)
      .then((res) => {
        if (cancelled) return;
        if (res.status === "ok" && res.data?.schemaJson) {
          try {
            setSchema(parseSchemaJson(res.data.schemaJson));
          } catch {
            setSchema(null);
          }
        } else {
          setSchema(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSchema(false);
      });
    return () => {
      cancelled = true;
    };
  }, [appId]);

  // Reset results + token when switching modes or app
  useEffect(() => {
    setResults([]);
    setNextToken(undefined);
  }, [mode, appId]);

  const typeOptions = useMemo(
    () => schema?.types.map((t) => t.name) ?? [],
    [schema],
  );
  const relationOptionsByType = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const td of schema?.types ?? []) {
      map.set(td.name, td.relations.map((r) => r.name));
    }
    return map;
  }, [schema]);

  const runByUser = useCallback(
    async (append: boolean) => {
      setRunning(true);
      try {
        const res = await BizBackend.bizListObjects({
          appId,
          objectType,
          relation: uRelation,
          user,
          pageSize: 100,
          continuationToken: append ? nextToken : undefined,
        });
        if (res.status !== "ok") {
          modal.toast(res.msg || t("rebac.common.error"), "error");
          return;
        }
        setResults((prev) =>
          append ? [...prev, ...(res.data?.objects ?? [])] : res.data?.objects ?? [],
        );
        setNextToken(res.data?.continuationToken);
      } catch (err) {
        modal.toast(err instanceof Error ? err.message : String(err), "error");
      } finally {
        setRunning(false);
      }
    },
    [appId, objectType, uRelation, user, nextToken, modal, t],
  );

  const runByObject = useCallback(
    async (append: boolean) => {
      setRunning(true);
      try {
        const res = await BizBackend.bizListUsers({
          appId,
          object,
          relation: oRelation,
          userFilter: userFilter || undefined,
          pageSize: 100,
          continuationToken: append ? nextToken : undefined,
        });
        if (res.status !== "ok") {
          modal.toast(res.msg || t("rebac.common.error"), "error");
          return;
        }
        setResults((prev) =>
          append ? [...prev, ...(res.data?.users ?? [])] : res.data?.users ?? [],
        );
        setNextToken(res.data?.continuationToken);
      } catch (err) {
        modal.toast(err instanceof Error ? err.message : String(err), "error");
      } finally {
        setRunning(false);
      }
    },
    [appId, object, oRelation, userFilter, nextToken, modal, t],
  );

  const formValid = useMemo(() => {
    if (mode === "by-user") return Boolean(user && objectType && uRelation);
    return Boolean(object && oRelation);
  }, [mode, user, objectType, uRelation, object, oRelation]);

  if (loadingSchema) {
    return (
      <div className="rounded-lg border border-border bg-surface-1 p-6 text-center text-[13px] text-text-muted">
        {t("rebac.common.loading")}
      </div>
    );
  }

  if (!schema) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface-1 p-8 text-center text-[13px] text-text-muted">
        {t("rebac.browser.noSchemaYet")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-1 p-1 self-start">
        <button
          type="button"
          className={`px-3 py-1 rounded text-[12px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
            mode === "by-user"
              ? "bg-accent text-white"
              : "text-text-muted hover:text-text-primary"
          }`}
          onClick={() => setMode("by-user")}
        >
          {t("rebac.browser.byUser")}
        </button>
        <button
          type="button"
          className={`px-3 py-1 rounded text-[12px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
            mode === "by-object"
              ? "bg-accent text-white"
              : "text-text-muted hover:text-text-primary"
          }`}
          onClick={() => setMode("by-object")}
        >
          {t("rebac.browser.byObject")}
        </button>
      </div>

      {mode === "by-user" ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <LabeledInput
            label={t("rebac.tuples.columns.user")}
            value={user}
            onChange={setUser}
            placeholder="user:alice"
          />
          <LabeledSelect
            label={t("rebac.browser.objectType")}
            value={objectType}
            options={typeOptions}
            onChange={(v) => {
              setObjectType(v);
              setURelation("");
            }}
          />
          <LabeledSelect
            label={t("rebac.browser.relation")}
            value={uRelation}
            options={relationOptionsByType.get(objectType) ?? []}
            onChange={setURelation}
            disabled={!objectType}
          />
          <button
            type="button"
            className="self-end inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-medium bg-accent text-white hover:bg-accent-hover disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            disabled={!formValid || running}
            onClick={() => void runByUser(false)}
          >
            {running ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
            ) : (
              <Search className="w-3.5 h-3.5" aria-hidden />
            )}
            {t("rebac.browser.search")}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <LabeledInput
            label={t("rebac.tuples.columns.object")}
            value={object}
            onChange={setObject}
            placeholder="document:d1"
          />
          <LabeledInput
            label={t("rebac.browser.relation")}
            value={oRelation}
            onChange={setORelation}
            placeholder="viewer"
          />
          <LabeledInput
            label={t("rebac.browser.userFilter")}
            value={userFilter}
            onChange={setUserFilter}
            placeholder="user  or  team#member"
          />
          <button
            type="button"
            className="self-end inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-medium bg-accent text-white hover:bg-accent-hover disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            disabled={!formValid || running}
            onClick={() => void runByObject(false)}
          >
            {running ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
            ) : (
              <Search className="w-3.5 h-3.5" aria-hidden />
            )}
            {t("rebac.browser.search")}
          </button>
        </div>
      )}

      {results.length > 0 && (
        <div className="rounded-lg border border-border bg-surface-1 overflow-hidden">
          <div className="px-3 py-2 border-b border-border text-[12px] text-text-muted">
            {results.length} {t("rebac.browser.resultsFound")}
          </div>
          <ul className="divide-y divide-border max-h-96 overflow-auto">
            {results.map((r, i) => (
              <li
                key={i}
                className="px-3 py-1.5 flex items-center gap-2 hover:bg-surface-2"
              >
                <span className="flex-1 font-mono text-[12px]">{r}</span>
                {onInvestigate && (
                  <button
                    type="button"
                    aria-label={t("rebac.browser.why")}
                    className="text-text-muted hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded"
                    onClick={() =>
                      onInvestigate(
                        mode === "by-user"
                          ? { object: r, relation: uRelation, user }
                          : { object, relation: oRelation, user: r },
                      )
                    }
                  >
                    <HelpCircle className="w-3.5 h-3.5" aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {nextToken && (
            <div className="px-3 py-2 border-t border-border">
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[12px] text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded"
                disabled={running}
                onClick={() =>
                  void (mode === "by-user" ? runByUser(true) : runByObject(true))
                }
              >
                <ChevronRight className="w-3.5 h-3.5" aria-hidden />
                {t("rebac.browser.loadMore")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-text-muted font-medium">{label}</span>
      <input
        className="px-2 py-1 rounded border border-border bg-surface-1 text-[13px] font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function LabeledSelect({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-text-muted font-medium">{label}</span>
      <select
        aria-label={label}
        className="px-2 py-1 rounded border border-border bg-surface-1 text-[13px] font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        <option value="">--</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
