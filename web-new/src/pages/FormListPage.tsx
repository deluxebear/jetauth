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
import * as FormBackend from "../backend/FormBackend";
import type { Form } from "../backend/FormBackend";

export default function FormListPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const modal = useModal();
  const { getNewEntityOwner } = useOrganization();

  const list = useEntityList<Form>({
    queryKey: "forms",
    fetchFn: FormBackend.getForms,
  });
  const prefs = useTablePrefs({ persistKey: "list:forms" });
  const bulkDelete = useBulkDelete<Form>(FormBackend.deleteForm, list.refetch);

  const handleAdd = async () => {
    const form = FormBackend.newForm(getNewEntityOwner());
    const res = await FormBackend.addForm(form);
    if (res.status === "ok") {
      navigate(`/forms/${form.name}`, { state: { mode: "add" } });
    } else {
      modal.toast(res.msg || t("common.addFailed" as any), "error");
    }
  };

  const handleDelete = (record: Form, e: React.MouseEvent) => {
    e.stopPropagation();
    modal.showConfirm(
      `${t("common.confirmDelete")} [${record.displayName || record.name}]`,
      async () => {
        const res = await FormBackend.deleteForm(record);
        if (res.status === "ok") list.refetch();
        else modal.toast(res.msg || t("common.deleteFailed" as any), "error");
      }
    );
  };

  const columns: Column<Form>[] = [
    {
      key: "name", title: t("col.name" as any), sortable: true, fixed: "left" as const, width: "160px",
      render: (_, r) => <Link to={`/forms/${encodeURIComponent(r.name)}`} className="font-mono font-medium text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{r.name}</Link>,
    },
    {
      key: "displayName", title: t("col.displayName" as any), sortable: true, width: "200px",
    },
    {
      key: "type", title: t("col.type" as any), sortable: true, width: "120px",
    },
    {
      key: "formItems", title: t("forms.field.formItems" as any), filterable: true,
      render: (_, r) => {
        const items = r.formItems ?? [];
        if (items.length === 0) return <span className="text-text-muted">({t("common.empty" as any)})</span>;
        const visible = items.filter(item => item.visible !== false);
        return (
          <div className="flex flex-wrap gap-1">
            {visible.slice(0, 8).map((item, idx) => (
              <span key={idx} className="inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">{item.label || item.name}</span>
            ))}
            {visible.length > 8 && <span className="text-[11px] text-text-muted">+{visible.length - 8}</span>}
          </div>
        );
      },
    },
    {
      key: "__actions", fixed: "right" as const, title: t("common.action" as any), width: "110px",
      render: (_, r) => (
        <div className="flex items-center gap-1">
          <Link to={`/forms/${encodeURIComponent(r.name)}`} className="rounded p-1.5 text-text-muted hover:text-warning hover:bg-warning/10 transition-colors" title={t("common.edit")} onClick={(e) => e.stopPropagation()}><Pencil size={14} /></Link>
          <button onClick={(e) => handleDelete(r, e)} className="rounded p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors" title={t("common.delete")}><Trash2 size={14} /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("forms.title" as any)}</h1>
          <p className="text-[13px] text-text-muted mt-0.5">{t("forms.subtitle" as any)}</p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button whileHover={{ rotate: 180 }} transition={{ duration: 0.3 }} onClick={list.refetch} className="rounded-lg border border-border p-2 text-text-muted hover:bg-surface-2 transition-colors" title={t("common.refresh")}><RefreshCw size={15} /></motion.button>
          <ColumnsMenu columns={columns} hidden={prefs.hidden} onToggle={prefs.toggleHidden} onResetWidths={prefs.resetWidths} />
          <button onClick={handleAdd} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover transition-colors"><Plus size={15} /> {t("forms.add" as any)}</button>
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
