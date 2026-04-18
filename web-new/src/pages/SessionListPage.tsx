import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { RefreshCw, Trash2, X, ChevronDown, ChevronUp } from "lucide-react";
import DataTable, { type Column } from "../components/DataTable";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityList } from "../hooks/useEntityList";
import * as SessionBackend from "../backend/SessionBackend";
import type { Session } from "../backend/SessionBackend";

/** Render session ID tags with collapse when > 3 */
function SessionIdCell({
  sessionIds,
  onDelete,
  t,
}: {
  sessionIds: string[];
  onDelete: (sid: string) => void;
  t: (key: string) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const ids = sessionIds || [];
  const threshold = 3;
  const visible = expanded ? ids : ids.slice(0, threshold);
  const hasMore = ids.length > threshold;

  if (ids.length === 0) {
    return <span className="text-[12px] text-text-muted">{t("sessions.noSessions" as any)}</span>;
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-1">
        {visible.map((sid, idx) => (
          <span
            key={idx}
            className="inline-flex items-center gap-1 rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-mono text-text-secondary"
          >
            {sid}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(sid);
              }}
              className="rounded-full p-0.5 hover:bg-danger/20 hover:text-danger transition-colors"
              title={t("common.delete")}
            >
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      {hasMore && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className="inline-flex items-center gap-0.5 text-[11px] text-accent hover:text-accent-hover transition-colors self-start"
        >
          {expanded ? (
            <>
              <ChevronUp size={12} />
              {t("sessions.collapse" as any)}
            </>
          ) : (
            <>
              <ChevronDown size={12} />
              {t("sessions.showAll" as any)} ({ids.length})
            </>
          )}
        </button>
      )}
    </div>
  );
}

export default function SessionListPage() {
  const { t } = useTranslation();
  const modal = useModal();
  const [detailSession, setDetailSession] = useState<Session | null>(null);

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
        if (res.status === "ok") {
          modal.toast(t("common.deleteSuccess" as any), "success");
          list.refetch();
        } else {
          modal.toast(res.msg || t("common.deleteFailed" as any), "error");
        }
      }
    );
  };

  const handleDeleteSessionId = (record: Session, sessionId: string) => {
    modal.showConfirm(
      `${t("common.confirmDelete")} ${t("sessions.field.sessionId" as any)}: ${sessionId}`,
      async () => {
        const res = await SessionBackend.deleteSession(record, sessionId);
        if (res.status === "ok") {
          modal.toast(t("common.deleteSuccess" as any), "success");
          list.refetch();
        } else {
          modal.toast(res.msg || t("common.deleteFailed" as any), "error");
        }
      }
    );
  };

  const columns: Column<Session>[] = [
    {
      key: "name",
      title: t("col.user" as any),
      sortable: true,
      filterable: true,
      fixed: "left" as const,
      width: "150px",
      render: (_, r) => (
        <Link
          to={`/users/${r.owner}/${r.name}`}
          className="text-accent hover:underline font-medium text-[13px]"
          onClick={(e) => e.stopPropagation()}
        >
          {r.name}
        </Link>
      ),
    },
    {
      key: "owner",
      title: t("col.organization" as any),
      sortable: true,
      filterable: true,
      width: "110px",
      render: (_, r) => (
        <Link
          to={`/organizations/admin/${r.owner}`}
          className="text-accent hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {r.owner}
        </Link>
      ),
    },
    {
      key: "application",
      title: t("col.application" as any),
      sortable: true,
      filterable: true,
      width: "140px",
      render: (_, r) => (
        <Link
          to={`/applications/${r.owner}/${r.application}`}
          className="text-accent hover:underline text-[12px]"
          onClick={(e) => e.stopPropagation()}
        >
          {r.application}
        </Link>
      ),
    },
    {
      key: "createdTime",
      title: t("col.created" as any),
      sortable: true,
      width: "180px",
      render: (_, r) => (
        <span className="text-[12px] text-text-muted font-mono">
          {r.createdTime ? new Date(r.createdTime).toLocaleString() : "\u2014"}
        </span>
      ),
    },
    {
      key: "sessionId",
      title: t("sessions.field.sessionId" as any),
      width: "280px",
      render: (_, r) => (
        <SessionIdCell
          sessionIds={r.sessionId || []}
          onDelete={(sid) => handleDeleteSessionId(r, sid)}
          t={t}
        />
      ),
    },
    {
      key: "__actions",
      fixed: "right" as const,
      title: t("common.action" as any),
      width: "100px",
      render: (_, r) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDetailSession(r);
            }}
            className="text-accent hover:text-accent-hover text-[12px] font-medium transition-colors"
          >
            {t("common.detail" as any)}
          </button>
          <button
            onClick={(e) => handleDeleteSession(r, e)}
            className="rounded p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
            title={t("common.delete")}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            {t("sessions.title" as any)}
          </h1>
          <p className="text-[13px] text-text-muted mt-0.5">
            {t("sessions.subtitle" as any)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ rotate: 180 }}
            transition={{ duration: 0.3 }}
            onClick={list.refetch}
            className="rounded-lg border border-border p-2 text-text-muted hover:bg-surface-2 transition-colors"
            title={t("common.refresh")}
          >
            <RefreshCw size={15} />
          </motion.button>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={list.items}
        rowKey="name"
        loading={list.loading}
        page={list.page}
        pageSize={list.pageSize}
        total={list.total}
        onPageChange={list.setPage}
        onSort={list.handleSort}
        onFilter={list.handleFilter}
        emptyText={t("common.noData")}
        persistKey="list:sessions"
        resizable
        columnsToggle
      />

      {/* Detail Drawer */}
      {detailSession && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setDetailSession(null)}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-xl bg-surface-0 shadow-2xl border-l border-border overflow-y-auto"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between bg-surface-0 border-b border-border px-6 py-4">
              <h2 className="text-lg font-bold">
                {t("common.detail" as any)}
              </h2>
              <button
                onClick={() => setDetailSession(null)}
                className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {(
                [
                  [t("sessions.field.name" as any), "name"],
                  [t("sessions.field.owner" as any), "owner"],
                  [t("sessions.field.application" as any), "application"],
                  [t("sessions.field.createdTime" as any), "createdTime"],
                ] as [string, string][]
              ).map(([label, key]) => (
                <div
                  key={key}
                  className="grid grid-cols-[140px_1fr] gap-2 text-[13px] border-b border-border-subtle pb-3"
                >
                  <span className="font-medium text-text-secondary">
                    {label}
                  </span>
                  <span className="font-mono text-text-primary break-all">
                    {key === "owner" ? (
                      <Link
                        to={`/organizations/admin/${detailSession.owner}`}
                        className="text-accent hover:underline"
                      >
                        {detailSession.owner}
                      </Link>
                    ) : key === "name" ? (
                      <Link
                        to={`/users/${detailSession.owner}/${detailSession.name}`}
                        className="text-accent hover:underline"
                      >
                        {detailSession.name}
                      </Link>
                    ) : key === "application" ? (
                      <Link
                        to={`/applications/${detailSession.owner}/${detailSession.application}`}
                        className="text-accent hover:underline"
                      >
                        {detailSession.application}
                      </Link>
                    ) : (
                      String(
                        (detailSession as Record<string, unknown>)[key] ?? "\u2014"
                      )
                    )}
                  </span>
                </div>
              ))}

              {/* Session IDs section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-text-secondary">
                    {t("sessions.field.sessionId" as any)}
                  </span>
                  <span className="text-[11px] text-text-muted rounded-full bg-surface-3 px-2 py-0.5">
                    {(t("sessions.sessionCount" as any) as string).replace(
                      "{count}",
                      String(detailSession.sessionId?.length || 0)
                    )}
                  </span>
                </div>
                <div className="rounded-lg bg-surface-2 p-3 space-y-1.5">
                  {(detailSession.sessionId || []).length === 0 ? (
                    <span className="text-[12px] text-text-muted">
                      {t("sessions.noSessions" as any)}
                    </span>
                  ) : (
                    (detailSession.sessionId || []).map((sid, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-md bg-surface-0 px-3 py-2 border border-border-subtle"
                      >
                        <span className="text-[12px] font-mono text-text-primary break-all">
                          {sid}
                        </span>
                        <button
                          onClick={() => handleDeleteSessionId(detailSession, sid)}
                          className="ml-2 shrink-0 rounded p-1 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                          title={t("common.delete")}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
