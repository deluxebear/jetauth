import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Check, RefreshCw, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DataTable, { type Column } from "../components/DataTable";
import PermissionStateBadge from "../components/PermissionStateBadge";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityList } from "../hooks/useEntityList";
import * as PermissionBackend from "../backend/PermissionBackend";
import type { Permission } from "../backend/PermissionBackend";
import { canApprovePermission, getStoredAccount } from "../utils/auth";

type Tab = "pending" | "mine";

const dash = <span className="text-text-muted text-[12px]">{"—"}</span>;

export default function PermissionApprovalsPage() {
  const { t } = useTranslation();
  const modal = useModal();
  const queryClient = useQueryClient();
  const account = getStoredAccount();
  const [tab, setTab] = useState<Tab>("pending");

  const pending = useEntityList<Permission>({
    queryKey: "permission-approvals",
    fetchFn: PermissionBackend.getPendingPermissions,
  });

  const mine = useQuery({
    queryKey: ["permission-submissions"],
    queryFn: () => PermissionBackend.getPermissionsBySubmitter(),
    enabled: tab === "mine",
  });
  const myItems = mine.data?.status === "ok" && Array.isArray(mine.data.data) ? mine.data.data : [];

  const refresh = () => {
    pending.refetch();
    queryClient.invalidateQueries({ queryKey: ["permission-submissions"] });
    queryClient.invalidateQueries({ queryKey: ["permissions"] });
  };

  const handleApprove = async (r: Permission) => {
    const res = await PermissionBackend.approvePermission(r.owner, r.name, r.contentHash ?? "");
    if (res.status === "ok") {
      modal.toast(t("permissions.approveSuccess"));
      refresh();
    } else if (await PermissionBackend.hasPermissionContentChanged(r.owner, r.name, r.contentHash)) {
      modal.toast(t("permissions.contentChanged"), "error");
      refresh();
    } else {
      modal.toast(res.msg || t("permissions.approveFailed"), "error");
    }
  };

  const handleReject = async (r: Permission) => {
    const reason = await modal.prompt({
      title: t("permissions.rejectTitle"),
      message: `${r.owner}/${r.name}`,
      placeholder: t("permissions.rejectReasonPlaceholder"),
      maxLength: 500,
      confirmLabel: t("permissions.reject"),
    });
    if (reason === null) return;
    if (!reason.trim()) {
      modal.toast(t("permissions.rejectReasonRequired"), "error");
      return;
    }
    const res = await PermissionBackend.rejectPermission(r.owner, r.name, reason.trim(), r.contentHash);
    if (res.status === "ok") {
      modal.toast(t("permissions.rejectSuccess"));
      refresh();
    } else if (await PermissionBackend.hasPermissionContentChanged(r.owner, r.name, r.contentHash)) {
      modal.toast(t("permissions.contentChanged"), "error");
      refresh();
    } else {
      modal.toast(res.msg || t("permissions.rejectFailed"), "error");
    }
  };

  const baseColumns: Column<Permission>[] = [
    {
      key: "name", title: t("col.name"), width: "180px", fixed: "left" as const,
      render: (_, r) => <Link to={`/permissions/${r.owner}/${encodeURIComponent(r.name)}`} className="font-mono font-medium text-accent hover:underline">{r.name}</Link>,
    },
    {
      key: "owner", title: t("col.organization"), width: "120px",
      render: (_, r) => <span className="text-[12px] text-text-secondary">{r.owner}</span>,
    },
    { key: "displayName", title: t("col.displayName"), width: "160px" },
    {
      key: "resources", title: t("permissions.field.resources"),
      render: (_, r) => <span className="text-[12px] text-text-muted">{r.resources?.join(", ") || "—"}</span>,
    },
    {
      key: "actions", title: t("permissions.field.actions"),
      render: (_, r) => <span className="text-[12px] text-text-muted">{r.actions?.join(", ") || "—"}</span>,
    },
    {
      key: "submitter", title: t("permissions.field.submitter"), width: "120px",
      render: (_, r) => r.submitter ? <span className="text-[12px]">{r.submitter}</span> : dash,
    },
    {
      key: "createdTime", title: t("col.created"), width: "160px",
      render: (_, r) => <span className="text-[12px] text-text-muted font-mono">{r.createdTime ? new Date(r.createdTime).toLocaleString() : "—"}</span>,
    },
  ];

  const pendingColumns: Column<Permission>[] = [
    ...baseColumns,
    {
      key: "__actions", fixed: "right" as const, title: t("common.action"), width: "180px",
      render: (_, r) => {
        const canOp = canApprovePermission(account, r.owner);
        return (
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleApprove(r)}
              disabled={!canOp}
              title={canOp ? t("permissions.approve") : t("permissions.adminOnly")}
              className="flex items-center gap-1 rounded px-2 py-1 text-[12px] font-medium text-success hover:bg-success/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            ><Check size={13} /> {t("permissions.approve")}</button>
            <button
              onClick={() => handleReject(r)}
              disabled={!canOp}
              title={canOp ? t("permissions.reject") : t("permissions.adminOnly")}
              className="flex items-center gap-1 rounded px-2 py-1 text-[12px] font-medium text-danger hover:bg-danger/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            ><X size={13} /> {t("permissions.reject")}</button>
          </div>
        );
      },
    },
  ];

  const mineColumns: Column<Permission>[] = [
    ...baseColumns.filter((c) => c.key !== "submitter"),
    {
      key: "state", title: t("permissions.field.state"), width: "120px",
      render: (_, r) => <PermissionStateBadge state={r.state} />,
    },
    {
      key: "rejectReason", title: t("permissions.field.rejectReason"), width: "220px",
      render: (_, r) => r.state === "Rejected" && r.rejectReason ? <span className="text-[12px] text-danger">{r.rejectReason}</span> : dash,
    },
  ];

  const tabs: { key: Tab; label: string }[] = [
    { key: "pending", label: t("permissions.approvals.pendingTab") },
    { key: "mine", label: t("permissions.approvals.mineTab") },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("permissions.approvals.title")}</h1>
          <p className="text-[13px] text-text-muted mt-0.5">{t("permissions.approvals.subtitle")}</p>
        </div>
        <motion.button whileHover={{ rotate: 180 }} transition={{ duration: 0.3 }} onClick={refresh} className="rounded-lg border border-border p-2 text-text-muted hover:bg-surface-2 transition-colors" title={t("common.refresh")}><RefreshCw size={15} /></motion.button>
      </div>

      <div role="tablist" className="flex gap-1 border-b border-border">
        {tabs.map((x) => (
          <button
            key={x.key}
            role="tab"
            aria-selected={tab === x.key}
            onClick={() => setTab(x.key)}
            className={`px-3 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${tab === x.key ? "border-accent text-accent" : "border-transparent text-text-muted hover:text-text-primary"}`}
          >{x.label}</button>
        ))}
      </div>

      {tab === "pending" ? (
        <DataTable
          columns={pendingColumns}
          data={pending.items}
          rowKey={(r) => `${r.owner}/${r.name}`}
          loading={pending.loading}
          page={pending.page}
          pageSize={pending.pageSize}
          total={pending.total}
          onPageChange={pending.setPage}
          emptyText={t("permissions.approvals.emptyPending")}
        />
      ) : (
        <DataTable
          columns={mineColumns}
          data={myItems}
          rowKey={(r) => `${r.owner}/${r.name}`}
          loading={mine.isLoading}
          clientSort
          clientPagination
          emptyText={t("permissions.approvals.emptyMine")}
        />
      )}
    </div>
  );
}
