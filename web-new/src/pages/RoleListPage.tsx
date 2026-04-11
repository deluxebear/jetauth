import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, RefreshCw, Trash2, Pencil } from "lucide-react";
import DataTable, { type Column } from "../components/DataTable";
import StatusBadge from "../components/StatusBadge";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityList } from "../hooks/useEntityList";
import { useOrganization } from "../OrganizationContext";
import * as RoleBackend from "../backend/RoleBackend";
import type { Role } from "../backend/RoleBackend";

export default function RoleListPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const modal = useModal();
  const { getNewEntityOwner } = useOrganization();

  const list = useEntityList<Role>({
    queryKey: "roles",
    fetchFn: RoleBackend.getRoles,
  });

  const handleAdd = async () => {
    const role = RoleBackend.newRole(getNewEntityOwner());
    const res = await RoleBackend.addRole(role);
    if (res.status === "ok") {
      navigate(`/roles/${role.owner}/${role.name}`, { state: { mode: "add" } });
    } else {
      modal.toast(res.msg || t("common.addFailed" as any), "error");
    }
  };

  const handleDelete = (record: Role, e: React.MouseEvent) => {
    e.stopPropagation();
    modal.showConfirm(
      `${t("common.confirmDelete")} [${record.displayName || record.name}]`,
      async () => {
        const res = await RoleBackend.deleteRole(record);
        if (res.status === "ok") list.refetch();
        else modal.toast(res.msg || t("common.deleteFailed" as any), "error");
      }
    );
  };

  const columns: Column<Role>[] = [
    {
      key: "name", title: t("col.name" as any), sortable: true, filterable: true, fixed: "left" as const, width: "150px",
      render: (_, r) => <Link to={`/roles/${r.owner}/${encodeURIComponent(r.name)}`} className="font-mono font-medium text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{r.name}</Link>,
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
    {
      key: "users", title: t("roles.field.users" as any), sortable: true, filterable: true,
      render: (_, r) => <span className="text-[12px] text-text-muted">{r.users?.length ?? 0}</span>,
    },
    {
      key: "groups", title: t("roles.field.groups" as any), sortable: true, filterable: true,
      render: (_, r) => <span className="text-[12px] text-text-muted">{r.groups?.length ?? 0}</span>,
    },
    {
      key: "roles", title: t("roles.field.roles" as any), sortable: true, filterable: true,
      render: (_, r) => <span className="text-[12px] text-text-muted">{r.roles?.length ?? 0}</span>,
    },
    {
      key: "domains", title: t("roles.field.domains" as any), sortable: true, filterable: true,
      render: (_, r) => <span className="text-[12px] text-text-muted">{r.domains?.length ?? 0}</span>,
    },
    {
      key: "isEnabled", title: t("col.isEnabled" as any), sortable: true, width: "120px",
      render: (_, r) => <StatusBadge status={r.isEnabled ? "active" : "inactive"} label={r.isEnabled ? t("common.enabled" as any) : t("common.disabled" as any)} />,
    },
    {
      key: "__actions", fixed: "right" as const, title: t("common.action" as any), width: "110px",
      render: (_, r) => (
        <div className="flex items-center gap-1">
          <Link to={`/roles/${r.owner}/${encodeURIComponent(r.name)}`} className="rounded p-1.5 text-text-muted hover:text-warning hover:bg-warning/10 transition-colors" title={t("common.edit")} onClick={(e) => e.stopPropagation()}><Pencil size={14} /></Link>
          <button onClick={(e) => handleDelete(r, e)} className="rounded p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors" title={t("common.delete")}><Trash2 size={14} /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("roles.title" as any)}</h1>
          <p className="text-[13px] text-text-muted mt-0.5">{t("roles.subtitle" as any)}</p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button whileHover={{ rotate: 180 }} transition={{ duration: 0.3 }} onClick={list.refetch} className="rounded-lg border border-border p-2 text-text-muted hover:bg-surface-2 transition-colors" title={t("common.refresh")}><RefreshCw size={15} /></motion.button>
          <button onClick={handleAdd} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover transition-colors"><Plus size={15} /> {t("roles.add" as any)}</button>
        </div>
      </div>
      <DataTable columns={columns} data={list.items} rowKey="name" loading={list.loading} page={list.page} pageSize={list.pageSize} total={list.total} onPageChange={list.setPage} onSort={list.handleSort} onFilter={list.handleFilter} emptyText={t("common.noData")} />
    </div>
  );
}
