import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, RefreshCw, Trash2, Pencil } from "lucide-react";
import DataTable, { type Column } from "../components/DataTable";
import StatusBadge from "../components/StatusBadge";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityList } from "../hooks/useEntityList";
import { useOrganization } from "../OrganizationContext";
import * as WebhookBackend from "../backend/WebhookBackend";
import type { Webhook } from "../backend/WebhookBackend";

export default function WebhookListPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const modal = useModal();
  const { getNewEntityOwner } = useOrganization();

  const list = useEntityList<Webhook>({
    queryKey: "webhooks",
    fetchFn: WebhookBackend.getWebhooks,
  });

  const handleAdd = async () => {
    const webhook = WebhookBackend.newWebhook(getNewEntityOwner());
    const res = await WebhookBackend.addWebhook(webhook);
    if (res.status === "ok") {
      navigate(`/webhooks/${webhook.name}`, { state: { mode: "add" } });
    } else {
      modal.toast(res.msg || t("common.addFailed" as any), "error");
    }
  };

  const handleDelete = (record: Webhook, e: React.MouseEvent) => {
    e.stopPropagation();
    modal.showConfirm(
      `${t("common.confirmDelete")} [${record.name}]`,
      async () => {
        const res = await WebhookBackend.deleteWebhook(record);
        if (res.status === "ok") list.refetch();
        else modal.toast(res.msg || t("common.deleteFailed" as any), "error");
      }
    );
  };

  const columns: Column<Webhook>[] = [
    {
      key: "name", title: t("col.name" as any), sortable: true, filterable: true, fixed: "left" as const, width: "150px",
      render: (_, r) => <Link to={`/webhooks/${encodeURIComponent(r.name)}`} className="font-mono font-medium text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{r.name}</Link>,
    },
    {
      key: "organization", title: t("col.organization" as any), sortable: true, filterable: true, width: "110px",
      render: (_, r) => <Link to={`/organizations/admin/${r.organization}`} className="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{r.organization}</Link>,
    },
    {
      key: "createdTime", title: t("col.created" as any), sortable: true, width: "150px",
      render: (_, r) => <span className="text-[12px] text-text-muted font-mono">{r.createdTime ? new Date(r.createdTime).toLocaleString() : "\u2014"}</span>,
    },
    {
      key: "url", title: t("webhooks.field.url" as any), sortable: true, filterable: true, width: "200px",
      render: (_, r) => <a href={r.url} target="_blank" rel="noreferrer" className="text-accent hover:underline truncate block max-w-[180px]" title={r.url}>{r.url}</a>,
    },
    {
      key: "method", title: t("webhooks.field.method" as any), sortable: true, filterable: true, width: "100px",
    },
    {
      key: "contentType", title: t("webhooks.field.contentType" as any), sortable: true, width: "140px",
    },
    {
      key: "events", title: t("webhooks.field.events" as any), sortable: true, filterable: true,
      render: (_, r) => (
        <div className="flex flex-wrap gap-1">
          {(r.events ?? []).map((ev) => (
            <span key={ev} className="inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">{ev}</span>
          ))}
        </div>
      ),
    },
    {
      key: "isUserExtended", title: t("webhooks.field.isUserExtended" as any), sortable: true, width: "140px",
      render: (_, r) => <StatusBadge status={r.isUserExtended ? "active" : "inactive"} label={r.isUserExtended ? t("common.enabled" as any) : t("common.disabled" as any)} />,
    },
    {
      key: "singleOrgOnly", title: t("webhooks.field.singleOrgOnly" as any), sortable: true, width: "140px",
      render: (_, r) => <StatusBadge status={r.singleOrgOnly ? "active" : "inactive"} label={r.singleOrgOnly ? t("common.enabled" as any) : t("common.disabled" as any)} />,
    },
    {
      key: "isEnabled", title: t("col.isEnabled" as any), sortable: true, width: "120px",
      render: (_, r) => <StatusBadge status={r.isEnabled ? "active" : "inactive"} label={r.isEnabled ? t("common.enabled" as any) : t("common.disabled" as any)} />,
    },
    {
      key: "__actions", fixed: "right" as const, title: t("common.action" as any), width: "110px",
      render: (_, r) => (
        <div className="flex items-center gap-1">
          <Link to={`/webhooks/${encodeURIComponent(r.name)}`} className="rounded p-1.5 text-text-muted hover:text-warning hover:bg-warning/10 transition-colors" title={t("common.edit")} onClick={(e) => e.stopPropagation()}><Pencil size={14} /></Link>
          <button onClick={(e) => handleDelete(r, e)} className="rounded p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors" title={t("common.delete")}><Trash2 size={14} /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("webhooks.title" as any)}</h1>
          <p className="text-[13px] text-text-muted mt-0.5">{t("webhooks.subtitle" as any)}</p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button whileHover={{ rotate: 180 }} transition={{ duration: 0.3 }} onClick={list.refetch} className="rounded-lg border border-border p-2 text-text-muted hover:bg-surface-2 transition-colors" title={t("common.refresh")}><RefreshCw size={15} /></motion.button>
          <button onClick={handleAdd} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover transition-colors"><Plus size={15} /> {t("webhooks.add" as any)}</button>
        </div>
      </div>
      <DataTable columns={columns} data={list.items} rowKey="name" loading={list.loading} page={list.page} pageSize={list.pageSize} total={list.total} onPageChange={list.setPage} onSort={list.handleSort} onFilter={list.handleFilter} emptyText={t("common.noData")} persistKey="list:webhooks" resizable columnsToggle />
    </div>
  );
}
