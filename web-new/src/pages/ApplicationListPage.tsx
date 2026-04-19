import { useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, RefreshCw, Trash2, Pencil, Copy } from "lucide-react";
import DataTable, { type Column, useTablePrefs, ColumnsMenu } from "../components/DataTable";
import { BulkDeleteBar } from "../components/BulkDeleteBar";
import { useBulkDelete } from "../hooks/useBulkDelete";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityList } from "../hooks/useEntityList";
import { useOrganization } from "../OrganizationContext";
import * as AppBackend from "../backend/ApplicationBackend";
import type { Application } from "../backend/ApplicationBackend";

export default function ApplicationListPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const modal = useModal();
  const { selectedOrg, isAll, getNewEntityOwner } = useOrganization();

  // Original uses get-applications for "All", get-organization-applications for specific org
  const fetchFn = useCallback((params: Parameters<typeof AppBackend.getApplications>[0]) => {
    if (isAll) {
      return AppBackend.getApplications({ ...params, owner: "admin" });
    }
    return AppBackend.getApplicationsByOrganization({ ...params, owner: "admin", organization: selectedOrg });
  }, [isAll, selectedOrg]);

  // Use selectedOrg as owner so query key changes when org changes, triggering re-fetch
  const list = useEntityList<Application>({
    queryKey: "applications",
    fetchFn,
    owner: isAll ? "admin" : selectedOrg,
  });
  const prefs = useTablePrefs({ persistKey: "list:applications" });
  const bulkDelete = useBulkDelete<Application>(AppBackend.deleteApplication, list.refetch);

  const handleAdd = async () => {
    const app = AppBackend.newApplication(getNewEntityOwner());
    const res = await AppBackend.addApplication(app);
    if (res.status === "ok") {
      navigate(`/applications/${app.organization}/${app.name}`, { state: { mode: "add" } });
    } else {
      modal.toast(res.msg || t("common.addFailed" as any), "error");
    }
  };

  const handleCopy = async (record: Application, e: React.MouseEvent) => {
    e.stopPropagation();
    const rand = Math.random().toString(36).substring(2, 8);
    const copied: Application = {
      ...record,
      name: `${record.name}_${rand}`,
      displayName: `Copy of ${record.displayName || record.name}`,
      clientId: "",
      clientSecret: "",
    };
    const res = await AppBackend.addApplication(copied);
    if (res.status === "ok") {
      navigate(`/applications/${copied.organization}/${copied.name}`, { state: { mode: "add" } });
    } else {
      modal.toast(res.msg || t("common.addFailed" as any), "error");
    }
  };

  const handleDelete = (record: Application, e: React.MouseEvent) => {
    e.stopPropagation();
    if (record.name === "app-built-in") {
      modal.toast(t("apps.cannotDeleteBuiltIn" as any), "error");
      return;
    }
    modal.showConfirm(
      `${t("common.confirmDelete")} [${record.displayName || record.name}]`,
      async () => {
        const res = await AppBackend.deleteApplication(record);
        if (res.status === "ok") list.refetch();
        else modal.toast(res.msg || t("common.deleteFailed" as any), "error");
      }
    );
  };

  const columns: Column<Application>[] = [
    {
      key: "name", title: t("col.name" as any), sortable: true, filterable: true, fixed: "left" as const, width: "150px",
      render: (_, r) => <Link to={`/applications/${r.organization}/${r.name}`} className="font-mono font-medium text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{r.name}</Link>,
    },
    {
      key: "createdTime", title: t("col.created" as any), sortable: true, width: "160px",
      render: (_, r) => <span className="text-[12px] text-text-muted font-mono">{r.createdTime ? new Date(r.createdTime).toLocaleString() : "—"}</span>,
    },
    { key: "displayName", title: t("col.displayName" as any), sortable: true, filterable: true },
    {
      key: "category", title: t("col.category" as any), sortable: true, filterable: true, width: "120px",
      render: (_, r) => (
        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${r.category === "Agent" ? "bg-emerald-500/15 text-emerald-600" : "bg-surface-3 text-text-secondary"}`}>
          {r.category || "Default"}
        </span>
      ),
    },
    { key: "type", title: t("col.type" as any), sortable: true, filterable: true, width: "100px" },
    {
      key: "logo", title: t("col.logo" as any), width: "200px",
      render: (_, r) => r.logo ? <a href={r.logo} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><img src={r.logo} alt="" className="h-6 max-w-[180px] object-contain" /></a> : <span className="text-text-muted text-[12px]">—</span>,
    },
    {
      key: "organization", title: t("col.organization" as any), sortable: true, filterable: true, width: "150px",
      render: (_, r) => <Link to={`/organizations/admin/${r.organization}`} className="text-accent hover:underline text-[12px]" onClick={(e) => e.stopPropagation()}>{r.organization}</Link>,
    },
    {
      key: "providers", title: t("apps.field.providers" as any), filterable: true,
      render: (_, r) => {
        const providers = (r.providers as any[]) ?? [];
        if (providers.length === 0) return <span className="text-text-muted text-[12px]">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {providers.slice(0, 3).map((p: any, i: number) => (
              <span key={i} className="rounded bg-surface-3 px-1.5 py-0.5 text-[11px] font-mono text-text-secondary">{p.name}</span>
            ))}
            {providers.length > 3 && <span className="text-[11px] text-text-muted">+{providers.length - 3}</span>}
          </div>
        );
      },
    },
    {
      key: "__actions", fixed: "right" as const, title: t("common.action" as any), width: "200px",
      render: (_, r) => (
        <div className="flex items-center gap-1">
          <Link to={`/applications/${r.organization}/${r.name}`} className="rounded p-1.5 text-text-muted hover:text-warning hover:bg-warning/10 transition-colors" title={t("common.edit")} onClick={(e) => e.stopPropagation()}><Pencil size={14} /></Link>
          <button onClick={(e) => handleCopy(r, e)} className="rounded p-1.5 text-text-muted hover:text-accent hover:bg-accent/10 transition-colors" title={t("common.copy" as any)}><Copy size={14} /></button>
          <button onClick={(e) => handleDelete(r, e)} disabled={r.name === "app-built-in"} className="rounded p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed" title={t("common.delete")}><Trash2 size={14} /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("apps.title" as any)}</h1>
          <p className="text-[13px] text-text-muted mt-0.5">{t("apps.subtitle" as any)}</p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button whileHover={{ rotate: 180 }} transition={{ duration: 0.3 }} onClick={list.refetch} className="rounded-lg border border-border p-2 text-text-muted hover:bg-surface-2 transition-colors" title={t("common.refresh")}><RefreshCw size={15} /></motion.button>
          <ColumnsMenu columns={columns} hidden={prefs.hidden} onToggle={prefs.toggleHidden} onResetWidths={prefs.resetWidths} />
          <button onClick={handleAdd} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover transition-colors"><Plus size={15} /> {t("apps.add" as any)}</button>
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
