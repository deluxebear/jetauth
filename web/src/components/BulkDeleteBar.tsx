import { useTranslation } from "../i18n";

/**
 * Floating bulk-action bar shown above a DataTable when at least one row
 * is selected. Ships a single "Delete" primary action plus a "Cancel"
 * clear. Pages that need more actions (enable/disable, move, etc.) should
 * inline their own bulkActions render-prop instead.
 */
export function BulkDeleteBar<T>({
  selected,
  clear,
  onDelete,
}: {
  selected: T[];
  clear: () => void;
  onDelete: (selected: T[], clear: () => void) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px] font-medium text-text-primary">
        {selected.length} {t("common.bulk.selected" as any) || "已选"}
      </span>
      <button
        onClick={() => onDelete(selected, clear)}
        className="rounded-lg border border-danger/30 bg-danger/5 px-2.5 py-1 text-[11px] font-medium text-danger hover:bg-danger/10 transition-colors"
      >
        {t("common.delete")}
      </button>
      <button
        onClick={clear}
        className="text-[11px] text-text-muted hover:text-text-secondary ml-1"
      >
        {t("common.cancel")}
      </button>
    </div>
  );
}
