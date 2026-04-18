import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, RefreshCw, Trash2, Pencil, Radar, Store } from "lucide-react";
import DataTable, { type Column } from "../components/DataTable";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityList } from "../hooks/useEntityList";
import { useOrganization } from "../OrganizationContext";
import * as ServerBackend from "../backend/ServerBackend";
import type { Server, ScannedServer } from "../backend/ServerBackend";
import ScanServerModal from "../components/ScanServerModal";

export default function ServerListPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const modal = useModal();
  const { getNewEntityOwner } = useOrganization();
  const [showScan, setShowScan] = useState(false);

  const list = useEntityList<Server>({
    queryKey: "servers",
    fetchFn: ServerBackend.getServers,
  });

  const handleAdd = async () => {
    const server = ServerBackend.newServer(getNewEntityOwner());
    const res = await ServerBackend.addServer(server);
    if (res.status === "ok") {
      navigate(`/servers/${server.owner}/${server.name}`, { state: { mode: "add" } });
    } else {
      modal.toast(res.msg || t("common.addFailed" as any), "error");
    }
  };

  const handleDelete = (record: Server, e: React.MouseEvent) => {
    e.stopPropagation();
    modal.showConfirm(
      `${t("common.confirmDelete")} [${record.displayName || record.name}]`,
      async () => {
        const res = await ServerBackend.deleteServer(record);
        if (res.status === "ok") list.refetch();
        else modal.toast(res.msg || t("common.deleteFailed" as any), "error");
      }
    );
  };

  const handleAddScannedServer = async (scanned: ScannedServer) => {
    const ownerVal = getNewEntityOwner();
    const rand = Math.random().toString(36).substring(2, 8);
    const newServer = ServerBackend.newServer(ownerVal);
    newServer.name = `scanned_${rand}`;
    newServer.displayName = `Scanned MCP ${scanned.host}:${scanned.port}`;
    newServer.url = scanned.url;

    const res = await ServerBackend.addServer(newServer);
    if (res.status === "ok") {
      modal.toast(t("common.addSuccess" as any));
      list.refetch();
    } else {
      modal.toast(res.msg || t("common.addFailed" as any), "error");
    }
  };

  const columns: Column<Server>[] = [
    {
      key: "name", title: t("col.name" as any), sortable: true, filterable: true, fixed: "left" as const, width: "160px",
      render: (_, r) => <Link to={`/servers/${r.owner}/${r.name}`} className="font-mono font-medium text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{r.name}</Link>,
    },
    {
      key: "owner", title: t("col.organization" as any), sortable: true, filterable: true, width: "130px",
      render: (_, r) => <span className="text-[12px] text-text-secondary">{r.owner}</span>,
    },
    {
      key: "createdTime", title: t("col.created" as any), sortable: true, width: "180px",
      render: (_, r) => <span className="text-[12px] text-text-muted font-mono">{r.createdTime ? new Date(r.createdTime).toLocaleString() : "\u2014"}</span>,
    },
    { key: "displayName", title: t("col.displayName" as any), sortable: true, filterable: true },
    {
      key: "url", title: t("col.url" as any), sortable: true, filterable: true,
      render: (_, r) => r.url ? (
        <a target="_blank" rel="noreferrer" href={r.url} className="text-accent hover:underline text-[12px] font-mono">
          {r.url.length > 40 ? r.url.substring(0, 40) + "..." : r.url}
        </a>
      ) : null,
    },
    {
      key: "application", title: t("col.application" as any), sortable: true, filterable: true, width: "140px",
    },
    {
      key: "__actions", fixed: "right" as const, title: t("common.action" as any), width: "120px",
      render: (_, r) => (
        <div className="flex items-center gap-1">
          <Link to={`/servers/${r.owner}/${r.name}`} className="rounded p-1.5 text-text-muted hover:text-warning hover:bg-warning/10 transition-colors" title={t("common.edit")} onClick={(e) => e.stopPropagation()}><Pencil size={14} /></Link>
          <button onClick={(e) => handleDelete(r, e)} className="rounded p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors" title={t("common.delete")}><Trash2 size={14} /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("servers.title" as any)}</h1>
          <p className="text-[13px] text-text-muted mt-0.5">{t("servers.subtitle" as any)}</p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button whileHover={{ rotate: 180 }} transition={{ duration: 0.3 }} onClick={list.refetch} className="rounded-lg border border-border p-2 text-text-muted hover:bg-surface-2 transition-colors" title={t("common.refresh")}><RefreshCw size={15} /></motion.button>
          <button onClick={() => setShowScan(true)} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[13px] font-medium text-text-secondary hover:bg-surface-2 transition-colors" title={t("scanServer.title" as any)}>
            <Radar size={15} /> {t("scanServer.title" as any)}
          </button>
          <button onClick={() => navigate("/server-store")} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[13px] font-medium text-text-secondary hover:bg-surface-2 transition-colors" title={t("serverStore.title" as any)}>
            <Store size={15} /> {t("serverStore.title" as any)}
          </button>
          <button onClick={handleAdd} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover transition-colors"><Plus size={15} /> {t("servers.add" as any)}</button>
        </div>
      </div>
      <DataTable columns={columns} data={list.items} rowKey="name" loading={list.loading} page={list.page} pageSize={list.pageSize} total={list.total} onPageChange={list.setPage} onSort={list.handleSort} onFilter={list.handleFilter} emptyText={t("common.noData")} persistKey="list:servers" resizable columnsToggle />

      <ScanServerModal open={showScan} onClose={() => setShowScan(false)} onAddServer={handleAddScannedServer} />
    </div>
  );
}
