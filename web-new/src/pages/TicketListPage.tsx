import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, RefreshCw, Trash2, Pencil, Clock, Loader2, CheckCircle, XCircle } from "lucide-react";
import DataTable, { type Column } from "../components/DataTable";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityList } from "../hooks/useEntityList";
import { useOrganization } from "../OrganizationContext";
import * as TicketBackend from "../backend/TicketBackend";
import type { Ticket } from "../backend/TicketBackend";

function TicketStateBadge({ state }: { state: string }) {
  const config: Record<string, { icon: React.ReactNode; cls: string }> = {
    "Open": { icon: <Clock size={12} />, cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
    "In Progress": { icon: <Loader2 size={12} className="animate-spin" />, cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
    "Resolved": { icon: <CheckCircle size={12} />, cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
    "Closed": { icon: <XCircle size={12} />, cls: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  };
  const { icon, cls } = config[state] ?? config["Closed"]!;
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{icon} {state}</span>;
}

export default function TicketListPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const modal = useModal();
  const { getNewEntityOwner } = useOrganization();

  const list = useEntityList<Ticket>({
    queryKey: "tickets",
    fetchFn: TicketBackend.getTickets,
  });

  const handleAdd = async () => {
    const ticket = TicketBackend.newTicket(getNewEntityOwner(), "admin");
    const res = await TicketBackend.addTicket(ticket);
    if (res.status === "ok") {
      navigate(`/tickets/${ticket.owner}/${ticket.name}`, { state: { mode: "add" } });
    } else {
      modal.toast(res.msg || t("common.addFailed" as any), "error");
    }
  };

  const handleDelete = (record: Ticket, e: React.MouseEvent) => {
    e.stopPropagation();
    modal.showConfirm(
      `${t("common.confirmDelete")} [${record.name}]`,
      async () => {
        const res = await TicketBackend.deleteTicket(record);
        if (res.status === "ok") list.refetch();
        else modal.toast(res.msg || t("common.deleteFailed" as any), "error");
      }
    );
  };

  const columns: Column<Ticket>[] = [
    {
      key: "name", title: t("col.name" as any), sortable: true, filterable: true, fixed: "left" as const, width: "140px",
      render: (_, r) => <Link to={`/tickets/${r.owner}/${encodeURIComponent(r.name)}`} className="font-mono font-medium text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{r.name}</Link>,
    },
    {
      key: "createdTime", title: t("col.created" as any), sortable: true, width: "180px",
      render: (_, r) => <span className="text-[12px] text-text-muted font-mono">{r.createdTime ? new Date(r.createdTime).toLocaleString() : "\u2014"}</span>,
    },
    {
      key: "updatedTime", title: t("col.updated" as any), sortable: true, width: "180px",
      render: (_, r) => <span className="text-[12px] text-text-muted font-mono">{r.updatedTime ? new Date(r.updatedTime).toLocaleString() : "\u2014"}</span>,
    },
    {
      key: "displayName", title: t("col.displayName" as any), sortable: true, filterable: true, width: "250px",
    },
    {
      key: "title", title: t("tickets.field.title" as any), sortable: true, filterable: true,
    },
    {
      key: "user", title: t("col.user" as any), sortable: true, filterable: true, width: "140px",
      render: (_, r) => <Link to={`/users/${r.user}`} className="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{r.user}</Link>,
    },
    {
      key: "state", title: t("tickets.field.state" as any), sortable: true, filterable: true, width: "140px",
      render: (_, r) => <TicketStateBadge state={r.state} />,
    },
    {
      key: "__actions", fixed: "right" as const, title: t("common.action" as any), width: "110px",
      render: (_, r) => (
        <div className="flex items-center gap-1">
          <Link to={`/tickets/${r.owner}/${encodeURIComponent(r.name)}`} className="rounded p-1.5 text-text-muted hover:text-warning hover:bg-warning/10 transition-colors" title={t("common.edit")} onClick={(e) => e.stopPropagation()}><Pencil size={14} /></Link>
          <button onClick={(e) => handleDelete(r, e)} className="rounded p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors" title={t("common.delete")}><Trash2 size={14} /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("tickets.title" as any)}</h1>
          <p className="text-[13px] text-text-muted mt-0.5">{t("tickets.subtitle" as any)}</p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button whileHover={{ rotate: 180 }} transition={{ duration: 0.3 }} onClick={list.refetch} className="rounded-lg border border-border p-2 text-text-muted hover:bg-surface-2 transition-colors" title={t("common.refresh")}><RefreshCw size={15} /></motion.button>
          <button onClick={handleAdd} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover transition-colors"><Plus size={15} /> {t("tickets.add" as any)}</button>
        </div>
      </div>
      <DataTable columns={columns} data={list.items} rowKey="name" loading={list.loading} page={list.page} pageSize={list.pageSize} total={list.total} onPageChange={list.setPage} onSort={list.handleSort} onFilter={list.handleFilter} emptyText={t("common.noData")} persistKey="list:tickets" resizable columnsToggle />
    </div>
  );
}
