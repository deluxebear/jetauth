import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, RefreshCw, Trash2, Pencil } from "lucide-react";
import DataTable, { type Column } from "../components/DataTable";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityList } from "../hooks/useEntityList";
import { useOrganization } from "../OrganizationContext";
import * as ProductBackend from "../backend/ProductBackend";
import type { Product } from "../backend/ProductBackend";

import { formatPrice } from "../utils/price";

export default function ProductListPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const modal = useModal();
  const { getNewEntityOwner } = useOrganization();

  const list = useEntityList<Product>({
    queryKey: "products",
    fetchFn: ProductBackend.getProducts,
  });

  const handleAdd = async () => {
    const product = ProductBackend.newProduct(getNewEntityOwner());
    const res = await ProductBackend.addProduct(product);
    if (res.status === "ok") {
      navigate(`/products/${product.owner}/${product.name}`, { state: { mode: "add" } });
    } else {
      modal.toast(res.msg || t("common.addFailed" as any), "error");
    }
  };

  const handleDelete = (record: Product, e: React.MouseEvent) => {
    e.stopPropagation();
    modal.showConfirm(
      `${t("common.confirmDelete")} [${record.displayName || record.name}]`,
      async () => {
        const res = await ProductBackend.deleteProduct(record);
        if (res.status === "ok") {
          modal.toast(t("common.deleteSuccess" as any), "success");
          list.refetch();
        } else {
          modal.toast(res.msg || t("common.deleteFailed" as any), "error");
        }
      }
    );
  };

  const columns: Column<Product>[] = [
    {
      key: "name",
      title: t("col.name" as any),
      sortable: true,
      filterable: true,
      fixed: "left" as const,
      width: "150px",
      render: (_, r) => (
        <Link
          to={`/products/${r.owner}/${encodeURIComponent(r.name)}`}
          className="font-mono font-medium text-accent hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {r.name}
        </Link>
      ),
    },
    {
      key: "owner",
      title: t("col.organization" as any),
      sortable: true,
      filterable: true,
      width: "120px",
      render: (_, r) => (
        <span className="text-[12px] text-text-secondary">
          {r.owner === "admin" ? t("common.adminShared" as any) : r.owner}
        </span>
      ),
    },
    {
      key: "createdTime",
      title: t("col.created" as any),
      sortable: true,
      width: "160px",
      render: (_, r) => (
        <span className="text-[12px] text-text-muted font-mono">
          {r.createdTime ? new Date(r.createdTime).toLocaleString() : "\u2014"}
        </span>
      ),
    },
    {
      key: "displayName",
      title: t("col.displayName" as any),
      sortable: true,
      filterable: true,
      width: "200px",
    },
    {
      key: "image",
      title: t("products.field.image" as any),
      width: "170px",
      render: (_, r) =>
        r.image ? (
          <a href={r.image} target="_blank" rel="noreferrer">
            <img src={r.image} alt={r.name} className="h-8 object-contain" />
          </a>
        ) : (
          <span className="text-text-muted">{"\u2014"}</span>
        ),
    },
    {
      key: "tag",
      title: t("products.field.tag" as any),
      sortable: true,
      filterable: true,
      width: "160px",
    },
    {
      key: "price",
      title: t("products.field.price" as any),
      sortable: true,
      width: "140px",
      render: (_, r) => (
        <span className="text-[12px] font-mono font-medium">
          {r.isRecharge ? (
            <span className="text-text-muted italic">
              {t("products.field.isRecharge" as any)}
            </span>
          ) : (
            formatPrice(r.price, r.currency)
          )}
        </span>
      ),
    },
    {
      key: "quantity",
      title: t("products.field.quantity" as any),
      sortable: true,
      width: "100px",
      render: (_, r) => (
        <span className="text-[12px] text-text-muted">{r.quantity}</span>
      ),
    },
    {
      key: "sold",
      title: t("products.field.sold" as any),
      sortable: true,
      width: "100px",
      render: (_, r) => (
        <span className="text-[12px] text-text-muted">{r.sold}</span>
      ),
    },
    {
      key: "state",
      title: t("col.state" as any),
      sortable: true,
      filterable: true,
      width: "100px",
      render: (_, r) => (
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
            r.state === "Published"
              ? "bg-success/15 text-success"
              : "bg-surface-3 text-text-muted"
          }`}
        >
          {r.state === "Published"
            ? t("products.state.published" as any)
            : t("products.state.draft" as any)}
        </span>
      ),
    },
    {
      key: "providers",
      title: t("products.field.providers" as any),
      width: "250px",
      render: (_, r) => {
        const providers = r.providers || [];
        if (providers.length === 0) {
          return <span className="text-[12px] text-text-muted">{"\u2014"}</span>;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {providers.map((p) => (
              <Link
                key={p}
                to={`/providers/${r.owner}/${encodeURIComponent(p)}`}
                className="inline-block rounded bg-accent/10 px-1.5 py-0.5 text-[11px] font-medium text-accent hover:bg-accent/20 transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                {p}
              </Link>
            ))}
          </div>
        );
      },
    },
    {
      key: "__actions",
      fixed: "right" as const,
      title: t("common.action" as any),
      width: "110px",
      render: (_, r) => (
        <div className="flex items-center gap-1">
          <Link
            to={`/products/${r.owner}/${encodeURIComponent(r.name)}`}
            className="rounded p-1.5 text-text-muted hover:text-warning hover:bg-warning/10 transition-colors"
            title={t("common.edit")}
            onClick={(e) => e.stopPropagation()}
          >
            <Pencil size={14} />
          </Link>
          <button
            onClick={(e) => handleDelete(r, e)}
            className="rounded p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
            title={t("common.delete")}
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
          <h1 className="text-xl font-bold tracking-tight">
            {t("products.title" as any)}
          </h1>
          <p className="text-[13px] text-text-muted mt-0.5">
            {t("products.subtitle" as any)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ rotate: 180 }}
            transition={{ duration: 0.3 }}
            onClick={list.refetch}
            className="rounded-lg border border-border p-2 text-text-muted hover:bg-surface-2 transition-colors"
            title={t("common.refresh")}
          >
            <RefreshCw size={15} />
          </motion.button>
          <button
            onClick={handleAdd}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover transition-colors"
          >
            <Plus size={15} /> {t("products.add" as any)}
          </button>
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
        persistKey="list:products"
        resizable
        columnsToggle
      />
    </div>
  );
}
