import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, RefreshCw, Trash2, Pencil } from "lucide-react";
import DataTable, { type Column } from "../components/DataTable";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityList } from "../hooks/useEntityList";
import { useOrganization } from "../OrganizationContext";
import * as OrderBackend from "../backend/OrderBackend";
import type { Order } from "../backend/OrderBackend";

export default function OrderListPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const modal = useModal();
  const { getNewEntityOwner } = useOrganization();

  const list = useEntityList<Order>({
    queryKey: "orders",
    fetchFn: OrderBackend.getOrders,
  });

  const handleAdd = async () => {
    const order = OrderBackend.newOrder(getNewEntityOwner());
    const res = await OrderBackend.addOrder(order);
    if (res.status === "ok") {
      navigate(`/orders/${order.owner}/${order.name}`, { state: { mode: "add" } });
    } else {
      modal.toast(res.msg || t("common.addFailed" as any), "error");
    }
  };

  const handleDelete = (record: Order, e: React.MouseEvent) => {
    e.stopPropagation();
    modal.showConfirm(
      `${t("common.confirmDelete")} [${record.displayName || record.name}]`,
      async () => {
        const res = await OrderBackend.deleteOrder(record);
        if (res.status === "ok") list.refetch();
        else modal.toast(res.msg || t("common.deleteFailed" as any), "error");
      }
    );
  };

  const columns: Column<Order>[] = [
    {
      key: "name", title: t("col.name" as any), sortable: true, filterable: true, fixed: "left" as const, width: "150px",
      render: (_, r) => <Link to={`/orders/${r.owner}/${encodeURIComponent(r.name)}`} className="font-mono font-medium text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{r.name}</Link>,
    },
    {
      key: "owner", title: t("col.organization" as any), sortable: true, filterable: true, width: "120px",
      render: (_, r) => <span className="text-[12px] text-text-secondary">{r.owner === "admin" ? t("common.adminShared" as any) : r.owner}</span>,
    },
    {
      key: "createdTime", title: t("col.created" as any), sortable: true, width: "160px",
      render: (_, r) => <span className="text-[12px] text-text-muted font-mono">{r.createdTime ? new Date(r.createdTime).toLocaleString() : "\u2014"}</span>,
    },
    {
      key: "products", title: t("orders.field.products" as any), filterable: true, width: "250px",
      render: (_, r) => {
        const infos = r.productInfos || [];
        if (infos.length === 0) return <span className="text-text-muted">({t("common.empty" as any)})</span>;
        return (
          <div className="space-y-0.5">
            {infos.map((p) => (
              <div key={p.name} className="text-[12px]">
                <Link to={`/products/${r.owner}/${p.name}`} className="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{p.displayName || p.name}</Link>
                <span className="text-text-muted ml-1">{r.currency || "USD"} {p.price} x {p.quantity || 1}</span>
              </div>
            ))}
          </div>
        );
      },
    },
    {
      key: "price", title: t("orders.field.price" as any), sortable: true, filterable: true, width: "140px",
      render: (_, r) => {
        const priceText = `${r.currency || "USD"} ${(r.price || 0).toFixed(2)}`;
        return r.payment
          ? <Link to={`/payments/${r.owner}/${r.payment}`} className="text-accent hover:underline text-[12px] font-mono" onClick={(e) => e.stopPropagation()}>{priceText}</Link>
          : <span className="text-[12px] font-mono">{priceText}</span>;
      },
    },
    {
      key: "user", title: t("orders.field.user" as any), sortable: true, filterable: true, width: "120px",
      render: (_, r) => r.user ? <Link to={`/users/${r.owner}/${r.user}`} className="text-accent hover:underline text-[12px]" onClick={(e) => e.stopPropagation()}>{r.user}</Link> : <span className="text-text-muted">{"\u2014"}</span>,
    },
    { key: "state", title: t("col.state" as any), sortable: true, filterable: true, width: "120px" },
    {
      key: "__actions", fixed: "right" as const, title: t("common.action" as any), width: "110px",
      render: (_, r) => (
        <div className="flex items-center gap-1">
          <Link to={`/orders/${r.owner}/${encodeURIComponent(r.name)}`} className="rounded p-1.5 text-text-muted hover:text-warning hover:bg-warning/10 transition-colors" title={t("common.edit")} onClick={(e) => e.stopPropagation()}><Pencil size={14} /></Link>
          <button onClick={(e) => handleDelete(r, e)} className="rounded p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors" title={t("common.delete")}><Trash2 size={14} /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("orders.title" as any)}</h1>
          <p className="text-[13px] text-text-muted mt-0.5">{t("orders.subtitle" as any)}</p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button whileHover={{ rotate: 180 }} transition={{ duration: 0.3 }} onClick={list.refetch} className="rounded-lg border border-border p-2 text-text-muted hover:bg-surface-2 transition-colors" title={t("common.refresh")}><RefreshCw size={15} /></motion.button>
          <button onClick={handleAdd} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover transition-colors"><Plus size={15} /> {t("orders.add" as any)}</button>
        </div>
      </div>
      <DataTable columns={columns} data={list.items} rowKey="name" loading={list.loading} page={list.page} pageSize={list.pageSize} total={list.total} onPageChange={list.setPage} onSort={list.handleSort} onFilter={list.handleFilter} emptyText={t("common.noData")} />
    </div>
  );
}
