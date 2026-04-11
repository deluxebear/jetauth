import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, RefreshCw, Trash2, Pencil } from "lucide-react";
import DataTable, { type Column } from "../components/DataTable";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityList } from "../hooks/useEntityList";
import { useOrganization } from "../OrganizationContext";
import * as SiteBackend from "../backend/SiteBackend";
import type { Site } from "../backend/SiteBackend";

export default function SiteListPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const modal = useModal();
  const { getNewEntityOwner } = useOrganization();

  const list = useEntityList<Site>({
    queryKey: "sites",
    fetchFn: SiteBackend.getSites,
  });

  const handleAdd = async () => {
    const site = SiteBackend.newSite(getNewEntityOwner());
    const res = await SiteBackend.addSite(site);
    if (res.status === "ok") {
      navigate(`/sites/${site.owner}/${site.name}`, { state: { mode: "add" } });
    } else {
      modal.toast(res.msg || t("common.addFailed" as any), "error");
    }
  };

  const handleDelete = (record: Site, e: React.MouseEvent) => {
    e.stopPropagation();
    modal.showConfirm(
      `${t("common.confirmDelete")} [${record.displayName || record.name}]`,
      async () => {
        const res = await SiteBackend.deleteSite(record);
        if (res.status === "ok") list.refetch();
        else modal.toast(res.msg || t("common.deleteFailed" as any), "error");
      }
    );
  };

  const columns: Column<Site>[] = [
    {
      key: "owner", title: t("col.owner" as any), sortable: true, width: "90px",
      render: (_, r) => <span className="text-[12px] text-text-secondary">{r.owner}</span>,
    },
    {
      key: "tag", title: t("col.tag" as any), sortable: true, width: "140px",
      render: (_, r) => r.tag ? (
        <Link to={`/nodes/${r.owner}/${r.tag}`} className="text-accent hover:underline text-[12px]" onClick={(e) => e.stopPropagation()}>{r.tag}</Link>
      ) : null,
    },
    {
      key: "name", title: t("col.name" as any), sortable: true, fixed: "left" as const, width: "120px",
      render: (_, r) => <Link to={`/sites/${r.owner}/${r.name}`} className="font-mono font-medium text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{r.name}</Link>,
    },
    { key: "displayName", title: t("col.displayName" as any), sortable: true },
    {
      key: "domain", title: t("sites.field.domain" as any), sortable: true, width: "150px",
      render: (_, r) => r.publicIp ? (
        <a target="_blank" rel="noreferrer" href={`https://${r.domain}`} className="text-accent hover:underline text-[12px]">{r.domain}</a>
      ) : <span className="text-[12px]">{r.domain}</span>,
    },
    {
      key: "otherDomains", title: t("sites.field.otherDomains" as any), width: "120px",
      render: (_, r) => (
        <div className="flex flex-wrap gap-1">
          {(r.otherDomains || []).map((d) => (
            <a key={d} target="_blank" rel="noreferrer" href={`https://${d}`} className={`inline-block rounded px-1.5 py-0.5 text-[11px] ${r.needRedirect ? "bg-surface-2 text-text-muted" : "bg-accent/10 text-accent"}`}>{d}</a>
          ))}
        </div>
      ),
    },
    {
      key: "rules", title: t("sites.field.rules" as any), width: "120px",
      render: (_, r) => (
        <div className="flex flex-wrap gap-1">
          {(r.rules || []).map((rule) => (
            <a key={rule} href={`/rules/${rule}`} target="_blank" rel="noreferrer" className="inline-block rounded px-1.5 py-0.5 text-[11px] bg-accent/10 text-accent">{rule}</a>
          ))}
        </div>
      ),
    },
    {
      key: "host", title: t("sites.field.host" as any), sortable: true, width: "80px",
      render: (_, r) => {
        const hostStr = r.host ? `${r.host}:${r.port}` : String(r.port);
        return r.status === "Active"
          ? <span className="text-[12px] font-mono">{hostStr}</span>
          : <span className="text-[11px] font-mono rounded px-1.5 py-0.5 bg-warning/10 text-warning">{hostStr}</span>;
      },
    },
    {
      key: "hosts", title: t("sites.field.hosts" as any), width: "200px",
      render: (_, r) => (
        <div className="flex flex-wrap gap-1">
          {(r.hosts || []).map((h, i) => (
            <span key={i} className="inline-block rounded px-1.5 py-0.5 text-[11px] bg-info/10 text-info">{h}</span>
          ))}
        </div>
      ),
    },
    {
      key: "sslCert", title: t("sites.field.sslCert" as any), sortable: true, width: "130px",
      render: (_, r) => r.sslCert ? (
        <Link to={`/certs/admin/${r.sslCert}`} className="text-accent hover:underline text-[12px]" onClick={(e) => e.stopPropagation()}>{r.sslCert}</Link>
      ) : null,
    },
    {
      key: "__actions", fixed: "right" as const, title: t("common.action" as any), width: "120px",
      render: (_, r) => (
        <div className="flex items-center gap-1">
          <Link to={`/sites/${r.owner}/${r.name}`} className="rounded p-1.5 text-text-muted hover:text-warning hover:bg-warning/10 transition-colors" title={t("common.edit")} onClick={(e) => e.stopPropagation()}><Pencil size={14} /></Link>
          <button onClick={(e) => handleDelete(r, e)} className="rounded p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors" title={t("common.delete")}><Trash2 size={14} /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("sites.title" as any)}</h1>
          <p className="text-[13px] text-text-muted mt-0.5">{t("sites.subtitle" as any)}</p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button whileHover={{ rotate: 180 }} transition={{ duration: 0.3 }} onClick={list.refetch} className="rounded-lg border border-border p-2 text-text-muted hover:bg-surface-2 transition-colors" title={t("common.refresh")}><RefreshCw size={15} /></motion.button>
          <button onClick={handleAdd} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover transition-colors"><Plus size={15} /> {t("sites.add" as any)}</button>
        </div>
      </div>
      <DataTable columns={columns} data={list.items} rowKey="name" loading={list.loading} page={list.page} pageSize={list.pageSize} total={list.total} onPageChange={list.setPage} onSort={list.handleSort} onFilter={list.handleFilter} emptyText={t("common.noData")} />
    </div>
  );
}
