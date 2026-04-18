import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { RefreshCw, Trash2, Pencil } from "lucide-react";
import DataTable, { type Column } from "../components/DataTable";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityList } from "../hooks/useEntityList";
import * as EntryBackend from "../backend/EntryBackend";
import type { Entry } from "../backend/EntryBackend";

export default function EntryListPage() {
  const { t } = useTranslation();
  const modal = useModal();

  const list = useEntityList<Entry>({
    queryKey: "entries",
    fetchFn: EntryBackend.getEntries,
  });

  const handleDelete = (record: Entry, e: React.MouseEvent) => {
    e.stopPropagation();
    modal.showConfirm(
      `${t("common.confirmDelete")} [${record.displayName || record.name}]`,
      async () => {
        const res = await EntryBackend.deleteEntry(record);
        if (res.status === "ok") list.refetch();
        else modal.toast(res.msg || t("common.deleteFailed" as any), "error");
      }
    );
  };

  const columns: Column<Entry>[] = [
    {
      key: "owner", title: t("col.organization" as any), sortable: true, filterable: true, width: "130px",
      render: (_, r) => <Link to={`/organizations/admin/${r.owner}`} className="text-accent hover:underline text-[12px]" onClick={(e) => e.stopPropagation()}>{r.owner}</Link>,
    },
    {
      key: "name", title: t("col.name" as any), sortable: true, filterable: true, fixed: "left" as const, width: "160px",
      render: (_, r) => <Link to={`/entries/${r.owner}/${r.name}`} className="font-mono font-medium text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{r.name}</Link>,
    },
    {
      key: "createdTime", title: t("col.created" as any), sortable: true, width: "180px",
      render: (_, r) => <span className="text-[12px] text-text-muted font-mono">{r.createdTime ? new Date(r.createdTime).toLocaleString() : "\u2014"}</span>,
    },
    {
      key: "provider", title: t("col.provider" as any), sortable: true, filterable: true, width: "160px",
      render: (_, r) => r.provider ? (
        <Link to={`/providers/${r.owner}/${r.provider}`} className="text-accent hover:underline text-[12px]" onClick={(e) => e.stopPropagation()}>{r.provider}</Link>
      ) : null,
    },
    { key: "type", title: t("col.type" as any), sortable: true, filterable: true, width: "140px" },
    {
      key: "clientIp", title: t("entries.field.clientIp" as any), sortable: true, filterable: true, width: "140px",
      render: (_, r) => r.clientIp ? (
        <a target="_blank" rel="noreferrer" href={`https://db-ip.com/${r.clientIp}`} className="text-accent hover:underline text-[12px] font-mono">{r.clientIp}</a>
      ) : null,
    },
    { key: "userAgent", title: t("entries.field.userAgent" as any), sortable: true, filterable: true },
    {
      key: "message", title: t("entries.field.message" as any), sortable: true, filterable: true,
      render: (_, r) => r.message ? (
        <span className="text-[12px] text-text-secondary" title={r.message}>
          {r.message.length > 60 ? r.message.substring(0, 60) + "..." : r.message}
        </span>
      ) : null,
    },
    {
      key: "__actions", fixed: "right" as const, title: t("common.action" as any), width: "120px",
      render: (_, r) => (
        <div className="flex items-center gap-1">
          <Link to={`/entries/${r.owner}/${r.name}`} className="rounded p-1.5 text-text-muted hover:text-warning hover:bg-warning/10 transition-colors" title={t("common.edit")} onClick={(e) => e.stopPropagation()}><Pencil size={14} /></Link>
          <button onClick={(e) => handleDelete(r, e)} className="rounded p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors" title={t("common.delete")}><Trash2 size={14} /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("entries.title" as any)}</h1>
          <p className="text-[13px] text-text-muted mt-0.5">{t("entries.subtitle" as any)}</p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button whileHover={{ rotate: 180 }} transition={{ duration: 0.3 }} onClick={list.refetch} className="rounded-lg border border-border p-2 text-text-muted hover:bg-surface-2 transition-colors" title={t("common.refresh")}><RefreshCw size={15} /></motion.button>
        </div>
      </div>
      <DataTable columns={columns} data={list.items} rowKey="name" loading={list.loading} page={list.page} pageSize={list.pageSize} total={list.total} onPageChange={list.setPage} onSort={list.handleSort} onFilter={list.handleFilter} emptyText={t("common.noData")} persistKey="list:entries" resizable columnsToggle />
    </div>
  );
}
