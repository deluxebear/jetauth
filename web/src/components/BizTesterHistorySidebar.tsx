// History + saved-cases sidebar for BizReBACTester — the collapsible
// panel below the 3-column tester area. Extracted from BizReBACTester
// to keep that file focused on request/response logic.
import { useState } from "react";
import { History, Trash2, Play, CheckCircle2, XCircle, Star } from "lucide-react";
import { useTranslation } from "../i18n";

// Local type mirrors — defined here to avoid a circular dep with
// BizBackend (these are internal tester shapes, not backend DTOs).

interface CheckFormState {
  user: string;
  object: string;
  relation: string;
  contextualTuplesJson: string;
  contextJson: string;
  userFilter?: string;
}

export interface HistoryEntry {
  at: number;
  request: CheckFormState;
  allowed: boolean;
  resolution: string;
}

export interface CaseEntry {
  id: string;
  name: string;
  request: CheckFormState;
  expected: "allow" | "deny";
  lastRun?: { allowed: boolean; at: number };
}

interface Props {
  history: HistoryEntry[];
  cases: CaseEntry[];
  onLoadFromHistory: (entry: HistoryEntry) => void;
  onSaveCase: (entry: HistoryEntry) => void;
  onDeleteCase: (id: string) => void;
  onRunAllCases: () => void;
  onClearHistory: () => void;
}

export default function BizTesterHistorySidebar({
  history,
  cases,
  onLoadFromHistory,
  onSaveCase,
  onDeleteCase,
  onRunAllCases,
  onClearHistory,
}: Props) {
  const { t } = useTranslation();
  const [showHistory, setShowHistory] = useState(false);
  const [view, setView] = useState<"history" | "cases">("history");

  return (
    <>
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] border border-border hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          onClick={() => setShowHistory((s) => !s)}
        >
          <History className="w-3.5 h-3.5" />
          {t("rebac.tester.recent")} ({history.length})
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
                onClick={onRunAllCases}
              >
                <Play className="w-3 h-3" />
                {t("rebac.tester.runAll")}
              </button>
            )}
          </div>
          {view === "history" ? (
            <>
              {history.length === 0 ? (
                <p className="text-[12px] text-text-muted p-2">(empty)</p>
              ) : (
                <>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-danger px-2 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded"
                      onClick={onClearHistory}
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
                        onClick={() => onLoadFromHistory(e)}
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
                            onSaveCase(e);
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
          ) : (
            <>
              {cases.length === 0 ? (
                <p className="text-[12px] text-text-muted p-2">
                  {t("rebac.tester.casesEmpty")}
                </p>
              ) : (
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
                          onClick={() => onDeleteCase(c.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
