import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { RefreshCw, Eye, RotateCcw } from "lucide-react";
import DataTable, { type Column, useTablePrefs, ColumnsMenu } from "../components/DataTable";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import * as WebhookEventBackend from "../backend/WebhookEventBackend";
import type { WebhookEvent } from "../backend/WebhookEventBackend";

function StatusTag({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    success: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    retrying: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  };
  const cls = colorMap[status] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{status || "unknown"}</span>;
}

export default function WebhookEventListPage() {
  const { t } = useTranslation();
  const modal = useModal();

  const [data, setData] = useState<WebhookEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [replayingId, setReplayingId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [sortField, setSortField] = useState("");
  const [sortOrder, setSortOrder] = useState("");
  const [detailRecord, setDetailRecord] = useState<WebhookEvent | null>(null);
  const prefs = useTablePrefs({ persistKey: "list:webhook-events" });

  const fetchData = useCallback(async (p = page, sf = statusFilter, sField = sortField, sOrder = sortOrder) => {
    setLoading(true);
    try {
      const res = await WebhookEventBackend.getWebhookEvents({
        p,
        pageSize,
        status: sf,
        sortField: sField,
        sortOrder: sOrder,
      });
      if (res.status === "ok") {
        setData(res.data ?? []);
        setTotal(Number(res.data2 ?? 0));
        setStatusFilter(sf);
        setSortField(sField);
        setSortOrder(sOrder);
        setPage(p);
      } else {
        modal.toast(res.msg || t("common.loadFailed" as any), "error");
      }
    } catch {
      modal.toast(t("common.connectFailed" as any), "error");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, sortField, sortOrder, modal]);

  useEffect(() => { fetchData(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReplay = async (record: WebhookEvent) => {
    const eventId = `${record.owner}/${record.name}`;
    setReplayingId(eventId);
    try {
      const res = await WebhookEventBackend.replayWebhookEvent(eventId);
      if (res.status === "ok") {
        modal.toast(t("webhookEvents.field.replaySuccess" as any));
        fetchData();
      } else {
        modal.toast(res.msg || t("webhookEvents.field.replayFailed" as any), "error");
      }
    } catch {
      modal.toast(t("common.connectFailed" as any), "error");
    } finally {
      setReplayingId("");
    }
  };

  const formatJson = (str: string): string => {
    if (!str) return "";
    try { return JSON.stringify(JSON.parse(str), null, 2); } catch { return str; }
  };

  const columns: Column<WebhookEvent>[] = [
    {
      key: "webhookName", title: t("webhookEvents.field.webhookName" as any), width: "220px",
      render: (_, r) => {
        if (!r.webhookName) return <span className="text-text-muted">{"\u2014"}</span>;
        const parts = r.webhookName.split("/");
        const shortName = parts[parts.length - 1];
        return <Link to={`/webhooks/${encodeURIComponent(shortName)}`} className="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{shortName}</Link>;
      },
    },
    {
      key: "organization", title: t("col.organization" as any), width: "160px",
      render: (_, r) => r.organization ? <Link to={`/organizations/admin/${r.organization}`} className="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{r.organization}</Link> : <span className="text-text-muted">{"\u2014"}</span>,
    },
    {
      key: "status", title: t("webhookEvents.field.status" as any), width: "140px",
      render: (_, r) => <StatusTag status={r.status} />,
    },
    {
      key: "attemptCount", title: t("webhookEvents.field.attemptCount" as any), sortable: true, width: "140px",
    },
    {
      key: "nextRetryTime", title: t("webhookEvents.field.nextRetryTime" as any), sortable: true, width: "180px",
      render: (_, r) => <span className="text-[12px] text-text-muted font-mono">{r.nextRetryTime ? new Date(r.nextRetryTime).toLocaleString() : "\u2014"}</span>,
    },
    {
      key: "__actions", fixed: "right" as const, title: t("common.action" as any), width: "140px",
      render: (_, r) => {
        const eventId = `${r.owner}/${r.name}`;
        return (
          <div className="flex items-center gap-1">
            <button onClick={(e) => { e.stopPropagation(); setDetailRecord(r); }} className="rounded p-1.5 text-text-muted hover:text-accent hover:bg-accent/10 transition-colors" title={t("common.view" as any)}><Eye size={14} /></button>
            <button onClick={(e) => { e.stopPropagation(); handleReplay(r); }} disabled={replayingId === eventId} className="rounded p-1.5 text-text-muted hover:text-warning hover:bg-warning/10 transition-colors disabled:opacity-50" title={t("webhookEvents.field.replay" as any)}><RotateCcw size={14} /></button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("webhookEvents.title" as any)}</h1>
          <p className="text-[13px] text-text-muted mt-0.5">{t("webhookEvents.subtitle" as any)}</p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button whileHover={{ rotate: 180 }} transition={{ duration: 0.3 }} onClick={() => fetchData(page)} className="rounded-lg border border-border p-2 text-text-muted hover:bg-surface-2 transition-colors" title={t("common.refresh")}><RefreshCw size={15} /></motion.button>
          <ColumnsMenu columns={columns} hidden={prefs.hidden} onToggle={prefs.toggleHidden} onResetWidths={prefs.resetWidths} />
        </div>
      </div>
      <DataTable
        columns={columns}
        data={data}
        rowKey="name"
        loading={loading}
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={(p) => fetchData(p)}
        onSort={(sort) => fetchData(1, statusFilter, sort.field, sort.order)}
        emptyText={t("common.noData")}
        hidden={prefs.hidden}
        widths={prefs.widths}
        onWidthChange={prefs.setWidth}
        resizable
      />

      {/* Detail Drawer / Modal */}
      {detailRecord && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDetailRecord(null)} />
          <div className="relative w-full max-w-2xl bg-surface shadow-xl overflow-y-auto">
            <div className="sticky top-0 bg-surface border-b border-border px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">{t("webhookEvents.field.detail" as any)}</h2>
              <button onClick={() => setDetailRecord(null)} className="rounded p-1.5 text-text-muted hover:bg-surface-2 transition-colors">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-[13px]">
                <div>
                  <span className="text-text-muted">{t("webhookEvents.field.webhookName" as any)}</span>
                  <p className="font-medium mt-1">{detailRecord.webhookName || "\u2014"}</p>
                </div>
                <div>
                  <span className="text-text-muted">{t("col.organization" as any)}</span>
                  <p className="font-medium mt-1">{detailRecord.organization || "\u2014"}</p>
                </div>
                <div>
                  <span className="text-text-muted">{t("webhookEvents.field.status" as any)}</span>
                  <div className="mt-1"><StatusTag status={detailRecord.status} /></div>
                </div>
                <div>
                  <span className="text-text-muted">{t("webhookEvents.field.attemptCount" as any)}</span>
                  <p className="font-medium mt-1">{detailRecord.attemptCount ?? 0}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-text-muted">{t("webhookEvents.field.nextRetryTime" as any)}</span>
                  <p className="font-medium mt-1">{detailRecord.nextRetryTime ? new Date(detailRecord.nextRetryTime).toLocaleString() : "\u2014"}</p>
                </div>
              </div>
              <div>
                <span className="text-[13px] text-text-muted">{t("webhookEvents.field.payload" as any)}</span>
                <pre className="mt-1 rounded-lg bg-surface-2 p-4 text-[11px] font-mono overflow-x-auto max-h-[300px]">{formatJson(detailRecord.payload)}</pre>
              </div>
              <div>
                <span className="text-[13px] text-text-muted">{t("webhookEvents.field.lastError" as any)}</span>
                <pre className="mt-1 rounded-lg bg-surface-2 p-4 text-[11px] font-mono overflow-x-auto max-h-[200px]">{detailRecord.lastError || "\u2014"}</pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
