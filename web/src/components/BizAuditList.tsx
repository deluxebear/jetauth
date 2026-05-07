import { useCallback, useEffect, useState } from "react";
import { Plus, Minus, ExternalLink } from "lucide-react";
import { useTranslation } from "../i18n";
import { useModal } from "./Modal";
import * as BizBackend from "../backend/BizBackend";
import type { BizTupleAuditEvent, BizAuditOp } from "../backend/BizBackend";
import TupleChip from "./TupleChip";
import { downloadFile } from "../utils/download";

interface Props { appId: string; }

const PAGE_SIZE = 50;

export default function BizAuditList({ appId }: Props) {
  const { t } = useTranslation();
  const modal = useModal();
  const [events, setEvents] = useState<BizTupleAuditEvent[]>([]);
  const [filter, setFilter] = useState<BizAuditOp | "all">("all");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const f = filter === "all" ? {} : { op: filter };
      const res = await BizBackend.listBizTupleAudit(appId, f, { offset: 0, limit: PAGE_SIZE });
      if (res.status === "ok" && res.data) setEvents(res.data.events);
      else modal.toast(res.msg || t("rebac.common.error"), "error");
    } finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, filter]);

  useEffect(() => { void refresh(); }, [refresh]);

  const exportCsv = () => {
    const header = "at_time,op,actor,user,relation,object\n";
    const rows = events.map((e) =>
      [e.atTime, e.op, e.actorUser ?? "", e.user, e.relation, e.object].map(csvEscape).join(",")
    ).join("\n");
    downloadFile(`${appId.replace(/\//g, "-")}-audit.csv`, header + rows, "text/csv");
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[20px] font-bold mb-1">{t("rebac.audit.title")}</h2>
          <p className="text-[13px] text-text-muted">{t("rebac.audit.subtitle")}</p>
        </div>
        <button onClick={exportCsv}
          className="px-3 py-1.5 rounded-md border border-border text-[13px] flex items-center gap-2">
          <ExternalLink className="w-4 h-4" /> {t("rebac.audit.exportCsv")}
        </button>
      </div>

      <div className="rounded-xl border border-border bg-surface-1 p-3">
        <div className="flex items-center gap-1 mb-3">
          {(["all", "write", "delete"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setFilter(k)}
              className={`px-3 py-1 rounded-full text-[12px] font-mono border ${
                filter === k ? "bg-accent/15 text-accent border-accent/40" : "border-border text-text-muted"
              }`}>
              {filter === k ? "● " : ""}{k}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-[12px] text-text-muted p-6 text-center">{t("rebac.common.loading")}</p>
        ) : events.length === 0 ? (
          <p className="text-[12px] text-text-muted p-6 text-center">{t("rebac.audit.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {events.map((e) => (
              <li key={e.id} className="flex items-center gap-3 text-[12px] flex-wrap">
                <span className="font-mono text-text-muted w-20 shrink-0">{formatTime(e.atTime)}</span>
                <span className={`p-1 rounded ${e.op === "write" ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}>
                  {e.op === "write" ? <Plus className="w-3 h-3"/> : <Minus className="w-3 h-3"/>}
                </span>
                {e.actorUser && <span className="text-text-secondary truncate max-w-[140px]">{e.actorUser}</span>}
                <TupleChip kind="user" value={e.user} />
                <TupleChip kind="relation" value={e.relation} />
                <TupleChip kind="object" value={e.object} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function formatTime(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function csvEscape(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
