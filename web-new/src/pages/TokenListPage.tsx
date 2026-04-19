import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, RefreshCw, Trash2, Pencil } from "lucide-react";
import DataTable, { type Column, useTablePrefs, ColumnsMenu } from "../components/DataTable";
import { BulkDeleteBar } from "../components/BulkDeleteBar";
import { useBulkDelete } from "../hooks/useBulkDelete";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityList } from "../hooks/useEntityList";
import { useOrganization } from "../OrganizationContext";
import * as TokenBackend from "../backend/TokenBackend";
import type { Token } from "../backend/TokenBackend";

export default function TokenListPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const modal = useModal();
  const { getNewEntityOwner } = useOrganization();

  const list = useEntityList<Token>({
    queryKey: "tokens",
    fetchFn: TokenBackend.getTokens,
  });
  const prefs = useTablePrefs({ persistKey: "list:tokens" });
  const bulkDelete = useBulkDelete<Token>(TokenBackend.deleteToken, list.refetch);

  const handleAdd = async () => {
    const token = TokenBackend.newToken(getNewEntityOwner(), "");
    const res = await TokenBackend.addToken(token);
    if (res.status === "ok") {
      navigate(`/tokens/${token.name}`, { state: { mode: "add" } });
    } else {
      modal.toast(res.msg || t("common.addFailed" as any), "error");
    }
  };

  const handleDelete = (record: Token, e: React.MouseEvent) => {
    e.stopPropagation();
    modal.showConfirm(
      `${t("common.confirmDelete")} [${record.name}]`,
      async () => {
        const res = await TokenBackend.deleteToken(record);
        if (res.status === "ok") list.refetch();
        else modal.toast(res.msg || t("common.deleteFailed" as any), "error");
      }
    );
  };

  const columns: Column<Token>[] = [
    {
      key: "name", title: t("col.name" as any), sortable: true, filterable: true, fixed: "left" as const, width: "300px",
      render: (_, r) => <Link to={`/tokens/${r.name}`} className="font-mono font-medium text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{r.name}</Link>,
    },
    {
      key: "createdTime", title: t("col.created" as any), sortable: true, width: "160px",
      render: (_, r) => <span className="text-[12px] text-text-muted font-mono">{r.createdTime ? new Date(r.createdTime).toLocaleString() : "\u2014"}</span>,
    },
    {
      key: "application", title: t("col.application" as any), sortable: true, filterable: true, width: "120px",
      render: (_, r) => <Link to={`/applications/${r.organization}/${r.application}`} className="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{r.application}</Link>,
    },
    {
      key: "organization", title: t("col.organization" as any), sortable: true, filterable: true, width: "120px",
      render: (_, r) => <Link to={`/organizations/admin/${r.organization}`} className="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{r.organization}</Link>,
    },
    {
      key: "user", title: t("col.user" as any), sortable: true, filterable: true, width: "120px",
      render: (_, r) => <Link to={`/users/${r.organization}/${r.user}`} className="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{r.user}</Link>,
    },
    {
      key: "code", title: t("tokens.field.authorizationCode" as any), sortable: true, filterable: true, width: "180px",
      render: (_, r) => <span className="font-mono text-[11px] text-text-muted">{r.code || "\u2014"}</span>,
    },
    {
      key: "accessToken", title: t("tokens.field.accessToken" as any), sortable: true, width: "220px",
      render: (_, r) => <span className="font-mono text-[11px] text-text-muted truncate block max-w-[200px]" title={r.accessToken}>{r.accessToken || "\u2014"}</span>,
    },
    {
      key: "expiresIn", title: t("tokens.field.expiresIn" as any), sortable: true, filterable: true, width: "120px",
    },
    {
      key: "scope", title: t("col.scope" as any), sortable: true, filterable: true, width: "110px",
    },
    {
      key: "__actions", fixed: "right" as const, title: t("common.action" as any), width: "120px",
      render: (_, r) => (
        <div className="flex items-center gap-1">
          <Link to={`/tokens/${r.name}`} className="rounded p-1.5 text-text-muted hover:text-warning hover:bg-warning/10 transition-colors" title={t("common.edit")} onClick={(e) => e.stopPropagation()}><Pencil size={14} /></Link>
          <button onClick={(e) => handleDelete(r, e)} className="rounded p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors" title={t("common.delete")}><Trash2 size={14} /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("tokens.title" as any)}</h1>
          <p className="text-[13px] text-text-muted mt-0.5">{t("tokens.subtitle" as any)}</p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button whileHover={{ rotate: 180 }} transition={{ duration: 0.3 }} onClick={list.refetch} className="rounded-lg border border-border p-2 text-text-muted hover:bg-surface-2 transition-colors" title={t("common.refresh")}><RefreshCw size={15} /></motion.button>
          <ColumnsMenu columns={columns} hidden={prefs.hidden} onToggle={prefs.toggleHidden} onResetWidths={prefs.resetWidths} />
          <button onClick={handleAdd} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover transition-colors"><Plus size={15} /> {t("tokens.add" as any)}</button>
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
