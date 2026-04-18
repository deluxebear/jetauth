import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, RefreshCw, Trash2, Pencil, RotateCw } from "lucide-react";
import DataTable, { type Column } from "../components/DataTable";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityList } from "../hooks/useEntityList";
import { useOrganization } from "../OrganizationContext";
import * as CertBackend from "../backend/CertBackend";
import type { Cert } from "../backend/CertBackend";
import { getStoredAccount, isGlobalAdmin } from "../utils/auth";

export default function CertListPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const modal = useModal();
  const { getNewEntityOwner } = useOrganization();

  const account = getStoredAccount();
  const isAdmin = isGlobalAdmin(account);

  const list = useEntityList<Cert>({
    queryKey: "certs",
    fetchFn: CertBackend.getCerts,
  });

  const handleAdd = async () => {
    const cert = CertBackend.newCert(getNewEntityOwner());
    const res = await CertBackend.addCert(cert);
    if (res.status === "ok") {
      navigate(`/certs/${cert.owner}/${cert.name}`, { state: { mode: "add" } });
    } else {
      modal.toast(res.msg || t("common.addFailed" as any), "error");
    }
  };

  const handleDelete = (record: Cert, e: React.MouseEvent) => {
    e.stopPropagation();
    modal.showConfirm(
      `${t("common.confirmDelete")} [${record.displayName || record.name}]`,
      async () => {
        const res = await CertBackend.deleteCert(record);
        if (res.status === "ok") list.refetch();
        else modal.toast(res.msg || t("common.deleteFailed" as any), "error");
      }
    );
  };

  const handleRefreshDomain = async (record: Cert, e: React.MouseEvent) => {
    e.stopPropagation();
    const res = await CertBackend.refreshDomainExpire(record.owner, record.name);
    if (res.status === "ok") list.refetch();
    else modal.toast(res.msg || t("common.saveFailed" as any), "error");
  };

  const canOperate = (record: Cert) => isAdmin || record.owner === account?.owner;

  const columns: Column<Cert>[] = [
    {
      key: "name", title: t("col.name" as any), sortable: true, filterable: true, fixed: "left" as const, width: "120px",
      render: (_, r) => <Link to={`/certs/${r.owner}/${r.name}`} className="font-mono font-medium text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{r.name}</Link>,
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
    { key: "scope", title: t("col.scope" as any), sortable: true, filterable: true, width: "90px" },
    { key: "type", title: t("col.type" as any), sortable: true, filterable: true, width: "90px" },
    {
      key: "cryptoAlgorithm", title: t("col.algorithm" as any), sortable: true, filterable: true, width: "120px",
      render: (_, r) => <span className="font-mono text-[11px] text-text-muted">{r.cryptoAlgorithm}</span>,
    },
    {
      key: "bitSize", title: t("certs.field.bitSize" as any), sortable: true, filterable: true, width: "90px",
      render: (_, r) => <span className="font-mono text-[11px] text-text-muted">{r.bitSize || "—"}</span>,
    },
    { key: "expireInYears", title: t("certs.field.expireInYears" as any), sortable: true, filterable: true, width: "100px" },
    {
      key: "__actions", fixed: "right" as const, title: t("common.action" as any), width: "140px",
      render: (_, r) => (
        <div className="flex items-center gap-1">
          {r.type === "SSL" && (
            <button
              onClick={(e) => handleRefreshDomain(r, e)}
              disabled={!canOperate(r)}
              className="rounded p-1.5 text-text-muted hover:text-info hover:bg-info/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title={t("certs.refreshDomain" as any)}
            >
              <RotateCw size={14} />
            </button>
          )}
          <Link
            to={`/certs/${r.owner}/${r.name}`}
            className={`rounded p-1.5 transition-colors ${canOperate(r) ? "text-text-muted hover:text-warning hover:bg-warning/10" : "text-text-muted opacity-30 pointer-events-none"}`}
            title={t("common.edit")}
            onClick={(e) => e.stopPropagation()}
          >
            <Pencil size={14} />
          </Link>
          <button
            onClick={(e) => handleDelete(r, e)}
            disabled={!canOperate(r)}
            className="rounded p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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
          <h1 className="text-xl font-bold tracking-tight">{t("certs.title" as any)}</h1>
          <p className="text-[13px] text-text-muted mt-0.5">{t("certs.subtitle" as any)}</p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button whileHover={{ rotate: 180 }} transition={{ duration: 0.3 }} onClick={list.refetch} className="rounded-lg border border-border p-2 text-text-muted hover:bg-surface-2 transition-colors" title={t("common.refresh")}><RefreshCw size={15} /></motion.button>
          <button onClick={handleAdd} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover transition-colors"><Plus size={15} /> {t("certs.add" as any)}</button>
        </div>
      </div>
      <DataTable columns={columns} data={list.items} rowKey="name" loading={list.loading} page={list.page} pageSize={list.pageSize} total={list.total} onPageChange={list.setPage} onSort={list.handleSort} onFilter={list.handleFilter} emptyText={t("common.noData")} persistKey="list:certs" resizable columnsToggle />
    </div>
  );
}
