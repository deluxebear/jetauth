import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, RefreshCw, Trash2, Pencil } from "lucide-react";
import DataTable, { type Column, useTablePrefs, ColumnsMenu } from "../components/DataTable";
import { BulkDeleteBar } from "../components/BulkDeleteBar";
import { useBulkDelete } from "../hooks/useBulkDelete";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityList } from "../hooks/useEntityList";
import { useOrganization } from "../OrganizationContext";
import * as SubscriptionBackend from "../backend/SubscriptionBackend";
import type { Subscription } from "../backend/SubscriptionBackend";

const STATE_STYLES: Record<string, string> = {
  Active: "bg-success/15 text-success",
  Pending: "bg-warning/15 text-warning",
  Upcoming: "bg-info/15 text-info",
  Expired: "bg-surface-3 text-text-muted",
  Error: "bg-danger/15 text-danger",
  Suspended: "bg-surface-3 text-text-muted",
};

export default function SubscriptionListPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const modal = useModal();
  const { getNewEntityOwner } = useOrganization();

  const list = useEntityList<Subscription>({
    queryKey: "subscriptions",
    fetchFn: SubscriptionBackend.getSubscriptions,
  });
  const prefs = useTablePrefs({ persistKey: "list:subscriptions" });
  const bulkDelete = useBulkDelete<Subscription>(SubscriptionBackend.deleteSubscription, list.refetch);

  const handleAdd = async () => {
    const sub = SubscriptionBackend.newSubscription(getNewEntityOwner());
    const res = await SubscriptionBackend.addSubscription(sub);
    if (res.status === "ok") {
      navigate(`/subscriptions/${sub.owner}/${sub.name}`, { state: { mode: "add" } });
    } else {
      modal.toast(res.msg || t("common.addFailed" as any), "error");
    }
  };

  const handleDelete = (record: Subscription, e: React.MouseEvent) => {
    e.stopPropagation();
    modal.showConfirm(
      `${t("common.confirmDelete")} [${record.displayName || record.name}]`,
      async () => {
        const res = await SubscriptionBackend.deleteSubscription(record);
        if (res.status === "ok") list.refetch();
        else modal.toast(res.msg || t("common.deleteFailed" as any), "error");
      }
    );
  };

  const columns: Column<Subscription>[] = [
    {
      key: "name", title: t("col.name" as any), sortable: true, filterable: true, fixed: "left" as const, width: "150px",
      render: (_, r) => <Link to={`/subscriptions/${r.owner}/${encodeURIComponent(r.name)}`} className="font-mono font-medium text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{r.name}</Link>,
    },
    {
      key: "owner", title: t("col.organization" as any), sortable: true, filterable: true, width: "120px",
      render: (_, r) => <span className="text-[12px] text-text-secondary">{r.owner === "admin" ? t("common.adminShared" as any) : r.owner}</span>,
    },
    {
      key: "createdTime", title: t("col.created" as any), sortable: true, width: "160px",
      render: (_, r) => <span className="text-[12px] text-text-muted font-mono">{r.createdTime ? new Date(r.createdTime).toLocaleString() : "\u2014"}</span>,
    },
    { key: "displayName", title: t("col.displayName" as any), sortable: true, filterable: true, width: "200px" },
    { key: "period", title: t("subscriptions.field.period" as any), filterable: true, width: "120px" },
    {
      key: "startTime", title: t("subscriptions.field.startTime" as any), filterable: true, width: "140px",
      render: (_, r) => <span className="text-[12px] text-text-muted font-mono">{r.startTime ? new Date(r.startTime).toLocaleDateString() : "\u2014"}</span>,
    },
    {
      key: "endTime", title: t("subscriptions.field.endTime" as any), filterable: true, width: "140px",
      render: (_, r) => <span className="text-[12px] text-text-muted font-mono">{r.endTime ? new Date(r.endTime).toLocaleDateString() : "\u2014"}</span>,
    },
    {
      key: "plan", title: t("subscriptions.field.plan" as any), filterable: true, width: "140px",
      render: (_, r) => r.plan ? <Link to={`/plans/${r.plan}`} className="text-accent hover:underline text-[12px]" onClick={(e) => e.stopPropagation()}>{r.plan}</Link> : <span className="text-text-muted">{"\u2014"}</span>,
    },
    {
      key: "user", title: t("subscriptions.field.user" as any), filterable: true, width: "140px",
      render: (_, r) => r.user ? <Link to={`/users/${r.owner}/${r.user}`} className="text-accent hover:underline text-[12px]" onClick={(e) => e.stopPropagation()}>{r.user}</Link> : <span className="text-text-muted">{"\u2014"}</span>,
    },
    {
      key: "state", title: t("col.state" as any), sortable: true, filterable: true, width: "120px",
      render: (_, r) => (
        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${STATE_STYLES[r.state] || "bg-surface-3 text-text-muted"}`}>
          {r.state}
        </span>
      ),
    },
    {
      key: "__actions", fixed: "right" as const, title: t("common.action" as any), width: "110px",
      render: (_, r) => (
        <div className="flex items-center gap-1">
          <Link to={`/subscriptions/${r.owner}/${encodeURIComponent(r.name)}`} className="rounded p-1.5 text-text-muted hover:text-warning hover:bg-warning/10 transition-colors" title={t("common.edit")} onClick={(e) => e.stopPropagation()}><Pencil size={14} /></Link>
          <button onClick={(e) => handleDelete(r, e)} className="rounded p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors" title={t("common.delete")}><Trash2 size={14} /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("subscriptions.title" as any)}</h1>
          <p className="text-[13px] text-text-muted mt-0.5">{t("subscriptions.subtitle" as any)}</p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button whileHover={{ rotate: 180 }} transition={{ duration: 0.3 }} onClick={list.refetch} className="rounded-lg border border-border p-2 text-text-muted hover:bg-surface-2 transition-colors" title={t("common.refresh")}><RefreshCw size={15} /></motion.button>
          <ColumnsMenu columns={columns} hidden={prefs.hidden} onToggle={prefs.toggleHidden} onResetWidths={prefs.resetWidths} />
          <button onClick={handleAdd} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover transition-colors"><Plus size={15} /> {t("subscriptions.add" as any)}</button>
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
        onPageSizeChange={list.setPageSize}
        onSort={list.handleSort}
        onFilter={list.handleFilter}
        emptyText={t("common.noData")}
        hidden={prefs.hidden}
        widths={prefs.widths}
        onWidthChange={prefs.setWidth}
        resizable
        selectable
        bulkActions={({ selected, clear }) => (
          <BulkDeleteBar selected={selected} clear={clear} onDelete={bulkDelete} />
        )}
      />
    </div>
  );
}
