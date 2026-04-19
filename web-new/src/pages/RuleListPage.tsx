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
import * as RuleBackend from "../backend/RuleBackend";
import type { Rule } from "../backend/RuleBackend";

export default function RuleListPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const modal = useModal();
  const { getNewEntityOwner } = useOrganization();

  const list = useEntityList<Rule>({
    queryKey: "rules",
    fetchFn: RuleBackend.getRules,
  });
  const prefs = useTablePrefs({ persistKey: "list:rules" });
  const bulkDelete = useBulkDelete<Rule>(RuleBackend.deleteRule, list.refetch);

  const handleAdd = async () => {
    const rule = RuleBackend.newRule(getNewEntityOwner());
    const res = await RuleBackend.addRule(rule);
    if (res.status === "ok") {
      navigate(`/rules/${rule.owner}/${rule.name}`, { state: { mode: "add" } });
    } else {
      modal.toast(res.msg || t("common.addFailed" as any), "error");
    }
  };

  const handleDelete = (record: Rule, e: React.MouseEvent) => {
    e.stopPropagation();
    modal.showConfirm(
      `${t("common.confirmDelete")} [${record.name}]`,
      async () => {
        const res = await RuleBackend.deleteRule(record);
        if (res.status === "ok") list.refetch();
        else modal.toast(res.msg || t("common.deleteFailed" as any), "error");
      }
    );
  };

  const columns: Column<Rule>[] = [
    {
      key: "owner", title: t("col.owner" as any), sortable: true, width: "150px",
      render: (_, r) => <span className="text-[12px] text-text-secondary">{r.owner}</span>,
    },
    {
      key: "name", title: t("col.name" as any), sortable: true, fixed: "left" as const, width: "200px",
      render: (_, r) => <Link to={`/rules/${r.owner}/${r.name}`} className="font-mono font-medium text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{r.name}</Link>,
    },
    {
      key: "createdTime", title: t("col.created" as any), sortable: true, width: "200px",
      render: (_, r) => <span className="text-[12px] text-text-muted font-mono">{r.createdTime ? new Date(r.createdTime).toLocaleString() : "\u2014"}</span>,
    },
    {
      key: "updatedTime", title: t("col.updated" as any), sortable: true, width: "200px",
      render: (_, r) => <span className="text-[12px] text-text-muted font-mono">{r.updatedTime ? new Date(r.updatedTime).toLocaleString() : "\u2014"}</span>,
    },
    {
      key: "type", title: t("rules.field.type" as any), sortable: true, width: "100px",
      render: (_, r) => <span className="inline-block rounded px-1.5 py-0.5 text-[11px] bg-info/10 text-info">{r.type}</span>,
    },
    {
      key: "expressions", title: t("rules.field.expressions" as any), sortable: true,
      render: (_, r) => (
        <div className="flex flex-wrap gap-1">
          {(r.expressions || []).map((expr, i) => (
            <span key={i} className="inline-block rounded px-1.5 py-0.5 text-[11px] bg-success/10 text-success">
              {expr.operator} {(expr.value || "").substring(0, 20)}
            </span>
          ))}
        </div>
      ),
    },
    { key: "action", title: t("common.action" as any), sortable: true, width: "100px" },
    { key: "statusCode", title: t("rules.field.statusCode" as any), sortable: true, width: "120px" },
    {
      key: "reason", title: t("rules.field.reason" as any), sortable: true, width: "300px",
      render: (_, r) => <span className="text-[12px] text-text-secondary">{r.reason}</span>,
    },
    {
      key: "__actions", fixed: "right" as const, title: t("common.action" as any), width: "120px",
      render: (_, r) => (
        <div className="flex items-center gap-1">
          <Link to={`/rules/${r.owner}/${r.name}`} className="rounded p-1.5 text-text-muted hover:text-warning hover:bg-warning/10 transition-colors" title={t("common.edit")} onClick={(e) => e.stopPropagation()}><Pencil size={14} /></Link>
          <button onClick={(e) => handleDelete(r, e)} className="rounded p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors" title={t("common.delete")}><Trash2 size={14} /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("rules.title" as any)}</h1>
          <p className="text-[13px] text-text-muted mt-0.5">{t("rules.subtitle" as any)}</p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button whileHover={{ rotate: 180 }} transition={{ duration: 0.3 }} onClick={list.refetch} className="rounded-lg border border-border p-2 text-text-muted hover:bg-surface-2 transition-colors" title={t("common.refresh")}><RefreshCw size={15} /></motion.button>
          <ColumnsMenu columns={columns} hidden={prefs.hidden} onToggle={prefs.toggleHidden} onResetWidths={prefs.resetWidths} />
          <button onClick={handleAdd} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover transition-colors"><Plus size={15} /> {t("rules.add" as any)}</button>
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
