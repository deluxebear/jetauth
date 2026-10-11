import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Play, CheckCircle2, XCircle } from "lucide-react";
import { useTranslation } from "../i18n";
import { useModal } from "./Modal";
import * as BizBackend from "../backend/BizBackend";
import type {
  BizCheckRequest,
  BizCheckResponse,
  BizExpandNode,
  BizListObjectsRequest,
  BizListObjectsResult,
  BizListUsersRequest,
  BizListUsersResult,
  BizTupleKey,
} from "../backend/BizBackend";
import BizDecisionPathGraph from "./BizDecisionPathGraph";
import BizExplanationTree from "./BizExplanationTree";
import TupleChip from "./TupleChip";
import BizTesterHistorySidebar from "./BizTesterHistorySidebar";
import type { HistoryEntry as SidebarHistoryEntry, CaseEntry as SidebarCaseEntry } from "./BizTesterHistorySidebar";
import { explainExpand } from "../utils/explain";

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

type TesterOperation = "check" | "list-objects" | "list-users";

interface CheckFormState {
  user: string;
  object: string;
  relation: string;
  contextualTuplesJson: string;
  contextJson: string;
  userFilter?: string;
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

// ── Helpers ──────────────────────────────────────────────────────────

function truncateModelId(id: string): string {
  if (id.length <= 10) return id;
  return `${id.slice(0, 4)}…${id.slice(-3)}`;
}

function countHops(node: BizExpandNode, depth = 0): number {
  const childDepths: number[] = [];
  if (node.children) {
    for (const c of node.children) childDepths.push(countHops(c, depth + 1));
  }
  if (node.base) childDepths.push(countHops(node.base, depth + 1));
  if (node.subtract) childDepths.push(countHops(node.subtract, depth + 1));
  return childDepths.length > 0 ? Math.max(...childDepths) : depth;
}

export default function BizReBACTester({ appId, initialRequest }: Props) {
  const { t, locale } = useTranslation();
  const modal = useModal();

  const [currentModelId, setCurrentModelId] = useState<string | null>(null);

  const [form, setForm] = useState<CheckFormState>({
    user: "",
    object: "",
    relation: "",
    contextualTuplesJson: "",
    contextJson: "",
  });
  const [operation, setOperation] = useState<TesterOperation>("check");
  const [running, setRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [checkResult, setCheckResult] = useState<BizCheckResponse | null>(null);
  const [listObjectsResult, setListObjectsResult] = useState<BizListObjectsResult | null>(null);
  const [listUsersResult, setListUsersResult] = useState<BizListUsersResult | null>(null);
  const [expand, setExpand] = useState<BizExpandNode | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>(() =>
    loadHistory(appId),
  );
  const [cases, setCases] = useState<CaseEntry[]>(() => loadCases(appId));

  useEffect(() => {
    setHistory(loadHistory(appId));
  }, [appId]);

  useEffect(() => {
    setCases(loadCases(appId));
  }, [appId]);

  // Fetch the active authorization model id once on mount / appId change
  // so we can display it in the result panel header chip.
  useEffect(() => {
    void BizBackend.getBizAuthorizationModel(appId)
      .then((res) => {
        if (res.status === "ok" && res.data?.id) {
          setCurrentModelId(res.data.id);
        }
      })
      .catch(() => {
        // Non-fatal — chip just stays hidden.
      });
  }, [appId]);

  const formValid = useMemo(() => {
    if (operation === "list-users") {
      // user field is hidden — only object + relation required
      return form.object.trim() && form.relation.trim();
    }
    return form.user.trim() && form.object.trim() && form.relation.trim();
  }, [operation, form.user, form.object, form.relation]);

  const runOperation = useCallback(async () => {
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

    const t0 = performance.now();
    setRunning(true);
    setExpand(null);
    setElapsedMs(null);
    setCheckResult(null);
    setListObjectsResult(null);
    setListUsersResult(null);
    try {
      if (operation === "check") {
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
        const res = await BizBackend.bizCheck(req);
        setElapsedMs(performance.now() - t0);
        if (res.status !== "ok" || !res.data) {
          modal.toast(res.msg || t("rebac.common.error"), "error");
          return;
        }
        setCheckResult(res.data);
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
      } else if (operation === "list-objects") {
        const req: BizListObjectsRequest = {
          appId,
          objectType: form.object.trim(),
          relation: form.relation.trim(),
          user: form.user.trim(),
          contextualTuples: contextualTuples.length > 0 ? contextualTuples : undefined,
          context,
          pageSize: 50,
        };
        const res = await BizBackend.bizListObjects(req);
        setElapsedMs(performance.now() - t0);
        if (res.status !== "ok" || !res.data) {
          modal.toast(res.msg || t("rebac.common.error"), "error");
          return;
        }
        setListObjectsResult(res.data);
      } else {
        // list-users
        const req: BizListUsersRequest = {
          appId,
          object: form.object.trim(),
          relation: form.relation.trim(),
          userFilter: form.userFilter?.trim() || undefined,
          contextualTuples: contextualTuples.length > 0 ? contextualTuples : undefined,
          context,
          pageSize: 50,
        };
        const res = await BizBackend.bizListUsers(req);
        setElapsedMs(performance.now() - t0);
        if (res.status !== "ok" || !res.data) {
          modal.toast(res.msg || t("rebac.common.error"), "error");
          return;
        }
        setListUsersResult(res.data);
      }
    } catch (err) {
      modal.toast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setRunning(false);
    }
  }, [appId, form, formValid, operation, modal, t]);

  // Keep a ref to the latest runOperation so the prefill effect below can
  // invoke the freshest closure without adding runOperation to its dep array.
  const runCheckRef = useRef(runOperation);
  useEffect(() => {
    runCheckRef.current = runOperation;
  }, [runOperation]);

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

  // ⌘+Enter / Ctrl+Enter shortcut — fires runCheck from any input field.
  // Intentionally skips textareas so multi-line edits aren't accidentally
  // submitted mid-typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        const target = e.target as HTMLElement;
        const isTextarea = target?.tagName === "TEXTAREA";
        if (isTextarea) return;
        e.preventDefault();
        void runCheckRef.current();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const clearHistory = () => {
    setHistory([]);
    saveHistory(appId, []);
  };

  const loadFromHistory = (e: HistoryEntry) => {
    setForm(e.request);
  };

  const handleSaveCase = useCallback(async (e: SidebarHistoryEntry) => {
    const name = await modal.prompt({
      title: t("rebac.tester.caseName"),
      maxLength: 100,
    });
    if (!name) return;
    const newCase: CaseEntry = {
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : String(Date.now()) + Math.random().toString(36).slice(2),
      name,
      request: e.request,
      expected: e.allowed ? "allow" : "deny",
    };
    const next = [...cases, newCase];
    setCases(next);
    saveCases(appId, next);
    modal.toast(t("rebac.tester.caseSaved"), "success");
  }, [appId, cases, modal, t]);

  const handleDeleteCase = useCallback((id: string) => {
    const next = cases.filter((x) => x.id !== id);
    setCases(next);
    saveCases(appId, next);
  }, [appId, cases]);

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
    <div className="flex flex-col gap-4">
      {/* Title block */}
      <div>
        <h2 className="text-[20px] font-bold text-text-primary mb-1">
          {t("rebac.tester.title")}
        </h2>
        <p className="text-[13px] text-text-muted">
          {t("rebac.tester.subtitle")}
        </p>
      </div>

      {/* 3-column grid: collapses to single column below lg */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr_360px] gap-4 items-start">

        {/* LEFT COLUMN: operation pills + form + run button + elapsed footer */}
        <div className="rounded-xl border border-border bg-surface-1 p-4 flex flex-col gap-3">
          {/* Section header */}
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-text-muted uppercase tracking-wider font-semibold">
              {t("rebac.tester.section.input")}
            </span>
          </div>

          {/* Operation mode pills */}
          <div className="flex items-center gap-1 p-1 rounded-md bg-surface-2 self-start">
            {(["check", "list-objects", "list-users"] as const).map((op) => (
              <button
                key={op}
                type="button"
                onClick={() => setOperation(op)}
                className={`px-3 py-1 rounded text-[12px] font-mono transition-colors ${
                  operation === op
                    ? "bg-surface-1 text-text-primary shadow-sm"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                {op}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-2">
            {operation !== "list-users" && (
              <LabeledInput
                label={t("rebac.tuples.columns.user")}
                value={form.user}
                onChange={(v) => setForm((f) => ({ ...f, user: v }))}
                placeholder="user:alice"
                mono
              />
            )}
            <LabeledInput
              label={
                operation === "list-objects"
                  ? t("rebac.tester.objectType")
                  : t("rebac.tester.object")
              }
              value={form.object}
              onChange={(v) => setForm((f) => ({ ...f, object: v }))}
              placeholder={operation === "list-objects" ? "document" : "document:d1"}
              mono
            />
            <LabeledInput
              label={t("rebac.tuples.columns.relation")}
              value={form.relation}
              onChange={(v) => setForm((f) => ({ ...f, relation: v }))}
              placeholder="viewer"
              mono
            />
            {operation === "list-users" && (
              <LabeledInput
                label={t("rebac.tester.userFilter")}
                value={form.userFilter ?? ""}
                onChange={(v) => setForm((f) => ({ ...f, userFilter: v }))}
                placeholder="user (optional)"
                mono
              />
            )}
          </div>

          <details className="rounded-lg border border-border bg-surface-2">
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

          <button
            type="button"
            className="inline-flex items-center justify-center gap-1.5 w-full px-4 py-2 rounded-lg text-[13px] font-medium bg-accent text-white hover:bg-accent-hover disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            onClick={() => void runOperation()}
            disabled={!formValid || running}
          >
            <Play className="w-3.5 h-3.5" />
            {t("rebac.tester.run")}
          </button>

          {/* Elapsed footer */}
          {elapsedMs !== null && (
            <p className="text-[11px] text-text-muted text-right">
              {(t("rebac.tester.elapsed") as string).replace("{ms}", elapsedMs.toFixed(1))}
            </p>
          )}
        </div>

        {/* CENTER COLUMN: result banner + NL explanation tree */}
        <div className="rounded-xl border border-border bg-surface-1 p-4 flex flex-col gap-3">
          {/* Section header */}
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-text-muted uppercase tracking-wider font-semibold">
              {t("rebac.tester.section.result")}
            </span>
            {currentModelId && (
              <span className="text-[11px] text-text-muted font-mono">
                model · {truncateModelId(currentModelId)}
              </span>
            )}
          </div>

          {operation === "check" && (
            checkResult ? (
              <div
                role="status"
                aria-live="polite"
                className="flex flex-col gap-3"
              >
                {/* Big result banner */}
                <div className="flex items-start gap-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                    checkResult.allowed ? "bg-success/10" : "bg-danger/10"
                  }`}>
                    {checkResult.allowed
                      ? <CheckCircle2 className="w-6 h-6 text-success" />
                      : <XCircle className="w-6 h-6 text-danger" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className={`text-[28px] font-bold leading-none ${
                      checkResult.allowed ? "text-success" : "text-danger"
                    }`}>
                      {checkResult.allowed ? "ALLOWED" : "DENIED"}
                    </h3>
                    <p className="text-[13px] mt-2 text-text-secondary">
                      <span className="font-mono">{form.user}</span>
                      {" "}
                      {checkResult.allowed ? t("rebac.tester.has") : t("rebac.tester.lacks")}
                      {" "}
                      <span className="font-mono">{form.relation}</span>
                      {" "}{t("rebac.tester.on")}{" "}
                      <span className="font-mono">{form.object}</span>
                    </p>
                    {checkResult.resolution && (
                      <p className="text-[11px] text-text-muted font-mono mt-1">
                        {checkResult.resolution}
                      </p>
                    )}
                  </div>
                </div>

                {/* NL explanation tree — shown only when allowed and expand tree is available */}
                {checkResult.allowed && expand && (
                  <div className="mt-1 pt-4 border-t border-border">
                    <h4 className="text-[12px] font-semibold text-text-muted uppercase tracking-wider mb-3">
                      {t("rebac.tester.whyAllowed")}
                    </h4>
                    <BizExplanationTree
                      steps={explainExpand(expand, {
                        user: form.user,
                        relation: form.relation,
                        object: form.object,
                      }, locale === "zh" ? "zh" : "en")}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-border/40 bg-surface-2/50 p-6 flex items-center justify-center min-h-[120px]">
                <p className="text-[13px] text-text-muted">
                  {running ? "…" : t("rebac.tester.check")}
                </p>
              </div>
            )
          )}
          {operation === "list-objects" && listObjectsResult && (
            <ListObjectsResultPanel result={listObjectsResult} t={t} />
          )}
          {operation === "list-users" && listUsersResult && (
            <ListUsersResultPanel result={listUsersResult} t={t} />
          )}
          {(operation === "list-objects" || operation === "list-users") && !listObjectsResult && !listUsersResult && (
            <div className="rounded-lg border border-border/40 bg-surface-2/50 p-6 flex items-center justify-center min-h-[120px]">
              <p className="text-[13px] text-text-muted">
                {running ? "…" : t("rebac.tester.check")}
              </p>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: decision-path graph (Check only) */}
        <div className="rounded-xl border border-border bg-surface-1 p-4 flex flex-col gap-3">
          {/* Section header */}
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-text-muted uppercase tracking-wider font-semibold">
              {t("rebac.tester.section.graph")}
            </span>
            {operation === "check" && expand && (
              <span className="text-[11px] text-text-muted">
                {countHops(expand)}{" "}{t("rebac.tester.hops").replace("{n}", "").trim()}
                {checkResult?.allowed && ` · ${t("rebac.tester.matchedRule")} 1`}
              </span>
            )}
          </div>

          {operation === "check" ? (
            <BizDecisionPathGraph
              root={expand ?? undefined}
              highlightUser={form.user}
              matchedRule={checkResult?.allowed ? 1 : undefined}
              className="border-0 bg-transparent p-0 shadow-none"
              hideHeader
            />
          ) : (
            <p className="text-[12px] text-text-muted text-center py-8">
              {t("rebac.tester.graphCheckOnly")}
            </p>
          )}
        </div>
      </div>

      {/* History + Cases — below the 3-column area */}
      <BizTesterHistorySidebar
        history={history}
        cases={cases as SidebarCaseEntry[]}
        onLoadFromHistory={loadFromHistory}
        onSaveCase={(e) => void handleSaveCase(e)}
        onDeleteCase={handleDeleteCase}
        onRunAllCases={() => void runAllCases()}
        onClearHistory={clearHistory}
      />
    </div>
  );
}

// ── List result panels ──────────────────────────────────────────────

function ListObjectsResultPanel({
  result,
  t,
}: {
  result: BizListObjectsResult;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const objects = result.objects ?? [];
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-4">
      <h3 className="text-[13px] font-semibold mb-2">
        {objects.length} {t("rebac.tester.matchingObjects")}
      </h3>
      {objects.length === 0 ? (
        <p className="text-[12px] text-text-muted">{t("rebac.tester.noResults")}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {objects.map((obj) => (
            <li key={obj}>
              <TupleChip kind="object" value={obj} />
            </li>
          ))}
        </ul>
      )}
      {result.continuationToken && (
        <p className="text-[11px] text-text-muted mt-2">
          {t("rebac.tester.moreResultsAvailable")}
        </p>
      )}
    </div>
  );
}

function ListUsersResultPanel({
  result,
  t,
}: {
  result: BizListUsersResult;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const users = result.users ?? [];
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-4">
      <h3 className="text-[13px] font-semibold mb-2">
        {users.length} {t("rebac.tester.matchingUsers")}
      </h3>
      {users.length === 0 ? (
        <p className="text-[12px] text-text-muted">{t("rebac.tester.noResults")}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {users.map((user) => (
            <li key={user}>
              <TupleChip kind="user" value={user} />
            </li>
          ))}
        </ul>
      )}
      {result.continuationToken && (
        <p className="text-[11px] text-text-muted mt-2">
          {t("rebac.tester.moreResultsAvailable")}
        </p>
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
