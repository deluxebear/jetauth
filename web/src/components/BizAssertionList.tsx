import { useCallback, useEffect, useState } from "react";
import { Plus, Play, Trash2, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { useTranslation } from "../i18n";
import { useModal } from "./Modal";
import * as BizBackend from "../backend/BizBackend";
import type { BizReBACAssertion, BizAssertionRunResult } from "../backend/BizBackend";
import TupleChip from "./TupleChip";
import BizAssertionEditor from "./BizAssertionEditor";

interface Props { appId: string; }

export default function BizAssertionList({ appId }: Props) {
  const { t } = useTranslation();
  const modal = useModal();
  const [assertions, setAssertions] = useState<BizReBACAssertion[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Map<string, BizAssertionRunResult>>(new Map());
  const [editorOpen, setEditorOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await BizBackend.listBizAssertions(appId);
      if (res.status === "ok" && Array.isArray(res.data)) {
        setAssertions(res.data);
      }
    } finally { setLoading(false); }
  }, [appId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const runAll = async () => {
    setRunning(true);
    try {
      const res = await BizBackend.runBizAssertions(appId);
      if (res.status !== "ok" || !Array.isArray(res.data)) {
        modal.toast(res.msg || "run failed", "error"); return;
      }
      const map = new Map<string, BizAssertionRunResult>();
      for (const r of res.data) map.set(r.id, r);
      setResults(map);
      const passed = res.data.filter((r) => r.pass).length;
      modal.toast(`${passed}/${res.data.length} ${t("rebac.assertions.passed")}`, "success");
    } finally { setRunning(false); }
  };

  const deleteOne = async (id: string) => {
    modal.showConfirm(t("rebac.assertions.confirmDelete"), async () => {
      const res = await BizBackend.deleteBizAssertion(appId, id);
      if (res.status === "ok") {
        setAssertions((prev) => prev.filter((a) => a.id !== id));
      } else {
        modal.toast(res.msg || "delete failed", "error");
      }
    });
  };

  const passCount = Array.from(results.values()).filter((r) => r.pass).length;
  const failCount = results.size - passCount;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[20px] font-bold mb-1">{t("rebac.assertions.title")}</h2>
          <p className="text-[13px] text-text-muted">{t("rebac.assertions.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setEditorOpen(true)}
            className="px-3 py-1.5 rounded-md border border-border text-[13px] flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> {t("rebac.assertions.addAction")}
          </button>
          <button
            type="button"
            onClick={() => void runAll()}
            disabled={running || assertions.length === 0}
            className="px-3 py-1.5 rounded-md bg-accent text-white text-[13px] flex items-center gap-2 disabled:opacity-50"
          >
            <Play className="w-4 h-4" /> {t("rebac.assertions.runAll")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label={t("rebac.assertions.total")} value={assertions.length} />
        <Stat label={t("rebac.assertions.passed")} value={passCount} tone="success" />
        <Stat label={t("rebac.assertions.failed")} value={failCount} tone="danger" />
      </div>

      <div className="rounded-xl border border-border bg-surface-1">
        {loading ? (
          <p className="text-[12px] text-text-muted p-6 text-center">{t("rebac.common.loading")}</p>
        ) : assertions.length === 0 ? (
          <p className="text-[12px] text-text-muted p-6 text-center">{t("rebac.assertions.empty")}</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-[11px] text-text-muted uppercase tracking-wide">
                <th className="text-left p-3 w-8"></th>
                <th className="text-left p-3">USER</th>
                <th className="text-left p-3">RELATION</th>
                <th className="text-left p-3">OBJECT</th>
                <th className="text-left p-3">EXPECTED</th>
                <th className="text-left p-3">ACTUAL</th>
                <th className="text-left p-3 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {assertions.map((a) => {
                const r = results.get(a.id);
                return (
                  <tr key={a.id} className="border-t border-border">
                    <td className="p-3">
                      {!r ? (
                        <span className="w-4 h-4 inline-block" aria-label="not run" />
                      ) : r.pass ? (
                        <CheckCircle2 className="w-4 h-4 text-success" aria-label="pass" />
                      ) : r.error ? (
                        <AlertCircle className="w-4 h-4 text-warning" aria-label="error" />
                      ) : (
                        <XCircle className="w-4 h-4 text-danger" aria-label="fail" />
                      )}
                    </td>
                    <td className="p-3"><TupleChip kind="user" value={a.user} /></td>
                    <td className="p-3"><TupleChip kind="relation" value={a.relation} /></td>
                    <td className="p-3"><TupleChip kind="object" value={a.object} /></td>
                    <td className="p-3 text-[12px] font-mono">{String(a.expected)}</td>
                    <td className="p-3 text-[12px] font-mono">
                      {r ? String(r.actual) : "—"}
                    </td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => void deleteOne(a.id)}
                        aria-label={t("rebac.common.delete")}
                        className="p-1 rounded hover:bg-danger/10 text-text-muted hover:text-danger"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editorOpen && (
        <BizAssertionEditor
          appId={appId}
          onClose={() => setEditorOpen(false)}
          onSaved={() => { setEditorOpen(false); void refresh(); }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "success" | "danger" }) {
  const color =
    tone === "success" ? "text-success"
      : tone === "danger" ? "text-danger"
      : "text-text-primary";
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-4">
      <div className="text-[11px] text-text-muted uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-[28px] font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
