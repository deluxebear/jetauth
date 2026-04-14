import { useState } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { inputClass } from "./FormSection";
import SimpleSelect from "./SimpleSelect";

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
  addLabel?: string;
  onAddCustom?: () => void;
  addCustomLabel?: string;
  minRows?: number;
  maxRows?: number;
  disableAdd?: boolean;
  rowKey?: (row: T, index: number) => string;
}

export default function EditableTable<T extends Record<string, unknown>>({
  columns,
  rows,
  onChange,
  newRow,
  addLabel = "Add",
  onAddCustom,
  addCustomLabel,
  minRows = 0,
  disableAdd,
  rowKey,
}: EditableTableProps<T>) {
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

  return (
    <div className="space-y-1">
      {/* Header */}
      <div className="flex items-center gap-1 rounded-t-lg bg-surface-2 border border-border px-2 py-1.5 text-[11px] font-semibold text-text-muted uppercase tracking-wider">
        {columns.map((col) => (
          <div key={col.key} style={{ width: col.width, minWidth: col.width }} className={col.width ? "flex-none" : "flex-1"}>
            {col.title}
          </div>
        ))}
        <div className="w-[72px] flex-none text-right">Action</div>
      </div>

      {/* Rows */}
      {rows.map((row, i) => (
        <div
          key={rowKey ? rowKey(row, i) : i}
          className="flex items-center gap-1 border border-border bg-surface-1 px-2 py-1.5 text-[12px] transition-colors hover:bg-surface-2/50"
          onMouseEnter={() => setHoveredRow(i)}
          onMouseLeave={() => setHoveredRow(null)}
        >
          {columns.map((col) => {
            if (col.visible && !col.visible(row)) {
              return <div key={col.key} style={{ width: col.width, minWidth: col.width }} className={col.width ? "flex-none" : "flex-1"} />;
            }
            const isDisabled = typeof col.disabled === "function" ? col.disabled(row) : col.disabled;
            const cellOnChange = (key: string, val: unknown) => handleCellChange(i, key, val);

            if (col.render) {
              return (
                <div key={col.key} style={{ width: col.width, minWidth: col.width }} className={col.width ? "flex-none" : "flex-1"}>
                  {col.render(row, i, cellOnChange)}
                </div>
              );
            }

            if (col.type === "select" && col.options) {
              return (
                <div key={col.key} style={{ width: col.width, minWidth: col.width }} className={col.width ? "flex-none" : "flex-1"}>
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
                <div key={col.key} style={{ width: col.width, minWidth: col.width }} className={col.width ? "flex-none" : "flex-1"}>
                  <button
                    type="button"
                    onClick={() => handleCellChange(i, col.key, !row[col.key])}
                    disabled={!!isDisabled}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      row[col.key] ? "bg-accent" : "bg-surface-3"
                    } ${isDisabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${row[col.key] ? "translate-x-[18px]" : "translate-x-[3px]"}`} />
                  </button>
                </div>
              );
            }

            // Default: text input
            return (
              <div key={col.key} style={{ width: col.width, minWidth: col.width }} className={col.width ? "flex-none" : "flex-1"}>
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
          <div className={`w-[72px] flex-none flex items-center justify-end gap-0.5 transition-opacity ${hoveredRow === i ? "opacity-100" : "opacity-40"}`}>
            <button onClick={() => handleSwap(i, i - 1)} disabled={i === 0} className="rounded p-0.5 text-text-muted hover:bg-surface-3 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronUp size={13} />
            </button>
            <button onClick={() => handleSwap(i, i + 1)} disabled={i === rows.length - 1} className="rounded p-0.5 text-text-muted hover:bg-surface-3 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronDown size={13} />
            </button>
            <button onClick={() => handleDelete(i)} disabled={rows.length <= minRows} className="rounded p-0.5 text-text-muted hover:text-danger hover:bg-danger/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ))}

      {/* Empty */}
      {rows.length === 0 && (
        <div className="border border-dashed border-border rounded-lg py-4 text-center text-[12px] text-text-muted">
          No items
        </div>
      )}

      {/* Add buttons */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleAdd}
          disabled={disableAdd}
          className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus size={13} /> {addLabel}
        </button>
        {onAddCustom && (
          <button
            onClick={onAddCustom}
            className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors"
          >
            <Plus size={13} /> {addCustomLabel || "Add Custom"}
          </button>
        )}
      </div>
    </div>
  );
}
