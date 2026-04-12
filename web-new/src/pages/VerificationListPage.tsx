import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import DataTable, { type Column } from "../components/DataTable";
import { useTranslation } from "../i18n";
import { useEntityList } from "../hooks/useEntityList";
import * as VerificationBackend from "../backend/VerificationBackend";
import type { Verification } from "../backend/VerificationBackend";

export default function VerificationListPage() {
  const { t } = useTranslation();
  const list = useEntityList<Verification>({
    queryKey: "verifications",
    fetchFn: VerificationBackend.getVerifications,
  });

  const columns: Column<Verification>[] = [
    {
      key: "owner", title: t("col.organization" as any), sortable: true, filterable: true, width: "120px",
      render: (_, r) => {
        if (r.owner === "admin") {
          return <span className="text-[12px] text-text-muted">({t("common.empty" as any)})</span>;
        }
        return <Link to={`/organizations/${r.owner}`} className="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{r.owner}</Link>;
      },
    },
    {
      key: "name", title: t("col.name" as any), sortable: true, filterable: true, fixed: "left" as const, width: "260px",
    },
    {
      key: "createdTime", title: t("col.created" as any), sortable: true, width: "160px",
      render: (_, r) => <span className="text-[12px] text-text-muted font-mono">{r.createdTime ? new Date(r.createdTime).toLocaleString() : "\u2014"}</span>,
    },
    {
      key: "type", title: t("col.type" as any), sortable: true, filterable: true, width: "90px",
    },
    {
      key: "user", title: t("col.user" as any), sortable: true, filterable: true, width: "120px",
      render: (_, r) => <Link to={`/users/${r.user}`} className="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{r.user}</Link>,
    },
    {
      key: "provider", title: t("col.provider" as any), sortable: true, filterable: true, width: "150px",
      render: (_, r) => <Link to={`/providers/${r.owner}/${r.provider}`} className="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{r.provider}</Link>,
    },
    {
      key: "remoteAddr", title: t("records.field.clientIp" as any), sortable: true, filterable: true, width: "100px",
      render: (_, r) => {
        let clientIp = r.remoteAddr || "";
        if (clientIp.endsWith(": ")) {
          clientIp = clientIp.slice(0, -2);
        }
        return (
          <a target="_blank" rel="noreferrer" href={`https://db-ip.com/${clientIp}`} className="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
            {clientIp}
          </a>
        );
      },
    },
    {
      key: "receiver", title: t("verifications.field.receiver" as any), sortable: true, filterable: true, width: "120px",
    },
    {
      key: "code", title: t("verifications.field.code" as any), sortable: true, filterable: true, width: "150px",
      render: (_, r) => <span className="font-mono text-[11px] text-text-muted">{r.code || "\u2014"}</span>,
    },
    {
      key: "isUsed", title: t("verifications.field.isUsed" as any), sortable: true, width: "90px",
      render: (_, r) => (
        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${r.isUsed ? "bg-success/15 text-success" : "bg-surface-3 text-text-muted"}`}>
          {r.isUsed ? t("common.on" as any) : t("common.off" as any)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("verifications.title" as any)}</h1>
          <p className="text-[13px] text-text-muted mt-0.5">{t("verifications.subtitle" as any)}</p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button whileHover={{ rotate: 180 }} transition={{ duration: 0.3 }} onClick={list.refetch} className="rounded-lg border border-border p-2 text-text-muted hover:bg-surface-2 transition-colors" title={t("common.refresh")}><RefreshCw size={15} /></motion.button>
        </div>
      </div>
      <DataTable columns={columns} data={list.items} rowKey="name" loading={list.loading} page={list.page} pageSize={list.pageSize} total={list.total} onPageChange={list.setPage} onSort={list.handleSort} onFilter={list.handleFilter} emptyText={t("common.noData")} />
    </div>
  );
}
