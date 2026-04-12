import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { RefreshCw, Trash2, X } from "lucide-react";
import DataTable, { type Column } from "../components/DataTable";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityList } from "../hooks/useEntityList";
import * as SessionBackend from "../backend/SessionBackend";
import type { Session } from "../backend/SessionBackend";

export default function SessionListPage() {
  const { t } = useTranslation();
  const modal = useModal();

  const list = useEntityList<Session>({
    queryKey: "sessions",
    fetchFn: SessionBackend.getSessions,
  });

  const handleDeleteSession = (record: Session, e: React.MouseEvent) => {
    e.stopPropagation();
    modal.showConfirm(
      `${t("common.confirmDelete")} [${record.name}]`,
      async () => {
        const res = await SessionBackend.deleteSession(record);
        if (res.status === "ok") list.refetch();
        else modal.toast(res.msg || t("common.deleteFailed" as any), "error");
      }
    );
  };

  const handleDeleteSessionId = (record: Session, sessionId: string) => {
    modal.showConfirm(
      `${t("common.confirmDelete")} ${t("sessions.field.sessionId" as any)}: ${sessionId}`,
      async () => {
        const res = await SessionBackend.deleteSession(record, sessionId);
        if (res.status === "ok") list.refetch();
        else modal.toast(res.msg || t("common.deleteFailed" as any), "error");
      }
    );
  };

  const columns: Column<Session>[] = [
    {
      key: "name", title: t("col.name" as any), sortable: true, filterable: true, fixed: "left" as const, width: "150px",
    },
    {
      key: "owner", title: t("col.organization" as any), sortable: true, filterable: true, width: "110px",
      render: (_, r) => <Link to={`/organizations/admin/${r.owner}`} className="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{r.owner}</Link>,
    },
    {
      key: "createdTime", title: t("col.created" as any), sortable: true, width: "180px",
      render: (_, r) => <span className="text-[12px] text-text-muted font-mono">{r.createdTime ? new Date(r.createdTime).toLocaleString() : "\u2014"}</span>,
    },
    {
      key: "sessionId", title: t("sessions.field.sessionId" as any), sortable: true, width: "180px",
      render: (_, r) => (
        <div className="flex flex-wrap gap-1">
          {(r.sessionId || []).map((sid, idx) => (
            <span key={idx} className="inline-flex items-center gap-1 rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-mono text-text-secondary">
              {sid}
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteSessionId(r, sid); }}
                className="rounded-full p-0.5 hover:bg-danger/20 hover:text-danger transition-colors"
                title={t("common.delete")}
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      ),
    },
    {
      key: "__actions", fixed: "right" as const, title: t("common.action" as any), width: "70px",
      render: (_, r) => (
        <div className="flex items-center gap-1">
          <button onClick={(e) => handleDeleteSession(r, e)} className="rounded p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors" title={t("common.delete")}><Trash2 size={14} /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("sessions.title" as any)}</h1>
          <p className="text-[13px] text-text-muted mt-0.5">{t("sessions.subtitle" as any)}</p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button whileHover={{ rotate: 180 }} transition={{ duration: 0.3 }} onClick={list.refetch} className="rounded-lg border border-border p-2 text-text-muted hover:bg-surface-2 transition-colors" title={t("common.refresh")}><RefreshCw size={15} /></motion.button>
        </div>
      </div>
      <DataTable columns={columns} data={list.items} rowKey="name" loading={list.loading} page={list.page} pageSize={list.pageSize} total={list.total} onPageChange={list.setPage} onSort={list.handleSort} onFilter={list.handleFilter} emptyText={t("common.noData")} />
    </div>
  );
}
