import { useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, RefreshCw, Trash2, Users, Boxes, Pencil } from "lucide-react";
import DataTable, { type Column, useTablePrefs, ColumnsMenu } from "../components/DataTable";
import { BulkDeleteBar } from "../components/BulkDeleteBar";
import { useBulkDelete } from "../hooks/useBulkDelete";
import StatusBadge from "../components/StatusBadge";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityList } from "../hooks/useEntityList";
import { useOrganization } from "../OrganizationContext";
import * as OrgBackend from "../backend/OrganizationBackend";
import type { Organization } from "../backend/OrganizationBackend";
import { safeExternalUrl } from "../utils/safeUrl";

export default function OrganizationListPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const modal = useModal();
  const { selectedOrg, isAll, refreshOrgOptions, isGlobalAdmin } = useOrganization();

  // Global admins use owner="admin" to list all orgs; org admins use their own org
  // so the authz filter's subOwner==objOwner check passes.
  const fetchFn = useCallback((params: Parameters<typeof OrgBackend.getOrganizations>[0]) => {
    return OrgBackend.getOrganizations({
      ...params,
      owner: isGlobalAdmin ? "admin" : selectedOrg,
      organizationName: isAll ? "" : selectedOrg,
    });
  }, [isAll, isGlobalAdmin, selectedOrg]);

  const list = useEntityList<Organization>({
    queryKey: "organizations",
    fetchFn,
    owner: isGlobalAdmin ? "admin" : selectedOrg,
    extraKeys: [selectedOrg],
  });
  const prefs = useTablePrefs({ persistKey: "list:organizations" });
  const bulkDelete = useBulkDelete<Organization>(OrgBackend.deleteOrganization, list.refetch);

  const handleAdd = async () => {
    const rand = Math.random().toString(36).substring(2, 8);
    const org = OrgBackend.newOrganization(rand);
    const res = await OrgBackend.addOrganization(org);
    if (res.status === "ok") {
      refreshOrgOptions();
      navigate(`/organizations/${org.owner}/${org.name}`, { state: { mode: "add" } });
    } else {
      modal.toast(res.msg || t("common.addFailed" as any), "error");
    }
  };

  const handleDelete = (record: Organization, e: React.MouseEvent) => {
    e.stopPropagation();
    if (record.name === "built-in") {
      modal.toast("Cannot delete built-in organization", "error");
      return;
    }
    modal.showConfirm(
      `${t("common.confirmDelete")} [${record.displayName || record.name}]`,
      async () => {
        const res = await OrgBackend.deleteOrganization(record);
        if (res.status === "ok") { list.refetch(); refreshOrgOptions(); }
        else modal.toast(res.msg || t("common.deleteFailed" as any), "error");
      }
    );
  };

  const columns: Column<Organization>[] = [
    {
      key: "name",
      title: t("col.name" as any),
      fixed: "left" as const,
      sortable: true,
      filterable: true,
      width: "120px",
      render: (_, r) => (
        <Link
          to={`/organizations/${r.owner}/${r.name}`}
          className="font-mono font-medium text-accent hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {r.name}
        </Link>
      ),
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
      key: "displayName",
      title: t("col.displayName" as any),
      sortable: true,
      filterable: true,
    },
    {
      key: "favicon",
      title: t("col.favicon" as any),
      width: "60px",
      render: (_, r) =>
        r.favicon ? (
          <img src={r.favicon} alt="" className="h-5 w-5 object-contain" />
        ) : (
          <span className="text-text-muted text-[12px]">—</span>
        ),
    },
    {
      key: "websiteUrl",
      title: t("col.website" as any),
      render: (_, r) =>
        r.websiteUrl ? (
          <a
            href={safeExternalUrl(r.websiteUrl)}
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:underline text-[12px] truncate block max-w-[180px]"
            onClick={(e) => e.stopPropagation()}
          >
            {r.websiteUrl}
          </a>
        ) : (
          <span className="text-text-muted text-[12px]">—</span>
        ),
    },
    {
      key: "passwordType",
      title: t("col.passwordType" as any),
      width: "120px",
      sortable: true,
      filterable: true,
      render: (_, r) => (
        <span className="font-mono text-[12px] text-text-muted">
          {r.passwordType || "—"}
        </span>
      ),
    },
    {
      key: "passwordSalt",
      title: t("col.passwordSalt" as any),
      width: "160px",
      sortable: true,
      filterable: true,
      render: (_, r) => (
        <span className="font-mono text-[12px] text-text-muted">
          {r.passwordSalt || "—"}
        </span>
      ),
    },
    {
      key: "defaultAvatar",
      title: t("col.defaultAvatar" as any),
      width: "80px",
      render: (_, r) =>
        r.defaultAvatar ? (
          <img
            src={r.defaultAvatar}
            alt=""
            className="h-7 w-7 rounded-full object-cover border border-border"
          />
        ) : (
          <span className="text-text-muted text-[12px]">—</span>
        ),
    },
    {
      key: "orgBalance",
      title: t("col.orgBalance" as any),
      width: "100px",
      sortable: true,
      render: (_, r) => (
        <span className="font-mono text-[12px] text-text-muted">
          {(r as any).orgBalance ?? 0}
        </span>
      ),
    },
    {
      key: "userBalance",
      title: t("col.userBalance" as any),
      width: "100px",
      sortable: true,
      render: (_, r) => (
        <span className="font-mono text-[12px] text-text-muted">
          {(r as any).userBalance ?? 0}
        </span>
      ),
    },
    {
      key: "balanceCredit",
      title: t("col.balanceCredit" as any),
      width: "100px",
      sortable: true,
      render: (_, r) => (
        <span className="font-mono text-[12px] text-text-muted">
          {(r as any).balanceCredit ?? 0}
        </span>
      ),
    },
    {
      key: "balanceCurrency",
      title: t("col.balanceCurrency" as any),
      width: "120px",
      sortable: true,
      render: (_, r) => (
        <span className="font-mono text-[12px] text-text-muted">
          {(r as any).balanceCurrency || "USD"}
        </span>
      ),
    },
    {
      key: "enableSoftDeletion",
      title: t("col.softDeletion" as any),
      sortable: true,
      width: "120px",
      render: (_, r) => (
        <StatusBadge
          status={r.enableSoftDeletion ? "active" : "inactive"}
          label={r.enableSoftDeletion ? "ON" : "OFF"}
        />
      ),
    },
    {
      key: "__actions",
      fixed: "right" as const,
      title: t("common.action" as any),
      width: "140px",
      render: (_, r) => (
        <div className="flex items-center gap-1">
          <Link
            to={`/trees/${r.name}`}
            className="rounded p-1.5 text-text-muted hover:text-info hover:bg-info/10 transition-colors"
            title="Groups"
            onClick={(e) => e.stopPropagation()}
          >
            <Boxes size={14} />
          </Link>
          <Link
            to={`/users?owner=${r.name}`}
            className="rounded p-1.5 text-text-muted hover:text-accent hover:bg-accent/10 transition-colors"
            title="Users"
            onClick={(e) => e.stopPropagation()}
          >
            <Users size={14} />
          </Link>
          <Link
            to={`/organizations/${r.owner}/${r.name}`}
            className="rounded p-1.5 text-text-muted hover:text-warning hover:bg-warning/10 transition-colors"
            title="Edit"
            onClick={(e) => e.stopPropagation()}
          >
            <Pencil size={14} />
          </Link>
          {isGlobalAdmin && (
            <button
              onClick={(e) => handleDelete(r, e)}
              disabled={r.name === "built-in"}
              className="rounded p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("orgs.title" as any)}</h1>
          <p className="text-[13px] text-text-muted mt-0.5">{t("orgs.subtitle" as any)}</p>
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
          <ColumnsMenu columns={columns} hidden={prefs.hidden} onToggle={prefs.toggleHidden} onResetWidths={prefs.resetWidths} />
          {isGlobalAdmin && (
            <button
              onClick={handleAdd}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover transition-colors"
            >
              <Plus size={15} />
              {t("orgs.add" as any)}
            </button>
          )}
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
        onPageSizeChange={list.setPageSize}
        onSort={list.handleSort}
        onFilter={list.handleFilter}
        emptyText={t("common.noData")}
        hidden={prefs.hidden}
        widths={prefs.widths}
        onWidthChange={prefs.setWidth}
        resizable
        selectable
        bulkActions={({ selected, clear }) => (
          <BulkDeleteBar selected={selected} clear={clear} onDelete={bulkDelete} />
        )}
      />
    </div>
  );
}
