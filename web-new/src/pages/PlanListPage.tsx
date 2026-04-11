import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, RefreshCw, Trash2, Pencil } from "lucide-react";
import DataTable, { type Column } from "../components/DataTable";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityList } from "../hooks/useEntityList";
import { useOrganization } from "../OrganizationContext";
import * as PlanBackend from "../backend/PlanBackend";
import type { Plan } from "../backend/PlanBackend";

export default function PlanListPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const modal = useModal();
  const { getNewEntityOwner } = useOrganization();

  const list = useEntityList<Plan>({
    queryKey: "plans",
    fetchFn: PlanBackend.getPlans,
  });

  const handleAdd = async () => {
    const plan = PlanBackend.newPlan(getNewEntityOwner());
    const res = await PlanBackend.addPlan(plan);
    if (res.status === "ok") {
      navigate(`/plans/${plan.owner}/${plan.name}`, { state: { mode: "add" } });
    } else {
      modal.toast(res.msg || t("common.addFailed" as any), "error");
    }
  };

  const handleDelete = (record: Plan, e: React.MouseEvent) => {
    e.stopPropagation();
    modal.showConfirm(
      `${t("common.confirmDelete")} [${record.displayName || record.name}]`,
      async () => {
        const res = await PlanBackend.deletePlan(record);
        if (res.status === "ok") list.refetch();
        else modal.toast(res.msg || t("common.deleteFailed" as any), "error");
      }
    );
  };

  const columns: Column<Plan>[] = [
    {
      key: "name", title: t("col.name" as any), sortable: true, filterable: true, fixed: "left" as const, width: "150px",
      render: (_, r) => <Link to={`/plans/${r.owner}/${encodeURIComponent(r.name)}`} className="font-mono font-medium text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{r.name}</Link>,
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
      key: "price", title: t("plans.field.price" as any), sortable: true, filterable: true, width: "120px",
      render: (_, r) => <span className="text-[12px] font-mono">{r.currency} {r.price}</span>,
    },
    { key: "period", title: t("plans.field.period" as any), filterable: true, width: "120px" },
    {
      key: "role", title: t("plans.field.role" as any), filterable: true, width: "140px",
      render: (_, r) => r.role ? <Link to={`/roles/${r.role}`} className="text-accent hover:underline text-[12px]" onClick={(e) => e.stopPropagation()}>{r.role}</Link> : <span className="text-text-muted">{"\u2014"}</span>,
    },
    {
      key: "product", title: t("plans.field.product" as any), filterable: true, width: "140px",
      render: (_, r) => r.product ? <Link to={`/products/${r.owner}/${r.product}`} className="text-accent hover:underline text-[12px]" onClick={(e) => e.stopPropagation()}>{r.product}</Link> : <span className="text-text-muted">{"\u2014"}</span>,
    },
    {
      key: "isEnabled", title: t("col.isEnabled" as any), sortable: true, width: "120px",
      render: (_, r) => (
        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${r.isEnabled ? "bg-success/15 text-success" : "bg-surface-3 text-text-muted"}`}>
          {r.isEnabled ? t("common.on" as any) : t("common.off" as any)}
        </span>
      ),
    },
    {
      key: "__actions", fixed: "right" as const, title: t("common.action" as any), width: "110px",
      render: (_, r) => (
        <div className="flex items-center gap-1">
          <Link to={`/plans/${r.owner}/${encodeURIComponent(r.name)}`} className="rounded p-1.5 text-text-muted hover:text-warning hover:bg-warning/10 transition-colors" title={t("common.edit")} onClick={(e) => e.stopPropagation()}><Pencil size={14} /></Link>
          <button onClick={(e) => handleDelete(r, e)} className="rounded p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors" title={t("common.delete")}><Trash2 size={14} /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("plans.title" as any)}</h1>
          <p className="text-[13px] text-text-muted mt-0.5">{t("plans.subtitle" as any)}</p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button whileHover={{ rotate: 180 }} transition={{ duration: 0.3 }} onClick={list.refetch} className="rounded-lg border border-border p-2 text-text-muted hover:bg-surface-2 transition-colors" title={t("common.refresh")}><RefreshCw size={15} /></motion.button>
          <button onClick={handleAdd} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover transition-colors"><Plus size={15} /> {t("plans.add" as any)}</button>
        </div>
      </div>
      <DataTable columns={columns} data={list.items} rowKey="name" loading={list.loading} page={list.page} pageSize={list.pageSize} total={list.total} onPageChange={list.setPage} onSort={list.handleSort} onFilter={list.handleFilter} emptyText={t("common.noData")} />
    </div>
  );
}
