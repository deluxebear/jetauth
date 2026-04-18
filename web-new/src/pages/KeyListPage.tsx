import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, RefreshCw, Trash2, Pencil } from "lucide-react";
import DataTable, { type Column } from "../components/DataTable";
import StatusBadge from "../components/StatusBadge";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityList } from "../hooks/useEntityList";
import { useOrganization } from "../OrganizationContext";
import * as KeyBackend from "../backend/KeyBackend";
import type { Key } from "../backend/KeyBackend";
import { getStoredAccount, isGlobalAdmin } from "../utils/auth";

export default function KeyListPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const modal = useModal();
  const { getNewEntityOwner } = useOrganization();
  const account = getStoredAccount();
  const isAdmin = isGlobalAdmin(account);

  const list = useEntityList<Key>({
    queryKey: "keys",
    fetchFn: KeyBackend.getKeys,
  });

  const handleAdd = async () => {
    const key = KeyBackend.newKey(getNewEntityOwner());
    const res = await KeyBackend.addKey(key);
    if (res.status === "ok") {
      navigate(`/keys/${key.owner}/${key.name}`, { state: { mode: "add" } });
    } else {
      modal.toast(res.msg || t("common.addFailed" as any), "error");
    }
  };

  const handleDelete = (record: Key, e: React.MouseEvent) => {
    e.stopPropagation();
    modal.showConfirm(
      `${t("common.confirmDelete")} [${record.displayName || record.name}]`,
      async () => {
        const res = await KeyBackend.deleteKey(record);
        if (res.status === "ok") {
          list.refetch();
        } else {
          modal.toast(res.msg || t("common.deleteFailed" as any), "error");
        }
      }
    );
  };

  const columns: Column<Key>[] = [
    {
      key: "name",
      title: t("col.name" as any),
      sortable: true,
      filterable: true,
      fixed: "left" as const,
      width: "140px",
      render: (_, r) => (
        <Link to={`/keys/${r.owner}/${r.name}`} className="font-mono font-medium text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
          {r.name}
        </Link>
      ),
    },
    {
      key: "owner",
      title: t("col.organization" as any),
      sortable: true,
      filterable: true,
      width: "150px",
      render: (_, r) => <span className="text-[12px] text-text-secondary">{r.owner === "admin" ? t("common.adminShared" as any) : r.owner}</span>,
    },
    {
      key: "createdTime",
      title: t("col.created" as any),
      sortable: true,
      width: "160px",
      render: (_, r) => <span className="text-[12px] text-text-muted font-mono">{r.createdTime ? new Date(r.createdTime).toLocaleString() : "—"}</span>,
    },
    { key: "displayName", title: t("col.displayName" as any), sortable: true, filterable: true },
    { key: "type", title: t("col.type" as any), sortable: true, filterable: true, width: "120px" },
    {
      key: "accessKey",
      title: t("keys.field.accessKey" as any),
      sortable: true,
      filterable: true,
      width: "150px",
      render: (_, r) => <span className="font-mono text-[11px] text-text-muted truncate block max-w-[140px]">{r.accessKey || "—"}</span>,
    },
    {
      key: "expireTime",
      title: t("keys.field.expireTime" as any),
      sortable: true,
      width: "160px",
      render: (_, r) => <span className="text-[12px] text-text-muted font-mono">{r.expireTime ? new Date(r.expireTime).toLocaleString() : "—"}</span>,
    },
    {
      key: "state",
      title: t("col.state" as any),
      sortable: true,
      filterable: true,
      width: "90px",
      render: (_, r) => <StatusBadge status={r.state === "Active" ? "active" : "inactive"} label={r.state} />,
    },
    {
      key: "__actions",
      fixed: "right" as const,
      title: t("common.action" as any),
      width: "120px",
      render: (_, r) => {
        const canOp = isAdmin || r.owner === account?.owner;
        return (
          <div className="flex items-center gap-1">
            <Link to={`/keys/${r.owner}/${r.name}`} className={`rounded p-1.5 transition-colors ${canOp ? "text-text-muted hover:text-warning hover:bg-warning/10" : "text-text-muted opacity-30 pointer-events-none"}`} title={t("common.edit")} onClick={(e) => e.stopPropagation()}>
              <Pencil size={14} />
            </Link>
            <button onClick={(e) => handleDelete(r, e)} disabled={!canOp} className="rounded p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed" title={t("common.delete")}>
              <Trash2 size={14} />
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("keys.title" as any)}</h1>
          <p className="text-[13px] text-text-muted mt-0.5">{t("keys.subtitle" as any)}</p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button whileHover={{ rotate: 180 }} transition={{ duration: 0.3 }} onClick={list.refetch} className="rounded-lg border border-border p-2 text-text-muted hover:bg-surface-2 transition-colors" title={t("common.refresh")}>
            <RefreshCw size={15} />
          </motion.button>
          <button onClick={handleAdd} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover transition-colors">
            <Plus size={15} /> {t("keys.add" as any)}
          </button>
        </div>
      </div>
      <DataTable columns={columns} data={list.items} rowKey="name" loading={list.loading} page={list.page} pageSize={list.pageSize} total={list.total} onPageChange={list.setPage} onSort={list.handleSort} onFilter={list.handleFilter} emptyText={t("common.noData")} persistKey="list:keys" resizable columnsToggle />
    </div>
  );
}
