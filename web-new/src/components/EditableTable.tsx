import { useState } from "react";
import type { ReactNode } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { inputClass } from "./FormSection";
import SimpleSelect from "./SimpleSelect";
import { useTranslation } from "../i18n";
import SortableList from "./SortableList";

// ── Grid template helper ─────────────────────────────────────────────────────

function buildGridTemplate<T>(columns: EditableColumn<T>[], sortable: boolean): string {
  const parts: string[] = [];
  if (sortable) parts.push("32px");
  for (const col of columns) {
    if (col.width) {
      const w = typeof col.width === "number" ? `${col.width}px` : col.width;
      parts.push(`minmax(80px, ${w})`);
    } else {
      parts.push("minmax(120px, 1fr)");
    }
  }
  // sortable: only trash → 56px; non-sortable: up/down + trash → 80px
  parts.push(sortable ? "56px" : "80px");
  return parts.join(" ");
}

export interface EditableColumn<T> {
  key: string;
  title: string;
  width?: string;
  render?: (row: T, index: number, onChange: (key: string, val: unknown) => void) => React.ReactNode;
  type?: "text" | "select" | "switch" | "custom";
  options?: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean | ((row: T) => boolean);
  visible?: (row: T) => boolean;
}

interface EditableTableProps<T extends Record<string, unknown>> {
  columns: EditableColumn<T>[];
  rows: T[];
  onChange: (rows: T[]) => void;
  newRow: () => T;
  title?: string;
  addLabel?: string;
  onAddCustom?: () => void;
  addCustomLabel?: string;
  minRows?: number;
  maxRows?: number;
  disableAdd?: boolean;
  rowKey?: (row: T, index: number) => string;
  /** Enable drag-to-reorder via @dnd-kit. Replaces up/down chevrons with a grip handle. */
  sortable?: boolean;
}

// ── Internal RowContent ──────────────────────────────────────────────────────

interface RowContentProps<T extends Record<string, unknown>> {
  row: T;
  index: number;
  columns: EditableColumn<T>[];
  rows: T[];
  minRows: number;
  hoveredRow: number | null;
  setHoveredRow: (i: number | null) => void;
  handleCellChange: (index: number, key: string, val: unknown) => void;
  handleDelete: (index: number) => void;
  handleSwap: ((a: number, b: number) => void) | undefined;
  sortable: boolean;
  dragHandle: ReactNode;
}

function RowContent<T extends Record<string, unknown>>({
  row,
  index: i,
  columns,
  rows,
  minRows,
  hoveredRow,
  setHoveredRow,
  handleCellChange,
  handleDelete,
  handleSwap,
  sortable,
  dragHandle,
}: RowContentProps<T>) {
  const gridTemplate = buildGridTemplate(columns, sortable);
  return (
    <div
      className="grid items-center gap-2 border-b border-border bg-surface-1 px-3 py-2 text-[12px] transition-colors hover:bg-surface-2/50 last:border-b-0"
      style={{ gridTemplateColumns: gridTemplate }}
      onMouseEnter={() => setHoveredRow(i)}
      onMouseLeave={() => setHoveredRow(null)}
    >
      {/* Drag handle gutter (sortable mode) */}
      {sortable && (
        <div className="flex items-center justify-center">
          {dragHandle}
        </div>
      )}

      {columns.map((col) => {
        if (col.visible && !col.visible(row)) {
          return <div key={col.key} />;
        }
        const isDisabled =
          typeof col.disabled === "function" ? col.disabled(row) : col.disabled;
        const cellOnChange = (key: string, val: unknown) =>
          handleCellChange(i, key, val);

        if (col.render) {
          return <div key={col.key}>{col.render(row, i, cellOnChange)}</div>;
        }

        if (col.type === "select" && col.options) {
          return (
            <div key={col.key}>
              <SimpleSelect
                value={String(row[col.key] ?? "")}
                options={col.options}
                onChange={(v) => handleCellChange(i, col.key, v)}
                disabled={isDisabled}
              />
            </div>
          );
        }

        if (col.type === "switch") {
          return (
            <div key={col.key}>
              <button
                type="button"
                onClick={() => handleCellChange(i, col.key, !row[col.key])}
                disabled={!!isDisabled}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  row[col.key] ? "bg-accent" : "bg-surface-3"
                } ${isDisabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                    row[col.key] ? "translate-x-[18px]" : "translate-x-[3px]"
                  }`}
                />
              </button>
            </div>
          );
        }

        // Default: text input
        return (
          <div key={col.key}>
            <input
              value={String(row[col.key] ?? "")}
              onChange={(e) => handleCellChange(i, col.key, e.target.value)}
              disabled={!!isDisabled}
              placeholder={col.placeholder}
              className={`${inputClass} !py-1 !text-[12px]`}
            />
          </div>
        );
      })}

      {/* Actions */}
      <div
        className={`flex items-center justify-end gap-0.5 transition-opacity ${
          hoveredRow === i ? "opacity-100" : "opacity-40"
        }`}
      >
        {sortable ? null : (
          <>
            <button
              onClick={() => handleSwap!(i, i - 1)}
              disabled={i === 0}
              className="rounded p-0.5 text-text-muted hover:bg-surface-3 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronUp size={13} />
            </button>
            <button
              onClick={() => handleSwap!(i, i + 1)}
              disabled={i === rows.length - 1}
              className="rounded p-0.5 text-text-muted hover:bg-surface-3 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronDown size={13} />
            </button>
          </>
        )}
        <button
          onClick={() => handleDelete(i)}
          disabled={rows.length <= minRows}
          className="rounded p-0.5 text-text-muted hover:text-danger hover:bg-danger/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ── EditableTable ────────────────────────────────────────────────────────────

export default function EditableTable<T extends Record<string, unknown>>({
  columns,
  rows,
  onChange,
  newRow,
  title,
  addLabel,
  onAddCustom,
  addCustomLabel,
  minRows = 0,
  disableAdd,
  rowKey,
  sortable = false,
}: EditableTableProps<T>) {
  const { t } = useTranslation();
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);

  const handleAdd = () => {
    onChange([...rows, newRow()]);
  };

  const handleDelete = (index: number) => {
    if (rows.length <= minRows) return;
    onChange(rows.filter((_, i) => i !== index));
  };

  const handleSwap = (a: number, b: number) => {
    if (b < 0 || b >= rows.length) return;
    const next = [...rows];
    [next[a], next[b]] = [next[b], next[a]];
    onChange(next);
  };

  const handleCellChange = (index: number, key: string, val: unknown) => {
    const next = [...rows];
    next[index] = { ...next[index], [key]: val };
    onChange(next);
  };

  const addButtons = (
    <div className="flex items-center gap-1.5">
      {onAddCustom && (
        <button
          onClick={onAddCustom}
          className="flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-[12px] font-medium text-white hover:bg-accent-hover transition-colors"
        >
          <Plus size={13} /> {addCustomLabel || t("common.add")}
        </button>
      )}
      <button
        onClick={handleAdd}
        disabled={disableAdd}
        className="flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-[12px] font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Plus size={13} /> {addLabel || t("common.add")}
      </button>
    </div>
  );

  return (
    <div className="rounded-xl border border-border bg-surface-1 overflow-visible">
      {/* Title bar with add buttons */}
      <div className="px-4 py-2.5 border-b border-border-subtle bg-surface-2/30 flex items-center justify-between">
        <h4 className="text-[13px] font-semibold text-text-primary">{title || ""}</h4>
        {addButtons}
      </div>

      {/* Column headers */}
      <div
        className="grid items-center gap-2 bg-surface-2/20 border-b border-border px-3 py-2 text-[11px] font-semibold text-text-muted uppercase tracking-wider"
        style={{ gridTemplateColumns: buildGridTemplate(columns, sortable) }}
      >
        {sortable && <div />}
        {columns.map((col) => (
          <div key={col.key}>{col.title}</div>
        ))}
        <div className="text-right">{t("common.action" as any)}</div>
      </div>

      {/* Rows — SortableList for drag-sort, or plain map */}
      {sortable ? (
        <SortableList
          items={rows}
          getId={(row, i) => (rowKey ? rowKey(row, i) : String(i))}
          onReorder={onChange}
          renderItem={(row, i, dragHandle) => (
            <RowContent
              row={row}
              index={i}
              columns={columns}
              rows={rows}
              minRows={minRows}
              hoveredRow={hoveredRow}
              setHoveredRow={setHoveredRow}
              handleCellChange={handleCellChange}
              handleDelete={handleDelete}
              handleSwap={undefined}
              sortable
              dragHandle={dragHandle}
            />
          )}
        />
      ) : (
        rows.map((row, i) => (
          <RowContent
            key={rowKey ? rowKey(row, i) : i}
            row={row}
            index={i}
            columns={columns}
            rows={rows}
            minRows={minRows}
            hoveredRow={hoveredRow}
            setHoveredRow={setHoveredRow}
            handleCellChange={handleCellChange}
            handleDelete={handleDelete}
            handleSwap={handleSwap}
            sortable={false}
            dragHandle={null}
          />
        ))
      )}

      {/* Empty state */}
      {rows.length === 0 && (
        <div className="py-6 text-center text-[12px] text-text-muted">
          {t("common.noData")}
        </div>
      )}
    </div>
  );
}
