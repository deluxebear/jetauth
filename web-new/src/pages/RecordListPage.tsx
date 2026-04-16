import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { RefreshCw, X, Copy, Check } from "lucide-react";
import DataTable, { type Column } from "../components/DataTable";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityList } from "../hooks/useEntityList";
import { useOrganization } from "../OrganizationContext";
import * as RecordBackend from "../backend/RecordBackend";
import type { Record as CasdoorRecord } from "../backend/RecordBackend";

function formatJson(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}

/** HTTP method badge with color coding */
function MethodBadge({ method }: { method: string }) {
  if (!method) return <span className="text-text-muted">—</span>;
  const colors: Record<string, string> = {
    GET: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    POST: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    PUT: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    PATCH: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
    DELETE: "bg-red-500/15 text-red-600 dark:text-red-400",
    HEAD: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
    OPTIONS: "bg-gray-500/15 text-gray-600 dark:text-gray-400",
  };
  const cls = colors[method.toUpperCase()] || "bg-surface-3 text-text-secondary";
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-mono font-semibold ${cls}`}>
      {method}
    </span>
  );
}

/** Status code with color coding */
function StatusCodeBadge({ code }: { code: number | undefined }) {
  if (code == null) return <span className="text-text-muted">—</span>;
  let cls = "text-text-secondary";
  if (code >= 200 && code < 300) cls = "text-emerald-600 dark:text-emerald-400";
  else if (code >= 400 && code < 500) cls = "text-amber-600 dark:text-amber-400";
  else if (code >= 500) cls = "text-red-600 dark:text-red-400";
  return <span className={`font-mono text-[12px] font-medium ${cls}`}>{code}</span>;
}

/** Copyable JSON block with copy button */
function CopyableJsonBlock({
  content,
  label,
  onCopied,
}: {
  content: string;
  label: string;
  onCopied: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const formatted = content ? formatJson(content) : "—";

  const handleCopy = async () => {
    if (!content) return;
    await navigator.clipboard.writeText(formatted);
    setCopied(true);
    onCopied();
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-text-secondary">{label}</span>
        {content && (
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-text-muted hover:text-accent hover:bg-accent/5 transition-colors"
          >
            {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
          </button>
        )}
      </div>
      <pre className="rounded-lg bg-surface-2 p-3 text-[11px] font-mono text-text-primary overflow-x-auto max-h-60 whitespace-pre-wrap">
        {formatted}
      </pre>
    </div>
  );
}

export default function RecordListPage() {
  const { t } = useTranslation();
  const modal = useModal();
  const { selectedOrg } = useOrganization();
  const [detailRecord, setDetailRecord] = useState<CasdoorRecord | null>(null);

  // Records API uses organizationName param — expects "" for global, not "admin"
  const recordOwner = selectedOrg === "All" ? "" : selectedOrg;

  const list = useEntityList<CasdoorRecord>({
    queryKey: "records",
    fetchFn: RecordBackend.getRecords,
    owner: recordOwner,
    pageSize: 20,
  });

  const columns: Column<CasdoorRecord>[] = [
    {
      key: "id",
      title: "ID",
      sortable: true,
      filterable: true,
      fixed: "left" as const,
      width: "90px",
      render: (_, r) => <span className="font-mono text-[12px]">{r.id}</span>,
    },
    {
      key: "name",
      title: t("records.field.name" as any),
      sortable: true,
      filterable: true,
      width: "200px",
      render: (_, r) => (
        <span
          className="text-[12px] text-text-secondary truncate block max-w-[180px]"
          title={r.name}
        >
          {r.name || "—"}
        </span>
      ),
    },
    {
      key: "clientIp",
      title: t("records.field.clientIp" as any),
      sortable: true,
      filterable: true,
      width: "120px",
      render: (_, r) =>
        r.clientIp ? (
          <a
            target="_blank"
            rel="noreferrer"
            href={`https://db-ip.com/${r.clientIp}`}
            className="text-accent hover:underline font-mono text-[12px]"
            onClick={(e) => e.stopPropagation()}
          >
            {r.clientIp}
          </a>
        ) : (
          <span className="text-text-muted">—</span>
        ),
    },
    {
      key: "createdTime",
      title: t("records.field.timestamp" as any),
      sortable: true,
      width: "150px",
      render: (_, r) => (
        <span className="text-[12px] text-text-muted font-mono">
          {r.createdTime ? new Date(r.createdTime).toLocaleString() : "—"}
        </span>
      ),
    },
    {
      key: "organization",
      title: t("col.organization" as any),
      sortable: true,
      filterable: true,
      width: "110px",
      render: (_, r) =>
        r.organization ? (
          <Link
            to={`/organizations/admin/${r.organization}`}
            className="text-accent hover:underline text-[12px]"
            onClick={(e) => e.stopPropagation()}
          >
            {r.organization}
          </Link>
        ) : (
          <span className="text-text-muted">—</span>
        ),
    },
    {
      key: "user",
      title: t("col.user" as any),
      sortable: true,
      filterable: true,
      width: "100px",
      render: (_, r) =>
        r.user ? (
          <Link
            to={`/users/${r.organization}/${r.user}`}
            className="text-accent hover:underline text-[12px]"
            onClick={(e) => e.stopPropagation()}
          >
            {r.user}
          </Link>
        ) : (
          <span className="text-text-muted">—</span>
        ),
    },
    {
      key: "method",
      title: t("records.field.method" as any),
      sortable: true,
      filterable: true,
      width: "100px",
      render: (_, r) => <MethodBadge method={r.method} />,
    },
    {
      key: "requestUri",
      title: t("records.field.requestUri" as any),
      sortable: true,
      filterable: true,
      width: "200px",
      render: (_, r) => (
        <span
          className="text-[12px] text-text-muted truncate block max-w-[180px] font-mono"
          title={r.requestUri}
        >
          {r.requestUri || "—"}
        </span>
      ),
    },
    {
      key: "language",
      title: t("records.field.language" as any),
      sortable: true,
      filterable: true,
      width: "90px",
      render: (_, r) => <span className="text-[12px]">{r.language || "—"}</span>,
    },
    {
      key: "statusCode",
      title: t("records.field.statusCode" as any),
      sortable: true,
      filterable: true,
      width: "100px",
      render: (_, r) => <StatusCodeBadge code={r.statusCode} />,
    },
    {
      key: "response",
      title: t("records.field.response" as any),
      sortable: true,
      filterable: true,
      width: "220px",
      render: (_, r) => (
        <span
          className="text-[12px] text-text-muted truncate block max-w-[200px]"
          title={r.response}
        >
          {r.response || "—"}
        </span>
      ),
    },
    {
      key: "object",
      title: t("records.field.object" as any),
      sortable: true,
      filterable: true,
      width: "200px",
      render: (_, r) => (
        <span
          className="text-[12px] text-text-muted truncate block max-w-[180px]"
          title={r.object}
        >
          {r.object || "—"}
        </span>
      ),
    },
    {
      key: "action",
      title: t("records.field.action" as any),
      sortable: true,
      filterable: true,
      width: "200px",
      fixed: "right" as const,
      render: (_, r) => <span className="text-[12px]">{r.action || "—"}</span>,
    },
    {
      key: "isTriggered",
      title: t("records.field.isTriggered" as any),
      sortable: true,
      width: "80px",
      fixed: "right" as const,
      render: (_, r) => {
        if (
          !["signup", "login", "logout", "update-user", "new-user"].includes(
            r.action
          )
        ) {
          return null;
        }
        return (
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
              r.isTriggered
                ? "bg-success/15 text-success"
                : "bg-surface-3 text-text-muted"
            }`}
          >
            {r.isTriggered
              ? t("common.on" as any)
              : t("common.off" as any)}
          </span>
        );
      },
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
            {t("records.title" as any)}
          </h1>
          <p className="text-[13px] text-text-muted mt-0.5">
            {t("records.subtitle" as any)}
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
        rowKey="id"
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
            className="relative w-full max-w-xl bg-surface-0 shadow-2xl border-l border-border overflow-y-auto"
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
              {(
                [
                  ["ID", "id"],
                  [t("records.field.name" as any), "name"],
                  [t("records.field.clientIp" as any), "clientIp"],
                  [t("records.field.timestamp" as any), "createdTime"],
                  [t("col.organization" as any), "organization"],
                  [t("col.user" as any), "user"],
                  [t("records.field.method" as any), "method"],
                  [t("records.field.requestUri" as any), "requestUri"],
                  [t("records.field.language" as any), "language"],
                  [t("records.field.statusCode" as any), "statusCode"],
                  [t("records.field.action" as any), "action"],
                  [t("records.field.isTriggered" as any), "isTriggered"],
                ] as [string, string][]
              ).map(([label, key]) => (
                <div
                  key={key}
                  className="grid grid-cols-[140px_1fr] gap-2 text-[13px] border-b border-border-subtle pb-3"
                >
                  <span className="font-medium text-text-secondary">
                    {label}
                  </span>
                  <span className="font-mono text-text-primary break-all">
                    {key === "organization" ? (
                      detailRecord.organization ? (
                        <Link
                          to={`/organizations/admin/${detailRecord.organization}`}
                          className="text-accent hover:underline"
                        >
                          {detailRecord.organization}
                        </Link>
                      ) : (
                        "—"
                      )
                    ) : key === "user" ? (
                      detailRecord.user ? (
                        <Link
                          to={`/users/${detailRecord.organization}/${detailRecord.user}`}
                          className="text-accent hover:underline"
                        >
                          {detailRecord.user}
                        </Link>
                      ) : (
                        "—"
                      )
                    ) : key === "clientIp" ? (
                      detailRecord.clientIp ? (
                        <a
                          target="_blank"
                          rel="noreferrer"
                          href={`https://db-ip.com/${detailRecord.clientIp}`}
                          className="text-accent hover:underline"
                        >
                          {detailRecord.clientIp}
                        </a>
                      ) : (
                        "—"
                      )
                    ) : key === "method" ? (
                      <MethodBadge method={detailRecord.method} />
                    ) : key === "statusCode" ? (
                      <StatusCodeBadge code={detailRecord.statusCode} />
                    ) : key === "isTriggered" ? (
                      ["signup", "login", "logout", "update-user", "new-user"].includes(detailRecord.action) ? (
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            detailRecord.isTriggered
                              ? "bg-success/15 text-success"
                              : "bg-surface-3 text-text-muted"
                          }`}
                        >
                          {detailRecord.isTriggered
                            ? t("common.on" as any)
                            : t("common.off" as any)}
                        </span>
                      ) : (
                        "—"
                      )
                    ) : (
                      String(
                        (detailRecord as Record<string, unknown>)[key] ?? "—"
                      )
                    )}
                  </span>
                </div>
              ))}

              {/* Response — with copy button */}
              <CopyableJsonBlock
                content={detailRecord.response}
                label={t("records.field.response" as any)}
                onCopied={() =>
                  modal.toast(t("records.copied" as any), "success")
                }
              />

              {/* Object — with copy button */}
              <CopyableJsonBlock
                content={detailRecord.object}
                label={t("records.field.object" as any)}
                onCopied={() =>
                  modal.toast(t("records.copied" as any), "success")
                }
              />
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
