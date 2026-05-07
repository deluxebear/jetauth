import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { RefreshCw, Trash2, Pencil, GitBranch } from "lucide-react";
import DataTable, { type Column, useTablePrefs, ColumnsMenu } from "../components/DataTable";
import { BulkDeleteBar } from "../components/BulkDeleteBar";
import EntryFilterBar from "../components/EntryFilterBar";
import { useBulkDelete } from "../hooks/useBulkDelete";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityList } from "../hooks/useEntityList";
import { useOrganization } from "../OrganizationContext";
import * as EntryBackend from "../backend/EntryBackend";
import type { Entry, EntryAdvancedFilter } from "../backend/EntryBackend";

export default function EntryListPage() {
  const { t } = useTranslation();
  const modal = useModal();
  const { getRequestOwner } = useOrganization();
  const owner = getRequestOwner();

  // Advanced filter state lives here so the bar can drive both the fetch
  // and the cache key. Empty fields are omitted to keep the URL compact
  // and to let the backend short-circuit to the un-filtered hot path.
  const [filter, setFilter] = useState<EntryAdvancedFilter>({});

  // Wrap getEntries so the advanced filter rides along on every fetch.
  // useEntityList passes its own params (owner/p/pageSize/sort/field/value);
  // we merge the filter on top, and surface it in extraKeys so React Query
  // refetches when filter content changes.
  const fetchEntries = useCallback(
    (params: Parameters<typeof EntryBackend.getEntries>[0]) =>
      EntryBackend.getEntries({ ...params, ...filter }),
    [filter],
  );

  const list = useEntityList<Entry>({
    queryKey: "entries",
    fetchFn: fetchEntries,
    extraKeys: [filter],
  });
  const prefs = useTablePrefs({ persistKey: "list:entries" });
  const bulkDelete = useBulkDelete<Entry>(EntryBackend.deleteEntry, list.refetch);

  const handleDelete = (record: Entry, e: React.MouseEvent) => {
    e.stopPropagation();
    modal.showConfirm(
      `${t("common.confirmDelete")} [${record.displayName || record.name}]`,
      async () => {
        const res = await EntryBackend.deleteEntry(record);
        if (res.status === "ok") list.refetch();
        else modal.toast(res.msg || t("common.deleteFailed"), "error");
      }
    );
  };

  const columns: Column<Entry>[] = [
    {
      key: "owner", title: t("col.organization"), sortable: true, filterable: true, width: "130px",
      render: (_, r) => <Link to={`/organizations/admin/${r.owner}`} className="text-accent hover:underline text-[12px]" onClick={(e) => e.stopPropagation()}>{r.owner}</Link>,
    },
    {
      key: "name", title: t("col.name"), sortable: true, filterable: true, fixed: "left" as const, width: "160px",
      render: (_, r) => <Link to={`/entries/${r.owner}/${r.name}`} className="font-mono font-medium text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{r.name}</Link>,
    },
    {
      key: "createdTime", title: t("col.created"), sortable: true, width: "180px",
      render: (_, r) => <span className="text-[12px] text-text-muted font-mono">{r.createdTime ? new Date(r.createdTime).toLocaleString() : "\u2014"}</span>,
    },
    {
      key: "provider", title: t("col.provider"), sortable: true, filterable: true, width: "160px",
      render: (_, r) => r.provider ? (
        <Link to={`/providers/${r.owner}/${r.provider}`} className="text-accent hover:underline text-[12px]" onClick={(e) => e.stopPropagation()}>{r.provider}</Link>
      ) : null,
    },
    { key: "type", title: t("col.type"), sortable: true, filterable: true, width: "140px" },
    {
      key: "clientIp", title: t("entries.field.clientIp"), sortable: true, filterable: true, width: "140px",
      render: (_, r) => r.clientIp ? (
        <a target="_blank" rel="noreferrer" href={`https://db-ip.com/${r.clientIp}`} className="text-accent hover:underline text-[12px] font-mono">{r.clientIp}</a>
      ) : null,
    },
    { key: "userAgent", title: t("entries.field.userAgent"), sortable: true, filterable: true },
    {
      key: "message", title: t("entries.field.message"), sortable: true, filterable: true,
      render: (_, r) => r.message ? (
        <span className="text-[12px] text-text-secondary" title={r.message}>
          {r.message.length > 60 ? r.message.substring(0, 60) + "..." : r.message}
        </span>
      ) : null,
    },
    {
      key: "__actions", fixed: "right" as const, title: t("common.action"), width: "150px",
      render: (_, r) => (
        <div className="flex items-center gap-1">
          {r.type === "session" && (
            <Link
              to={`/entries/${r.owner}/${r.name}/graph`}
              className="rounded p-1.5 text-text-muted hover:text-accent hover:bg-accent/10 transition-colors"
              title={t("entries.action.viewSessionGraph")}
              onClick={(e) => e.stopPropagation()}
            >
              <GitBranch size={14} />
            </Link>
          )}
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
          <h1 className="text-xl font-bold tracking-tight">{t("entries.title")}</h1>
          <p className="text-[13px] text-text-muted mt-0.5">{t("entries.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button whileHover={{ rotate: 180 }} transition={{ duration: 0.3 }} onClick={list.refetch} className="rounded-lg border border-border p-2 text-text-muted hover:bg-surface-2 transition-colors" title={t("common.refresh")}><RefreshCw size={15} /></motion.button>
          <ColumnsMenu columns={columns} hidden={prefs.hidden} onToggle={prefs.toggleHidden} onResetWidths={prefs.resetWidths} />
        </div>
      </div>
      <EntryFilterBar owner={owner} value={filter} onChange={setFilter} />
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
