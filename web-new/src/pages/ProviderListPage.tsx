import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, RefreshCw, Trash2, Pencil } from "lucide-react";
import DataTable, { type Column } from "../components/DataTable";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityList } from "../hooks/useEntityList";
import { useOrganization } from "../OrganizationContext";
import * as ProviderBackend from "../backend/ProviderBackend";
import type { Provider } from "../backend/ProviderBackend";

const categoryColors: Record<string, string> = {
  OAuth: "bg-blue-500/15 text-blue-600",
  Email: "bg-amber-500/15 text-amber-600",
  SMS: "bg-green-500/15 text-green-600",
  Storage: "bg-purple-500/15 text-purple-600",
  SAML: "bg-rose-500/15 text-rose-600",
  Payment: "bg-orange-500/15 text-orange-600",
  Captcha: "bg-cyan-500/15 text-cyan-600",
  Web3: "bg-indigo-500/15 text-indigo-600",
  Notification: "bg-teal-500/15 text-teal-600",
};

export default function ProviderListPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const modal = useModal();
  const { getNewEntityOwner } = useOrganization();

  const list = useEntityList<Provider>({
    queryKey: "providers",
    fetchFn: ProviderBackend.getProviders,
  });

  const handleAdd = async () => {
    const provider = ProviderBackend.newProvider(getNewEntityOwner());
    const res = await ProviderBackend.addProvider(provider);
    if (res.status === "ok") {
      navigate(`/providers/${provider.owner}/${provider.name}`, { state: { mode: "add" } });
    } else {
      modal.toast(res.msg || t("common.addFailed" as any), "error");
    }
  };

  const handleDelete = (record: Provider, e: React.MouseEvent) => {
    e.stopPropagation();
    modal.showConfirm(
      `${t("common.confirmDelete")} [${record.displayName || record.name}]`,
      async () => {
        const res = await ProviderBackend.deleteProvider(record);
        if (res.status === "ok") list.refetch();
        else modal.toast(res.msg || t("common.deleteFailed" as any), "error");
      }
    );
  };

  const columns: Column<Provider>[] = [
    {
      key: "name", title: t("col.name" as any), sortable: true, filterable: true, fixed: "left" as const, width: "120px",
      render: (_, r) => <Link to={`/providers/${r.owner}/${r.name}`} className="font-mono font-medium text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{r.name}</Link>,
    },
    {
      key: "owner", title: t("col.organization" as any), sortable: true, filterable: true, width: "150px",
      render: (_, r) => <span className="text-[12px] text-text-secondary">{r.owner === "admin" ? t("common.adminShared" as any) : r.owner}</span>,
    },
    {
      key: "createdTime", title: t("col.created" as any), sortable: true, width: "160px",
      render: (_, r) => <span className="text-[12px] text-text-muted font-mono">{r.createdTime ? new Date(r.createdTime).toLocaleString() : "—"}</span>,
    },
    { key: "displayName", title: t("col.displayName" as any), sortable: true, filterable: true },
    {
      key: "category", title: t("col.category" as any), sortable: true, filterable: true, width: "110px",
      render: (_, r) => <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${categoryColors[r.category] || "bg-surface-3 text-text-secondary"}`}>{r.category}</span>,
    },
    { key: "type", title: t("col.type" as any), sortable: true, filterable: true, width: "110px" },
    {
      key: "clientId", title: t("col.clientId" as any), sortable: true, filterable: true, width: "120px",
      render: (_, r) => <span className="font-mono text-[11px] text-text-muted truncate block max-w-[100px]">{r.clientId || "—"}</span>,
    },
    {
      key: "providerUrl", title: t("providers.field.providerUrl" as any), sortable: true, width: "150px",
      render: (_, r) => r.providerUrl
        ? <a href={r.providerUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline text-[12px] truncate block max-w-[130px]" onClick={(e) => e.stopPropagation()}>{r.providerUrl}</a>
        : <span className="text-text-muted text-[12px]">—</span>,
    },
    {
      key: "__actions", fixed: "right" as const, title: t("common.action" as any), width: "120px",
      render: (_, r) => (
        <div className="flex items-center gap-1">
          <Link to={`/providers/${r.owner}/${r.name}`} className="rounded p-1.5 text-text-muted hover:text-warning hover:bg-warning/10 transition-colors" title={t("common.edit")} onClick={(e) => e.stopPropagation()}><Pencil size={14} /></Link>
          <button onClick={(e) => handleDelete(r, e)} className="rounded p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors" title={t("common.delete")}><Trash2 size={14} /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("providers.title" as any)}</h1>
          <p className="text-[13px] text-text-muted mt-0.5">{t("providers.subtitle" as any)}</p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button whileHover={{ rotate: 180 }} transition={{ duration: 0.3 }} onClick={list.refetch} className="rounded-lg border border-border p-2 text-text-muted hover:bg-surface-2 transition-colors" title={t("common.refresh")}><RefreshCw size={15} /></motion.button>
          <button onClick={handleAdd} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover transition-colors"><Plus size={15} /> {t("providers.add" as any)}</button>
        </div>
      </div>
      <DataTable columns={columns} data={list.items} rowKey="name" loading={list.loading} page={list.page} pageSize={list.pageSize} total={list.total} onPageChange={list.setPage} onSort={list.handleSort} onFilter={list.handleFilter} emptyText={t("common.noData")} />
    </div>
  );
}
