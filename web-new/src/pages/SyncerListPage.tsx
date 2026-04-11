import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, RefreshCw, Trash2, Pencil, Play } from "lucide-react";
import DataTable, { type Column } from "../components/DataTable";
import StatusBadge from "../components/StatusBadge";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityList } from "../hooks/useEntityList";
import { useOrganization } from "../OrganizationContext";
import * as SyncerBackend from "../backend/SyncerBackend";
import type { Syncer } from "../backend/SyncerBackend";

export default function SyncerListPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const modal = useModal();
  const { getNewEntityOwner } = useOrganization();

  const list = useEntityList<Syncer>({
    queryKey: "syncers",
    fetchFn: SyncerBackend.getSyncers,
  });

  const handleAdd = async () => {
    const syncer = SyncerBackend.newSyncer(getNewEntityOwner());
    const res = await SyncerBackend.addSyncer(syncer);
    if (res.status === "ok") {
      navigate(`/syncers/${syncer.name}`, { state: { mode: "add" } });
    } else {
      modal.toast(res.msg || t("common.addFailed" as any), "error");
    }
  };

  const handleDelete = (record: Syncer, e: React.MouseEvent) => {
    e.stopPropagation();
    modal.showConfirm(
      `${t("common.confirmDelete")} [${record.name}]`,
      async () => {
        const res = await SyncerBackend.deleteSyncer(record);
        if (res.status === "ok") list.refetch();
        else modal.toast(res.msg || t("common.deleteFailed" as any), "error");
      }
    );
  };

  const handleSync = async (record: Syncer, e: React.MouseEvent) => {
    e.stopPropagation();
    const res = await SyncerBackend.runSyncer("admin", record.name);
    if (res.status === "ok") {
      modal.toast(t("syncers.field.syncSuccess" as any));
    } else {
      modal.toast(res.msg || t("syncers.field.syncFailed" as any), "error");
    }
  };

  const columns: Column<Syncer>[] = [
    {
      key: "name", title: t("col.name" as any), sortable: true, filterable: true, fixed: "left" as const, width: "150px",
      render: (_, r) => <Link to={`/syncers/${encodeURIComponent(r.name)}`} className="font-mono font-medium text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{r.name}</Link>,
    },
    {
      key: "organization", title: t("col.organization" as any), sortable: true, filterable: true, width: "120px",
      render: (_, r) => <Link to={`/organizations/${r.organization}`} className="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{r.organization}</Link>,
    },
    {
      key: "createdTime", title: t("col.created" as any), sortable: true, width: "160px",
      render: (_, r) => <span className="text-[12px] text-text-muted font-mono">{r.createdTime ? new Date(r.createdTime).toLocaleString() : "\u2014"}</span>,
    },
    {
      key: "type", title: t("col.type" as any), sortable: true, width: "100px",
    },
    {
      key: "databaseType", title: t("syncers.field.databaseType" as any), sortable: true, width: "130px",
    },
    {
      key: "host", title: t("syncers.field.host" as any), sortable: true, filterable: true, width: "120px",
    },
    {
      key: "port", title: t("syncers.field.port" as any), sortable: true, filterable: true, width: "100px",
    },
    {
      key: "user", title: t("col.user" as any), sortable: true, filterable: true, width: "120px",
    },
    {
      key: "password", title: t("syncers.field.password" as any), sortable: true, filterable: true, width: "120px",
    },
    {
      key: "database", title: t("syncers.field.database" as any), sortable: true, width: "120px",
    },
    {
      key: "table", title: t("syncers.field.table" as any), sortable: true, width: "120px",
    },
    {
      key: "syncInterval", title: t("syncers.field.syncInterval" as any), sortable: true, filterable: true, width: "140px",
    },
    {
      key: "isEnabled", title: t("col.isEnabled" as any), sortable: true, width: "120px",
      render: (_, r) => <StatusBadge status={r.isEnabled ? "active" : "inactive"} label={r.isEnabled ? t("common.enabled" as any) : t("common.disabled" as any)} />,
    },
    {
      key: "__actions", fixed: "right" as const, title: t("common.action" as any), width: "140px",
      render: (_, r) => (
        <div className="flex items-center gap-1">
          <button onClick={(e) => handleSync(r, e)} className="rounded p-1.5 text-text-muted hover:text-accent hover:bg-accent/10 transition-colors" title={t("syncers.field.sync" as any)}><Play size={14} /></button>
          <Link to={`/syncers/${encodeURIComponent(r.name)}`} className="rounded p-1.5 text-text-muted hover:text-warning hover:bg-warning/10 transition-colors" title={t("common.edit")} onClick={(e) => e.stopPropagation()}><Pencil size={14} /></Link>
          <button onClick={(e) => handleDelete(r, e)} className="rounded p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors" title={t("common.delete")}><Trash2 size={14} /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("syncers.title" as any)}</h1>
          <p className="text-[13px] text-text-muted mt-0.5">{t("syncers.subtitle" as any)}</p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button whileHover={{ rotate: 180 }} transition={{ duration: 0.3 }} onClick={list.refetch} className="rounded-lg border border-border p-2 text-text-muted hover:bg-surface-2 transition-colors" title={t("common.refresh")}><RefreshCw size={15} /></motion.button>
          <button onClick={handleAdd} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover transition-colors"><Plus size={15} /> {t("syncers.add" as any)}</button>
        </div>
      </div>
      <DataTable columns={columns} data={list.items} rowKey="name" loading={list.loading} page={list.page} pageSize={list.pageSize} total={list.total} onPageChange={list.setPage} onSort={list.handleSort} onFilter={list.handleFilter} emptyText={t("common.noData")} />
    </div>
  );
}
