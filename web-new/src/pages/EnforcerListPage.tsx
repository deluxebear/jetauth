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
import * as EnforcerBackend from "../backend/EnforcerBackend";
import type { Enforcer } from "../backend/EnforcerBackend";

export default function EnforcerListPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const modal = useModal();
  const { getNewEntityOwner } = useOrganization();

  const list = useEntityList<Enforcer>({
    queryKey: "enforcers",
    fetchFn: EnforcerBackend.getEnforcers,
  });
  const prefs = useTablePrefs({ persistKey: "list:enforcers" });
  const bulkDelete = useBulkDelete<Enforcer>(EnforcerBackend.deleteEnforcer, list.refetch);

  const handleAdd = async () => {
    const enforcer = EnforcerBackend.newEnforcer(getNewEntityOwner());
    const res = await EnforcerBackend.addEnforcer(enforcer);
    if (res.status === "ok") {
      navigate(`/enforcers/${enforcer.owner}/${enforcer.name}`, { state: { mode: "add" } });
    } else {
      modal.toast(res.msg || t("common.addFailed" as any), "error");
    }
  };

  const handleDelete = (record: Enforcer, e: React.MouseEvent) => {
    e.stopPropagation();
    modal.showConfirm(
      `${t("common.confirmDelete")} [${record.displayName || record.name}]`,
      async () => {
        const res = await EnforcerBackend.deleteEnforcer(record);
        if (res.status === "ok") list.refetch();
        else modal.toast(res.msg || t("common.deleteFailed" as any), "error");
      }
    );
  };

  const columns: Column<Enforcer>[] = [
    {
      key: "name", title: t("col.name" as any), sortable: true, filterable: true, fixed: "left" as const, width: "200px",
      render: (_, r) => <Link to={`/enforcers/${r.owner}/${r.name}`} className="font-mono font-medium text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{r.name}</Link>,
    },
    {
      key: "owner", title: t("col.organization" as any), sortable: true, filterable: true, width: "120px",
      render: (_, r) => <span className="text-[12px] text-text-secondary">{r.owner === "admin" ? t("common.adminShared" as any) : r.owner}</span>,
    },
    {
      key: "createdTime", title: t("col.created" as any), sortable: true, width: "160px",
      render: (_, r) => <span className="text-[12px] text-text-muted font-mono">{r.createdTime ? new Date(r.createdTime).toLocaleString() : "\u2014"}</span>,
    },
    { key: "displayName", title: t("col.displayName" as any), sortable: true, filterable: true },
    {
      key: "model", title: t("col.model" as any), sortable: true, filterable: true, width: "250px",
      render: (_, r) => r.model ? <Link to={`/models/${r.model}`} className="text-accent hover:underline text-[12px]" onClick={(e) => e.stopPropagation()}>{r.model}</Link> : <span className="text-text-muted text-[12px]">{"\u2014"}</span>,
    },
    {
      key: "adapter", title: t("col.adapter" as any), sortable: true, filterable: true, width: "250px",
      render: (_, r) => r.adapter ? <Link to={`/adapters/${r.adapter}`} className="text-accent hover:underline text-[12px]" onClick={(e) => e.stopPropagation()}>{r.adapter}</Link> : <span className="text-text-muted text-[12px]">{"\u2014"}</span>,
    },
    {
      key: "__actions", fixed: "right" as const, title: t("common.action" as any), width: "110px",
      render: (_, r) => (
        <div className="flex items-center gap-1">
          <Link to={`/enforcers/${r.owner}/${r.name}`} className="rounded p-1.5 text-text-muted hover:text-warning hover:bg-warning/10 transition-colors" title={t("common.edit")} onClick={(e) => e.stopPropagation()}><Pencil size={14} /></Link>
          <button onClick={(e) => handleDelete(r, e)} className="rounded p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors" title={t("common.delete")}><Trash2 size={14} /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("enforcers.title" as any)}</h1>
          <p className="text-[13px] text-text-muted mt-0.5">{t("enforcers.subtitle" as any)}</p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button whileHover={{ rotate: 180 }} transition={{ duration: 0.3 }} onClick={list.refetch} className="rounded-lg border border-border p-2 text-text-muted hover:bg-surface-2 transition-colors" title={t("common.refresh")}><RefreshCw size={15} /></motion.button>
          <ColumnsMenu columns={columns} hidden={prefs.hidden} onToggle={prefs.toggleHidden} onResetWidths={prefs.resetWidths} />
          <button onClick={handleAdd} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover transition-colors"><Plus size={15} /> {t("enforcers.add" as any)}</button>
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
