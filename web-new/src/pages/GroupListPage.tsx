import { useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, RefreshCw, Trash2, Pencil } from "lucide-react";
import DataTable, { type Column } from "../components/DataTable";
import StatusBadge from "../components/StatusBadge";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityList } from "../hooks/useEntityList";
import { useOrganization } from "../OrganizationContext";
import * as GroupBackend from "../backend/GroupBackend";
import type { Group } from "../backend/GroupBackend";

export default function GroupListPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const modal = useModal();
  const { selectedOrg, setSelectedOrg, isAll, getNewEntityOwner } = useOrganization();

  // Switch org context when navigated with ?owner=xxx
  useEffect(() => {
    const ownerParam = searchParams.get("owner");
    if (ownerParam && ownerParam !== selectedOrg) {
      setSelectedOrg(ownerParam);
    }
  }, [searchParams]);

  const list = useEntityList<Group>({
    queryKey: "groups",
    fetchFn: GroupBackend.getGroups,
    owner: isAll ? "" : selectedOrg,
  });

  const handleAdd = async () => {
    const group = GroupBackend.newGroup(getNewEntityOwner());
    const res = await GroupBackend.addGroup(group);
    if (res.status === "ok") {
      navigate(`/groups/${group.owner}/${group.name}`, { state: { mode: "add" } });
    } else {
      modal.toast(res.msg || t("common.addFailed" as any), "error");
    }
  };

  const handleDelete = (record: Group, e: React.MouseEvent) => {
    e.stopPropagation();
    if (record.haveChildren) {
      modal.toast("Cannot delete: group has children", "error");
      return;
    }
    modal.showConfirm(`${t("common.confirmDelete")} [${record.displayName || record.name}]`, async () => {
      const res = await GroupBackend.deleteGroup(record);
      if (res.status === "ok") list.refetch();
      else modal.toast(res.msg || t("common.deleteFailed" as any), "error");
    });
  };

  const columns: Column<Group>[] = [
    {
      key: "name",
      title: t("col.name" as any),
      sortable: true,
      filterable: true,
      width: "150px",
      render: (_, r) => (
        <Link to={`/groups/${r.owner}/${r.name}`} className="font-mono font-medium text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
          {r.name}
        </Link>
      ),
    },
    { key: "owner", title: t("col.organization" as any), sortable: true, filterable: true, width: "140px" },
    {
      key: "createdTime",
      title: t("col.created" as any),
      sortable: true,
      width: "160px",
      render: (_, r) => <span className="text-[12px] text-text-muted font-mono">{r.createdTime ? new Date(r.createdTime).toLocaleString() : "—"}</span>,
    },
    {
      key: "updatedTime",
      title: t("col.updated" as any),
      sortable: true,
      width: "160px",
      render: (_, r) => <span className="text-[12px] text-text-muted font-mono">{r.updatedTime ? new Date(r.updatedTime).toLocaleString() : "—"}</span>,
    },
    { key: "displayName", title: t("col.displayName" as any), sortable: true, filterable: true },
    {
      key: "type",
      title: t("col.type" as any),
      width: "100px",
      render: (_, r) => (
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
          r.type === "Physical" ? "bg-info/15 text-info border border-info/20" : "bg-surface-3 text-text-muted border border-border"
        }`}>
          {r.type ?? "Virtual"}
        </span>
      ),
    },
    {
      key: "parentId",
      title: t("col.parent" as any),
      width: "140px",
      render: (_, r) => <span className="text-text-secondary text-[12px]">{r.parentId || "—"}</span>,
    },
    {
      key: "users",
      title: t("col.users" as any),
      render: (_, r) => {
        const users = r.users ?? [];
        if (users.length === 0) return <span className="text-text-muted text-[12px]">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {users.slice(0, 3).map((u, i) => (
              <span key={i} className="rounded bg-surface-3 px-1.5 py-0.5 text-[11px] font-mono text-text-secondary">{u}</span>
            ))}
            {users.length > 3 && <span className="text-[11px] text-text-muted">+{users.length - 3}</span>}
          </div>
        );
      },
    },
    {
      key: "isEnabled",
      title: t("col.enabled" as any),
      width: "80px",
      render: (_, r) => <StatusBadge status={r.isEnabled ? "active" : "inactive"} label={r.isEnabled ? "ON" : "OFF"} />,
    },
    {
      key: "__actions",
      fixed: "right" as const,
      title: t("common.action" as any),
      width: "90px",
      render: (_, r) => (
        <div className="flex items-center gap-1">
          <Link to={`/groups/${r.owner}/${r.name}`} className="rounded p-1.5 text-text-muted hover:text-warning hover:bg-warning/10 transition-colors" onClick={(e) => e.stopPropagation()}>
            <Pencil size={14} />
          </Link>
          <button
            onClick={(e) => handleDelete(r, e)}
            disabled={r.haveChildren}
            className="rounded p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title={r.haveChildren ? "Cannot delete: has sub-groups" : "Delete"}
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
          <h1 className="text-xl font-bold tracking-tight">{t("groups.title" as any)}</h1>
          <p className="text-[13px] text-text-muted mt-0.5">{t("groups.subtitle" as any)}</p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button whileHover={{ rotate: 180 }} transition={{ duration: 0.3 }} onClick={list.refetch} className="rounded-lg border border-border p-2 text-text-muted hover:bg-surface-2 transition-colors">
            <RefreshCw size={15} />
          </motion.button>
          <button onClick={handleAdd} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover transition-colors">
            <Plus size={15} />
            {t("groups.add" as any)}
          </button>
        </div>
      </div>

      <DataTable columns={columns} data={list.items} rowKey="name" loading={list.loading} page={list.page} pageSize={list.pageSize} total={list.total} onPageChange={list.setPage} onSort={list.handleSort} onFilter={list.handleFilter} emptyText={t("common.noData")} />
    </div>
  );
}
