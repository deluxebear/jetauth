import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { RefreshCw, X, Mail, Smartphone } from "lucide-react";
import DataTable, { type Column } from "../components/DataTable";
import { useTranslation } from "../i18n";
import { useEntityList } from "../hooks/useEntityList";
import * as VerificationBackend from "../backend/VerificationBackend";
import type { Verification } from "../backend/VerificationBackend";

/** Type badge with icon */
function TypeBadge({ type, t }: { type: string; t: (key: string) => string }) {
  if (!type) return <span className="text-text-muted">—</span>;
  const isEmail = type.toLowerCase() === "email";
  const isPhone = type.toLowerCase() === "phone" || type.toLowerCase() === "sms";
  const Icon = isEmail ? Mail : isPhone ? Smartphone : null;
  const label = isEmail
    ? t("verifications.type.email" as any)
    : isPhone
      ? t("verifications.type.phone" as any)
      : type;
  const cls = isEmail
    ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
    : isPhone
      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
      : "bg-surface-3 text-text-secondary";
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>
      {Icon && <Icon size={11} />}
      {label}
    </span>
  );
}

/** Clean up remote addr trailing ": " */
function cleanIp(addr: string): string {
  let ip = addr || "";
  if (ip.endsWith(": ")) ip = ip.slice(0, -2);
  return ip;
}

/** Format Unix timestamp to locale string */
function formatUnixTime(ts: number): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString();
}

export default function VerificationListPage() {
  const { t } = useTranslation();
  const [detailRecord, setDetailRecord] = useState<Verification | null>(null);

  const list = useEntityList<Verification>({
    queryKey: "verifications",
    fetchFn: VerificationBackend.getVerifications,
  });

  const columns: Column<Verification>[] = [
    {
      key: "owner",
      title: t("col.organization" as any),
      sortable: true,
      filterable: true,
      width: "120px",
      render: (_, r) => {
        if (r.owner === "admin") {
          return (
            <span className="text-[12px] text-text-muted">
              ({t("common.empty" as any)})
            </span>
          );
        }
        return (
          <Link
            to={`/organizations/admin/${r.owner}`}
            className="text-accent hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {r.owner}
          </Link>
        );
      },
    },
    {
      key: "name",
      title: t("col.name" as any),
      sortable: true,
      filterable: true,
      fixed: "left" as const,
      width: "260px",
    },
    {
      key: "createdTime",
      title: t("col.created" as any),
      sortable: true,
      width: "160px",
      render: (_, r) => (
        <span className="text-[12px] text-text-muted font-mono">
          {r.createdTime ? new Date(r.createdTime).toLocaleString() : "—"}
        </span>
      ),
    },
    {
      key: "type",
      title: t("col.type" as any),
      sortable: true,
      filterable: true,
      width: "100px",
      render: (_, r) => <TypeBadge type={r.type} t={t} />,
    },
    {
      key: "user",
      title: t("col.user" as any),
      sortable: true,
      filterable: true,
      width: "120px",
      render: (_, r) =>
        r.user ? (
          <Link
            to={`/users/${r.owner}/${r.user}`}
            className="text-accent hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {r.user}
          </Link>
        ) : (
          <span className="text-text-muted">—</span>
        ),
    },
    {
      key: "provider",
      title: t("col.provider" as any),
      sortable: true,
      filterable: true,
      width: "150px",
      render: (_, r) =>
        r.provider ? (
          <Link
            to={`/providers/${r.owner}/${r.provider}`}
            className="text-accent hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {r.provider}
          </Link>
        ) : (
          <span className="text-text-muted">—</span>
        ),
    },
    {
      key: "remoteAddr",
      title: t("verifications.field.remoteAddr" as any),
      sortable: true,
      filterable: true,
      width: "120px",
      render: (_, r) => {
        const ip = cleanIp(r.remoteAddr);
        if (!ip) return <span className="text-text-muted">—</span>;
        return (
          <a
            target="_blank"
            rel="noreferrer"
            href={`https://db-ip.com/${ip}`}
            className="text-accent hover:underline font-mono text-[12px]"
            onClick={(e) => e.stopPropagation()}
          >
            {ip}
          </a>
        );
      },
    },
    {
      key: "receiver",
      title: t("verifications.field.receiver" as any),
      sortable: true,
      filterable: true,
      width: "140px",
      render: (_, r) => (
        <span className="text-[12px] font-mono text-text-secondary truncate block max-w-[120px]" title={r.receiver}>
          {r.receiver || "—"}
        </span>
      ),
    },
    {
      key: "code",
      title: t("verifications.field.code" as any),
      sortable: true,
      filterable: true,
      width: "120px",
      render: (_, r) => (
        <span className="inline-block rounded bg-surface-3 px-2 py-0.5 font-mono text-[12px] text-text-secondary tracking-widest">
          {r.code || "—"}
        </span>
      ),
    },
    {
      key: "isUsed",
      title: t("verifications.field.isUsed" as any),
      sortable: true,
      width: "90px",
      fixed: "right" as const,
      render: (_, r) => (
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
            r.isUsed
              ? "bg-success/15 text-success"
              : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
          }`}
        >
          {r.isUsed
            ? t("verifications.state.used" as any)
            : t("verifications.state.unused" as any)}
        </span>
      ),
    },
    {
      key: "__actions",
      fixed: "right" as const,
      title: t("common.action" as any),
      width: "80px",
      render: (_, r) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setDetailRecord(r);
          }}
          className="text-accent hover:text-accent-hover text-[12px] font-medium transition-colors"
        >
          {t("common.detail" as any)}
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            {t("verifications.title" as any)}
          </h1>
          <p className="text-[13px] text-text-muted mt-0.5">
            {t("verifications.subtitle" as any)}
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
      />

      {/* Detail Drawer */}
      {detailRecord && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setDetailRecord(null)}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-md bg-surface-0 shadow-2xl border-l border-border overflow-y-auto"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between bg-surface-0 border-b border-border px-6 py-4">
              <h2 className="text-lg font-bold">
                {t("common.detail" as any)}
              </h2>
              <button
                onClick={() => setDetailRecord(null)}
                className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Basic fields */}
              {(
                [
                  [t("verifications.field.name" as any), "name"],
                  [t("verifications.field.owner" as any), "owner"],
                  [t("verifications.field.createdTime" as any), "createdTime"],
                  [t("verifications.field.type" as any), "type"],
                  [t("verifications.field.user" as any), "user"],
                  [t("verifications.field.provider" as any), "provider"],
                  [t("verifications.field.remoteAddr" as any), "remoteAddr"],
                  [t("verifications.field.receiver" as any), "receiver"],
                  [t("verifications.field.code" as any), "code"],
                  [t("verifications.field.time" as any), "time"],
                  [t("verifications.field.isUsed" as any), "isUsed"],
                ] as [string, string][]
              ).map(([label, key]) => (
                <div
                  key={key}
                  className="grid grid-cols-[120px_1fr] gap-2 text-[13px] border-b border-border-subtle pb-3"
                >
                  <span className="font-medium text-text-secondary">
                    {label}
                  </span>
                  <span className="text-text-primary break-all">
                    {key === "owner" ? (
                      detailRecord.owner === "admin" ? (
                        <span className="text-text-muted">
                          ({t("common.empty" as any)})
                        </span>
                      ) : (
                        <Link
                          to={`/organizations/admin/${detailRecord.owner}`}
                          className="text-accent hover:underline"
                        >
                          {detailRecord.owner}
                        </Link>
                      )
                    ) : key === "user" ? (
                      detailRecord.user ? (
                        <Link
                          to={`/users/${detailRecord.owner}/${detailRecord.user}`}
                          className="text-accent hover:underline"
                        >
                          {detailRecord.user}
                        </Link>
                      ) : (
                        "—"
                      )
                    ) : key === "provider" ? (
                      detailRecord.provider ? (
                        <Link
                          to={`/providers/${detailRecord.owner}/${detailRecord.provider}`}
                          className="text-accent hover:underline"
                        >
                          {detailRecord.provider}
                        </Link>
                      ) : (
                        "—"
                      )
                    ) : key === "remoteAddr" ? (
                      (() => {
                        const ip = cleanIp(detailRecord.remoteAddr);
                        return ip ? (
                          <a
                            target="_blank"
                            rel="noreferrer"
                            href={`https://db-ip.com/${ip}`}
                            className="text-accent hover:underline font-mono"
                          >
                            {ip}
                          </a>
                        ) : (
                          "—"
                        );
                      })()
                    ) : key === "type" ? (
                      <TypeBadge type={detailRecord.type} t={t} />
                    ) : key === "code" ? (
                      <span className="inline-block rounded bg-surface-3 px-2 py-0.5 font-mono tracking-widest">
                        {detailRecord.code || "—"}
                      </span>
                    ) : key === "time" ? (
                      <span className="font-mono text-[12px]">
                        {formatUnixTime(detailRecord.time)}
                      </span>
                    ) : key === "isUsed" ? (
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          detailRecord.isUsed
                            ? "bg-success/15 text-success"
                            : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {detailRecord.isUsed
                          ? t("verifications.state.used" as any)
                          : t("verifications.state.unused" as any)}
                      </span>
                    ) : key === "createdTime" ? (
                      <span className="font-mono text-[12px]">
                        {detailRecord.createdTime
                          ? new Date(detailRecord.createdTime).toLocaleString()
                          : "—"}
                      </span>
                    ) : (
                      String(
                        (detailRecord as Record<string, unknown>)[key] ?? "—"
                      )
                    )}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
