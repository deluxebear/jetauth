import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Play, History, Trash2, CheckCircle2, XCircle, Star } from "lucide-react";
import { useTranslation } from "../i18n";
import { useModal } from "./Modal";
import * as BizBackend from "../backend/BizBackend";
import type {
  BizCheckRequest,
  BizCheckResponse,
  BizExpandNode,
  BizTupleKey,
} from "../backend/BizBackend";

// BizReBACTester — Task 8. Admin-facing playground for the /biz-check
// and /biz-expand endpoints. Matches spec §8.2 "Tester page":
//
//   - Top form takes (user, object, relation) + optional contextual
//     tuples and context variables (both as JSON textareas).
//   - "Run" fires BizCheck; on success, also fetches Expand so the
//     admin can see the rewrite tree that led to the answer.
//   - History of the last 20 Checks is persisted in localStorage so
//     it survives tab refreshes.
//   - Expand tree renders as an indented nested list (plan R3 fallback;
//     upgrading to react-flow is a CP-8 follow-up).

interface Props {
  appId: string;
  /** When set, pre-fill the form with this tuple and auto-run Check. */
  initialRequest?: { object: string; relation: string; user: string };
}

interface HistoryEntry {
  at: number;
  request: CheckFormState;
  allowed: boolean;
  resolution: string;
}

interface CheckFormState {
  user: string;
  object: string;
  relation: string;
  contextualTuplesJson: string;
  contextJson: string;
}

const HISTORY_KEY_PREFIX = "rebac-tester-history:";
const HISTORY_LIMIT = 20;

interface CaseEntry {
  id: string; // uuid
  name: string; // user-provided alias
  request: CheckFormState;
  expected: "allow" | "deny";
  lastRun?: { allowed: boolean; at: number };
}

const CASES_KEY_PREFIX = "rebac-tester-cases:";

function casesKey(appId: string) {
  return `${CASES_KEY_PREFIX}${appId}`;
}

function loadCases(appId: string): CaseEntry[] {
  try {
    const raw = localStorage.getItem(casesKey(appId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCases(appId: string, cases: CaseEntry[]) {
  try {
    localStorage.setItem(casesKey(appId), JSON.stringify(cases));
  } catch {
    // quota / disabled — cases are non-critical
  }
}

function historyKey(appId: string) {
  return `${HISTORY_KEY_PREFIX}${appId}`;
}

function loadHistory(appId: string): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(historyKey(appId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(appId: string, entries: HistoryEntry[]) {
  try {
    localStorage.setItem(historyKey(appId), JSON.stringify(entries));
  } catch {
    // Quota or disabled storage — swallow; history is non-essential.
  }
}

export default function BizReBACTester({ appId, initialRequest }: Props) {
  const { t } = useTranslation();
  const modal = useModal();

  const [form, setForm] = useState<CheckFormState>({
    user: "",
    object: "",
    relation: "",
    contextualTuplesJson: "",
    contextJson: "",
  });
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BizCheckResponse | null>(null);
  const [expand, setExpand] = useState<BizExpandNode | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>(() =>
    loadHistory(appId),
  );
  const [showHistory, setShowHistory] = useState(false);
  const [cases, setCases] = useState<CaseEntry[]>(() => loadCases(appId));
  const [view, setView] = useState<"history" | "cases">("history");

  useEffect(() => {
    setHistory(loadHistory(appId));
  }, [appId]);

  useEffect(() => {
    setCases(loadCases(appId));
  }, [appId]);

  const formValid = useMemo(
    () => form.user.trim() && form.object.trim() && form.relation.trim(),
    [form.user, form.object, form.relation],
  );

  const runCheck = useCallback(async () => {
    if (!formValid) return;
    // Parse the optional JSON textareas first — surface parse errors
    // before we ship a request.
    let contextualTuples: BizTupleKey[] = [];
    let context: Record<string, unknown> | undefined;
    try {
      if (form.contextualTuplesJson.trim()) {
        const raw = JSON.parse(form.contextualTuplesJson);
        if (!Array.isArray(raw)) throw new Error("must be an array");
        // Shape-check each entry locally so the admin gets a precise
        // error (e.g. "entry #2: missing 'relation'") instead of a
        // generic 500 from the backend (review N4).
        raw.forEach((entry, i) => {
          if (
            !entry ||
            typeof entry !== "object" ||
            Array.isArray(entry) ||
            typeof (entry as BizTupleKey).object !== "string" ||
            typeof (entry as BizTupleKey).relation !== "string" ||
            typeof (entry as BizTupleKey).user !== "string"
          ) {
            throw new Error(
              `entry #${i} must have string fields object/relation/user`,
            );
          }
        });
        contextualTuples = raw as BizTupleKey[];
      }
    } catch (err) {
      modal.toast(
        "contextual tuples JSON: " +
          (err instanceof Error ? err.message : String(err)),
        "error",
      );
      return;
    }
    try {
      if (form.contextJson.trim()) {
        const raw = JSON.parse(form.contextJson);
        if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
          throw new Error("must be an object");
        }
        context = raw as Record<string, unknown>;
      }
    } catch (err) {
      modal.toast(
        "context JSON: " + (err instanceof Error ? err.message : String(err)),
        "error",
      );
      return;
    }

    const req: BizCheckRequest = {
      appId,
      tupleKey: {
        object: form.object.trim(),
        relation: form.relation.trim(),
        user: form.user.trim(),
      },
      contextualTuples: contextualTuples.length > 0 ? contextualTuples : undefined,
      context,
    };

    setRunning(true);
    setExpand(null);
    try {
      const res = await BizBackend.bizCheck(req);
      if (res.status !== "ok" || !res.data) {
        modal.toast(res.msg || t("rebac.common.error"), "error");
        setResult(null);
        return;
      }
      setResult(res.data);
      // Fire-and-forget expand. It's a read-only tree; any error
      // leaves the rest of the tester functional.
      void BizBackend.bizExpand(appId, req.tupleKey.object, req.tupleKey.relation)
        .then((expandRes) => {
          if (expandRes.status === "ok" && expandRes.data) {
            setExpand(expandRes.data.root);
          }
        })
        .catch(() => {
          /* non-fatal */
        });
      // Record history. Functional setState so rapid consecutive Runs
      // don't clobber each other by capturing the same `history`
      // snapshot in two closures (review R4).
      const entry: HistoryEntry = {
        at: Date.now(),
        request: form,
        allowed: !!res.data.allowed,
        resolution: res.data.resolution || "",
      };
      setHistory((prev) => {
        const next = [entry, ...prev].slice(0, HISTORY_LIMIT);
        saveHistory(appId, next);
        return next;
      });
    } catch (err) {
      modal.toast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setRunning(false);
    }
  }, [appId, form, formValid, modal, t]);

  // Keep a ref to the latest runCheck so the prefill effect below can
  // invoke the freshest closure without adding runCheck to its dep array.
  const runCheckRef = useRef(runCheck);
  useEffect(() => {
    runCheckRef.current = runCheck;
  }, [runCheck]);

  // Prefill handshake from the Browser tab's "Why?" button. We read the
  // prop, patch the form, and schedule a Check on the next tick so
  // state has settled. The effect re-runs only when the tuple changes.
  useEffect(() => {
    if (!initialRequest) return;
    setForm((f) => ({
      ...f,
      user: initialRequest.user,
      object: initialRequest.object,
      relation: initialRequest.relation,
    }));
    // The ref always points to the latest runCheck, so by the time the
    // timeout fires, it picks up the re-rendered closure with the patched
    // form values. The 50ms delay is still needed to let React re-render
    // after the setForm above settles.
    const id = window.setTimeout(() => {
      void runCheckRef.current();
    }, 50);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    initialRequest?.object,
    initialRequest?.relation,
    initialRequest?.user,
  ]);

  const clearHistory = () => {
    setHistory([]);
    saveHistory(appId, []);
  };

  const loadFromHistory = (e: HistoryEntry) => {
    setForm(e.request);
    setShowHistory(false);
  };

  function renderHistoryList() {
    return (
      <>
        {history.length === 0 ? (
          <p className="text-[12px] text-text-muted p-2">(empty)</p>
        ) : (
          <>
            <div className="flex justify-end">
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-danger px-2 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded"
                onClick={clearHistory}
                aria-label={t("rebac.tester.clearHistory")}
              >
                <Trash2 className="w-3 h-3" />
                {t("rebac.tester.clearHistory")}
              </button>
            </div>
            <ul className="divide-y divide-border">
              {history.map((e, i) => (
                <li
                  key={i}
                  className="px-2 py-1.5 flex items-center gap-2 cursor-pointer hover:bg-surface-2"
                  onClick={() => loadFromHistory(e)}
                >
                  {e.allowed ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-danger shrink-0" />
                  )}
                  <button
                    type="button"
                    aria-label={t("rebac.tester.saveAsCase")}
                    className="text-text-muted hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded shrink-0"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      const name = window.prompt(t("rebac.tester.caseName"));
                      if (!name) return;
                      const newCase: CaseEntry = {
                        id:
                          typeof crypto !== "undefined" && crypto.randomUUID
                            ? crypto.randomUUID()
                            : String(Date.now()) +
                              Math.random().toString(36).slice(2),
                        name,
                        request: e.request,
                        expected: e.allowed ? "allow" : "deny",
                      };
                      const next = [...cases, newCase];
                      setCases(next);
                      saveCases(appId, next);
                      modal.toast(t("rebac.tester.caseSaved"), "success");
                    }}
                  >
                    <Star className="w-3.5 h-3.5" />
                  </button>
                  <span className="flex-1 text-[12px] font-mono truncate">
                    {e.request.object}#{e.request.relation}@{e.request.user}
                  </span>
                  <span className="text-[11px] text-text-muted shrink-0">
                    {new Date(e.at).toLocaleTimeString()}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </>
    );
  }

  function renderCasesList() {
    if (cases.length === 0)
      return (
        <p className="text-[12px] text-text-muted p-2">
          {t("rebac.tester.casesEmpty")}
        </p>
      );
    return (
      <ul className="divide-y divide-border">
        {cases.map((c) => {
          const passed =
            c.lastRun !== undefined &&
            (c.expected === "allow") === c.lastRun.allowed;
          return (
            <li key={c.id} className="px-2 py-1.5 flex items-center gap-2">
              <span
                className={
                  c.lastRun
                    ? passed
                      ? "w-1.5 h-1.5 rounded-full bg-success"
                      : "w-1.5 h-1.5 rounded-full bg-danger"
                    : "w-1.5 h-1.5 rounded-full bg-text-muted/40"
                }
                aria-label={c.lastRun ? (passed ? "pass" : "fail") : "not run"}
              />
              <span className="flex-1 text-[12px] truncate" title={c.name}>
                {c.name}
              </span>
              <span className="text-[11px] text-text-muted font-mono truncate max-w-[200px]">
                {c.request.object}#{c.request.relation}@{c.request.user}
              </span>
              <button
                type="button"
                aria-label={t("rebac.tester.deleteCase")}
                className="text-text-muted hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded"
                onClick={() => {
                  const next = cases.filter((x) => x.id !== c.id);
                  setCases(next);
                  saveCases(appId, next);
                }}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  const runAllCases = useCallback(async () => {
    if (cases.length === 0) return;
    const checks = cases.map((c) => ({
      tupleKey: {
        object: c.request.object,
        relation: c.request.relation,
        user: c.request.user,
      },
    }));
    const res = await BizBackend.bizBatchCheck({ appId, checks });
    if (res.status !== "ok" || !res.data?.results) {
      modal.toast(res.msg || t("rebac.common.error"), "error");
      return;
    }
    const now = Date.now();
    const results = res.data.results;
    const next = cases.map((c, i) => ({
      ...c,
      lastRun: {
        allowed: results[i]?.allowed ?? false,
        at: now,
      },
    }));
    setCases(next);
    saveCases(appId, next);
    const pass = next.filter(
      (c) =>
        c.lastRun !== undefined &&
        (c.expected === "allow") === c.lastRun.allowed,
    ).length;
    modal.toast(
      `${pass} / ${next.length} ${t("rebac.tester.runAllResultSuffix")}`,
      pass === next.length ? "success" : "error",
    );
  }, [appId, cases, modal, t]);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <LabeledInput
          label={t("rebac.tuples.columns.user")}
          value={form.user}
          onChange={(v) => setForm((f) => ({ ...f, user: v }))}
          placeholder="user:alice"
          mono
        />
        <LabeledInput
          label={t("rebac.tuples.columns.object")}
          value={form.object}
          onChange={(v) => setForm((f) => ({ ...f, object: v }))}
          placeholder="document:d1"
          mono
        />
        <LabeledInput
          label={t("rebac.tuples.columns.relation")}
          value={form.relation}
          onChange={(v) => setForm((f) => ({ ...f, relation: v }))}
          placeholder="viewer"
          mono
        />
      </div>

      <details className="rounded-lg border border-border bg-surface-1">
        <summary className="px-3 py-2 text-[12px] text-text-muted cursor-pointer select-none">
          {t("rebac.tester.contextualTuples")} + {t("rebac.tester.context")}
        </summary>
        <div className="p-3 flex flex-col gap-2">
          <LabeledTextarea
            label={t("rebac.tester.contextualTuples")}
            value={form.contextualTuplesJson}
            onChange={(v) => setForm((f) => ({ ...f, contextualTuplesJson: v }))}
            placeholder='[{"object":"document:d1","relation":"viewer","user":"user:alice"}]'
          />
          <LabeledTextarea
            label={t("rebac.tester.context")}
            value={form.contextJson}
            onChange={(v) => setForm((f) => ({ ...f, contextJson: v }))}
            placeholder='{"region":"us-east-1"}'
          />
        </div>
      </details>

      <div className="flex items-center justify-between">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] border border-border hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          onClick={() => setShowHistory((s) => !s)}
        >
          <History className="w-3.5 h-3.5" />
          {t("rebac.tester.recent")} ({history.length})
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-medium bg-accent text-white hover:bg-accent-hover disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          onClick={() => void runCheck()}
          disabled={!formValid || running}
        >
          <Play className="w-3.5 h-3.5" />
          {t("rebac.tester.check")}
        </button>
      </div>

      {showHistory && (
        <div className="rounded-lg border border-border bg-surface-1 p-2">
          <div className="flex items-center gap-2 mb-2 px-1">
            <div className="inline-flex items-center gap-0.5 rounded border border-border p-0.5">
              <button
                type="button"
                className={`px-2 py-0.5 rounded text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                  view === "history"
                    ? "bg-surface-2 font-medium"
                    : "text-text-muted"
                }`}
                onClick={() => setView("history")}
              >
                {t("rebac.tester.tabHistory")} ({history.length})
              </button>
              <button
                type="button"
                className={`px-2 py-0.5 rounded text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                  view === "cases"
                    ? "bg-surface-2 font-medium"
                    : "text-text-muted"
                }`}
                onClick={() => setView("cases")}
              >
                {t("rebac.tester.tabCases")} ({cases.length})
              </button>
            </div>
            {view === "cases" && cases.length > 0 && (
              <button
                type="button"
                className="ml-auto inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border border-border hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                onClick={() => void runAllCases()}
              >
                <Play className="w-3 h-3" />
                {t("rebac.tester.runAll")}
              </button>
            )}
          </div>
          {view === "history" ? renderHistoryList() : renderCasesList()}
        </div>
      )}

      {result && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-border bg-surface-1 p-4 flex flex-col gap-2"
        >
          <div className="flex items-center gap-2">
            {result.allowed ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-success/10 text-success text-[13px] font-medium">
                <CheckCircle2 className="w-4 h-4" />
                {t("rebac.tester.allowed")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-danger/10 text-danger text-[13px] font-medium">
                <XCircle className="w-4 h-4" />
                {t("rebac.tester.denied")}
              </span>
            )}
            {result.resolution && (
              <span className="text-[11px] text-text-muted font-mono">
                {result.resolution}
              </span>
            )}
          </div>
          {expand && (
            <div className="mt-2">
              <p className="text-[12px] text-text-muted mb-1">
                {t("rebac.tester.expand")}
              </p>
              <ExpandTree node={expand} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Expand tree — nested list rendering ────────────────────────────

function ExpandTree({ node, depth = 0 }: { node: BizExpandNode; depth?: number }) {
  return (
    <div className="pl-3 border-l border-border/60 ml-2 text-[12px]">
      <div className="flex items-center gap-2 py-0.5">
        <span className="font-mono text-text-primary">{node.kind}</span>
        {node.truncated && (
          <span className="text-[10px] text-warning">truncated</span>
        )}
      </div>
      {node.users && node.users.length > 0 && (
        <ul className="pl-3 list-disc text-text-muted marker:text-text-muted">
          {node.users.map((u, i) => (
            <li key={i} className="font-mono text-[11px]">
              {u}
            </li>
          ))}
        </ul>
      )}
      {node.computed && (
        <div className="pl-3 font-mono text-[11px] text-text-muted">
          → {node.computed.object}#{node.computed.relation}
        </div>
      )}
      {node.tupleToUserset && (
        <div className="pl-3 font-mono text-[11px] text-text-muted">
          from {node.tupleToUserset.tupleset?.relation ?? "?"} → {node.tupleToUserset.computed?.relation ?? "?"}
        </div>
      )}
      {node.children && node.children.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {node.children.map((c, i) => (
            <ExpandTree key={i} node={c} depth={depth + 1} />
          ))}
        </div>
      )}
      {node.base && (
        <div>
          <p className="text-[10px] text-text-muted uppercase tracking-wide pl-3 mt-1">
            base
          </p>
          <ExpandTree node={node.base} depth={depth + 1} />
        </div>
      )}
      {node.subtract && (
        <div>
          <p className="text-[10px] text-text-muted uppercase tracking-wide pl-3 mt-1">
            subtract
          </p>
          <ExpandTree node={node.subtract} depth={depth + 1} />
        </div>
      )}
    </div>
  );
}

// ── Inputs ──────────────────────────────────────────────────────────

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-text-muted font-medium">{label}</label>
      <input
        className={`px-2 py-1 rounded border border-border bg-surface-1 text-[13px] ${
          mono ? "font-mono" : ""
        }`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function LabeledTextarea({
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
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-text-muted font-medium">{label}</label>
      <textarea
        className="px-2 py-1 rounded border border-border bg-surface-1 text-[12px] font-mono min-h-[60px]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
