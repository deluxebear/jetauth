import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, RefreshCw, Trash2, Pencil } from "lucide-react";
import DataTable, { type Column } from "../components/DataTable";
import StatusBadge from "../components/StatusBadge";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityList } from "../hooks/useEntityList";
import { useOrganization } from "../OrganizationContext";
import * as InvBackend from "../backend/InvitationBackend";
import type { Invitation } from "../backend/InvitationBackend";

export default function InvitationListPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const modal = useModal();
  const { selectedOrg, isAll, getNewEntityOwner } = useOrganization();

  const list = useEntityList<Invitation>({
    queryKey: "invitations",
    fetchFn: InvBackend.getInvitations,
    owner: isAll ? "" : selectedOrg,
  });

  const handleAdd = async () => {
    const inv = InvBackend.newInvitation(getNewEntityOwner());
    const res = await InvBackend.addInvitation(inv);
    if (res.status === "ok") {
      navigate(`/invitations/${inv.owner}/${inv.name}`, { state: { mode: "add" } });
    } else {
      modal.toast(res.msg || t("common.addFailed" as any), "error");
    }
  };

  const handleDelete = (record: Invitation, e: React.MouseEvent) => {
    e.stopPropagation();
    modal.showConfirm(`${t("common.confirmDelete")} [${record.displayName || record.name}]`, async () => {
      const res = await InvBackend.deleteInvitation(record);
      if (res.status === "ok") list.refetch();
      else modal.toast(res.msg || t("common.deleteFailed" as any), "error");
    });
  };

  const columns: Column<Invitation>[] = [
    {
      key: "name",
      title: t("col.name" as any),
      sortable: true,
      filterable: true,
      width: "140px",
      render: (_, r) => <Link to={`/invitations/${r.owner}/${r.name}`} className="font-mono font-medium text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{r.name}</Link>,
    },
    { key: "owner", title: t("col.organization" as any), sortable: true, width: "120px" },
    {
      key: "updatedTime",
      title: t("col.updated" as any),
      sortable: true,
      width: "160px",
      render: (_, r) => <span className="text-[12px] text-text-muted font-mono">{r.updatedTime ? new Date(r.updatedTime).toLocaleString() : "—"}</span>,
    },
    { key: "displayName", title: t("col.displayName" as any), sortable: true, filterable: true },
    {
      key: "code",
      title: t("col.code" as any),
      width: "130px",
      render: (_, r) => <span className="font-mono text-[12px] text-text-secondary">{r.code || "—"}</span>,
    },
    {
      key: "quota",
      title: t("col.quota" as any),
      width: "70px",
      render: (_, r) => <span className="font-mono text-[12px] text-text-muted">{r.quota}</span>,
    },
    {
      key: "usedCount",
      title: t("col.used" as any),
      width: "70px",
      render: (_, r) => <span className="font-mono text-[12px] text-text-muted">{r.usedCount}</span>,
    },
    {
      key: "application",
      title: t("col.application" as any),
      width: "130px",
      render: (_, r) => <span className="text-[12px] text-text-secondary">{r.application || "—"}</span>,
    },
    {
      key: "email",
      title: t("col.email" as any),
      width: "160px",
      render: (_, r) => r.email ? <a href={`mailto:${r.email}`} className="text-accent hover:underline text-[12px]" onClick={(e) => e.stopPropagation()}>{r.email}</a> : <span className="text-text-muted text-[12px]">—</span>,
    },
    {
      key: "phone",
      title: t("col.phone" as any),
      width: "140px",
      render: (_, r) => r.phone ? <a href={`tel:${r.phone}`} className="text-accent hover:underline text-[12px]" onClick={(e) => e.stopPropagation()}>{r.phone}</a> : <span className="text-text-muted text-[12px]">—</span>,
    },
    {
      key: "state",
      title: t("col.state" as any),
      width: "100px",
      render: (_, r) => <StatusBadge status={r.state === "Active" ? "active" : "inactive"} label={r.state || "—"} />,
    },
    {
      key: "__actions",
      fixed: "right" as const,
      title: t("common.action" as any),
      width: "90px",
      render: (_, r) => (
        <div className="flex items-center gap-1">
          <Link to={`/invitations/${r.owner}/${r.name}`} className="rounded p-1.5 text-text-muted hover:text-warning hover:bg-warning/10 transition-colors" onClick={(e) => e.stopPropagation()}>
            <Pencil size={14} />
          </Link>
          <button onClick={(e) => handleDelete(r, e)} className="rounded p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors">
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
          <h1 className="text-xl font-bold tracking-tight">{t("invitations.title" as any)}</h1>
          <p className="text-[13px] text-text-muted mt-0.5">{t("invitations.subtitle" as any)}</p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button whileHover={{ rotate: 180 }} transition={{ duration: 0.3 }} onClick={list.refetch} className="rounded-lg border border-border p-2 text-text-muted hover:bg-surface-2 transition-colors">
            <RefreshCw size={15} />
          </motion.button>
          <button onClick={handleAdd} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover transition-colors">
            <Plus size={15} />
            {t("invitations.add" as any)}
          </button>
        </div>
      </div>
      <DataTable columns={columns} data={list.items} rowKey="name" loading={list.loading} page={list.page} pageSize={list.pageSize} total={list.total} onPageChange={list.setPage} onSort={list.handleSort} onFilter={list.handleFilter} emptyText={t("common.noData")} />
    </div>
  );
}
