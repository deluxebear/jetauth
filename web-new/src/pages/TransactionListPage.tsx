import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, RefreshCw, Trash2, Pencil } from "lucide-react";
import DataTable, { type Column } from "../components/DataTable";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityList } from "../hooks/useEntityList";
import { useOrganization } from "../OrganizationContext";
import * as TransactionBackend from "../backend/TransactionBackend";
import type { Transaction } from "../backend/TransactionBackend";

export default function TransactionListPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const modal = useModal();
  const { getNewEntityOwner } = useOrganization();

  const list = useEntityList<Transaction>({
    queryKey: "transactions",
    fetchFn: TransactionBackend.getTransactions,
  });

  const handleAdd = async () => {
    const txn = TransactionBackend.newTransaction(getNewEntityOwner());
    const res = await TransactionBackend.addTransaction(txn);
    if (res.status === "ok") {
      const transactionId = res.data as unknown as string;
      navigate(`/transactions/${txn.owner}/${transactionId || txn.name}`, { state: { mode: "add" } });
    } else {
      modal.toast(res.msg || t("common.addFailed" as any), "error");
    }
  };

  const handleDelete = (record: Transaction, e: React.MouseEvent) => {
    e.stopPropagation();
    modal.showConfirm(
      `${t("common.confirmDelete")} [${record.name}]`,
      async () => {
        const res = await TransactionBackend.deleteTransaction(record);
        if (res.status === "ok") list.refetch();
        else modal.toast(res.msg || t("common.deleteFailed" as any), "error");
      }
    );
  };

  const columns: Column<Transaction>[] = [
    {
      key: "name", title: t("col.name" as any), sortable: true, filterable: true, fixed: "left" as const, width: "180px",
      render: (_, r) => <Link to={`/transactions/${r.owner}/${encodeURIComponent(r.name)}`} className="font-mono font-medium text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{r.name}</Link>,
    },
    {
      key: "owner", title: t("col.organization" as any), sortable: true, filterable: true, width: "120px",
      render: (_, r) => <span className="text-[12px] text-text-secondary">{r.owner === "admin" ? t("common.adminShared" as any) : r.owner}</span>,
    },
    {
      key: "createdTime", title: t("col.created" as any), sortable: true, width: "160px",
      render: (_, r) => <span className="text-[12px] text-text-muted font-mono">{r.createdTime ? new Date(r.createdTime).toLocaleString() : "\u2014"}</span>,
    },
    { key: "tag", title: t("transactions.field.tag" as any), sortable: true, filterable: true, width: "120px" },
    {
      key: "user", title: t("transactions.field.user" as any), sortable: true, filterable: true, width: "120px",
      render: (_, r) => r.user ? <Link to={`/users/${r.owner}/${r.user}`} className="text-accent hover:underline text-[12px]" onClick={(e) => e.stopPropagation()}>{r.user}</Link> : <span className="text-text-muted">{"\u2014"}</span>,
    },
    {
      key: "application", title: t("transactions.field.application" as any), sortable: true, filterable: true, width: "150px",
      render: (_, r) => r.application ? <Link to={`/applications/${r.organization}/${r.application}`} className="text-accent hover:underline text-[12px]" onClick={(e) => e.stopPropagation()}>{r.application}</Link> : <span className="text-text-muted">{"\u2014"}</span>,
    },
    {
      key: "domain", title: t("transactions.field.domain" as any), sortable: true, filterable: true, width: "200px",
      render: (_, r) => r.domain ? <a href={r.domain} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline text-[12px]">{r.domain}</a> : <span className="text-text-muted">{"\u2014"}</span>,
    },
    { key: "category", title: t("transactions.field.category" as any), sortable: true, filterable: true, width: "120px" },
    { key: "type", title: t("transactions.field.type" as any), sortable: true, filterable: true, width: "120px" },
    {
      key: "provider", title: t("transactions.field.provider" as any), sortable: true, filterable: true, width: "150px",
      render: (_, r) => r.provider ? <span className="text-[12px]">{r.provider}</span> : <span className="text-text-muted">{"\u2014"}</span>,
    },
    { key: "state", title: t("col.state" as any), sortable: true, filterable: true, width: "100px" },
    {
      key: "amount", title: t("transactions.field.amount" as any), sortable: true, filterable: true, width: "140px",
      render: (_, r) => <span className="text-[12px] font-mono">{r.currency} {r.amount}</span>,
    },
    {
      key: "__actions", fixed: "right" as const, title: t("common.action" as any), width: "110px",
      render: (_, r) => (
        <div className="flex items-center gap-1">
          <Link to={`/transactions/${r.owner}/${encodeURIComponent(r.name)}`} className="rounded p-1.5 text-text-muted hover:text-warning hover:bg-warning/10 transition-colors" title={t("common.edit")} onClick={(e) => e.stopPropagation()}><Pencil size={14} /></Link>
          <button onClick={(e) => handleDelete(r, e)} className="rounded p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors" title={t("common.delete")}><Trash2 size={14} /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("transactions.title" as any)}</h1>
          <p className="text-[13px] text-text-muted mt-0.5">{t("transactions.subtitle" as any)}</p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button whileHover={{ rotate: 180 }} transition={{ duration: 0.3 }} onClick={list.refetch} className="rounded-lg border border-border p-2 text-text-muted hover:bg-surface-2 transition-colors" title={t("common.refresh")}><RefreshCw size={15} /></motion.button>
          <button onClick={handleAdd} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover transition-colors"><Plus size={15} /> {t("transactions.add" as any)}</button>
        </div>
      </div>
      <DataTable columns={columns} data={list.items} rowKey="name" loading={list.loading} page={list.page} pageSize={list.pageSize} total={list.total} onPageChange={list.setPage} onSort={list.handleSort} onFilter={list.handleFilter} emptyText={t("common.noData")} />
    </div>
  );
}
