import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown, Search, X } from "lucide-react";

export interface Column<T> {
  key: string;
  title: string;
  sortable?: boolean;
  filterable?: boolean;
  fixed?: "left" | "right"; // sticky column
  render?: (value: unknown, record: T, index: number) => React.ReactNode;
  width?: string;
  mono?: boolean;
}

export interface SortState {
  field: string;
  order: "ascend" | "descend" | "";
}

export interface FilterState {
  field: string;
  value: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: string | ((r: T) => string);
  loading?: boolean;
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  onSort?: (sort: SortState) => void;
  onFilter?: (filter: FilterState) => void;
  emptyText?: string;
}

export default function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  rowKey,
  loading,
  page = 1,
  pageSize = 20,
  total = 0,
  onPageChange,
  onSort,
  onFilter,
  emptyText = "No data",
}: DataTableProps<T>) {
  const getKey = (r: T) =>
    typeof rowKey === "function" ? rowKey(r) : String(r[rowKey]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const [sort, setSort] = useState<SortState>({ field: "", order: "" });
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const handleSort = (col: Column<T>) => {
    if (!col.sortable) return;
    let newOrder: SortState["order"] = "ascend";
    if (sort.field === col.key) {
      if (sort.order === "ascend") newOrder = "descend";
      else if (sort.order === "descend") newOrder = "";
      else newOrder = "ascend";
    }
    const newSort = { field: newOrder ? col.key : "", order: newOrder };
    setSort(newSort);
    onSort?.(newSort);
  };

  const handleFilter = (field: string, value: string) => {
    setActiveFilter(null);
    onFilter?.({ field, value });
  };

  const sortIcon = (col: Column<T>) => {
    if (!col.sortable) return null;
    if (sort.field === col.key) {
      if (sort.order === "ascend") return <ArrowUp size={12} className="text-accent" />;
      if (sort.order === "descend") return <ArrowDown size={12} className="text-accent" />;
    }
    return <ArrowUpDown size={12} className="opacity-30 group-hover:opacity-60 transition-opacity" />;
  };

  // Compute left offsets for fixed-left columns
  const fixedLeftCols = columns.filter((c) => c.fixed === "left");
  const leftOffsets = new Map<string, number>();
  let accLeft = 0;
  for (const col of fixedLeftCols) {
    leftOffsets.set(col.key, accLeft);
    accLeft += parseInt(col.width || "120", 10);
  }

  const lastLeftKey = fixedLeftCols.length > 0 ? fixedLeftCols[fixedLeftCols.length - 1].key : "";

  // Fixed column divider: use ::after pseudo-element for a persistent visible line
  const dividerLeft = "after:absolute after:right-0 after:top-0 after:bottom-0 after:w-[2px] after:bg-[var(--color-border)]";
  const dividerRight = "after:absolute after:left-0 after:top-0 after:bottom-0 after:w-[2px] after:bg-[var(--color-border)]";

  const stickyClass = (col: Column<T>) => {
    if (col.fixed === "left") {
      const line = col.key === lastLeftKey ? dividerLeft : "";
      return `sticky z-10 bg-surface-1 relative ${line}`;
    }
    if (col.fixed === "right") return `sticky right-0 z-10 bg-surface-1 relative ${dividerRight}`;
    return "";
  };

  const stickyHeadClass = (col: Column<T>) => {
    if (col.fixed === "left") {
      const line = col.key === lastLeftKey ? dividerLeft : "";
      return `sticky z-20 bg-surface-2 relative ${line}`;
    }
    if (col.fixed === "right") return `sticky right-0 z-20 bg-surface-2 relative ${dividerRight}`;
    return "";
  };

  const stickyStyle = (col: Column<T>): React.CSSProperties | undefined => {
    if (col.fixed === "left") {
      return { left: leftOffsets.get(col.key) ?? 0 };
    }
    return undefined;
  };

  return (
    <div className="rounded-xl border border-border bg-surface-1 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left" style={{ minWidth: "max-content" }}>
          <thead>
            <tr className="border-b border-border bg-surface-2">
              {columns.map((col, colIdx) => (
                <th
                  key={col.key}
                  style={{ ...(col.width ? { width: col.width, minWidth: col.width } : {}), ...stickyStyle(col) }}
                  className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted relative ${stickyHeadClass(col)} ${colIdx < columns.length - 1 ? "border-r border-border" : ""}`}
                >
                  <div className="flex items-center gap-1">
                    <span
                      className={`flex items-center gap-1 ${col.sortable ? "cursor-pointer select-none group" : ""}`}
                      onClick={() => handleSort(col)}
                    >
                      {col.title}
                      {sortIcon(col)}
                    </span>
                    {col.filterable && (
                      <FilterPopover
                        columnKey={col.key}
                        isOpen={activeFilter === col.key}
                        onToggle={() => setActiveFilter(activeFilter === col.key ? null : col.key)}
                        onApply={(value) => handleFilter(col.key, value)}
                      />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border-subtle">
                  {columns.map((col) => (
                    <td key={col.key} style={stickyStyle(col)} className={`px-4 py-3 ${stickyClass(col)}`}>
                      <div className="h-4 w-24 animate-pulse rounded bg-surface-3" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-16 text-center text-sm text-text-muted">
                  {emptyText}
                </td>
              </tr>
            ) : (
              data.map((record, idx) => (
                <motion.tr
                  key={getKey(record)}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.02, duration: 0.2 }}
                  className="border-b border-border-subtle transition-colors hover:bg-surface-2/50"
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      style={stickyStyle(col)}
                      className={`px-4 py-2.5 text-[13px] ${
                        col.mono ? "font-mono text-text-secondary" : "text-text-primary"
                      } ${stickyClass(col)}`}
                    >
                      {col.render
                        ? col.render(record[col.key], record, idx)
                        : (record[col.key] as React.ReactNode) ?? "—"}
                    </td>
                  ))}
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between border-t border-border-subtle px-4 py-2.5">
          <span className="text-[12px] text-text-muted">
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} / {total}
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled={page <= 1}
              onClick={() => onPageChange?.(page - 1)}
              className="rounded-lg p-1 text-text-muted hover:bg-surface-3 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const p = i + 1;
              return (
                <button
                  key={p}
                  onClick={() => onPageChange?.(p)}
                  className={`min-w-[28px] rounded-lg px-1.5 py-0.5 text-[12px] font-medium transition-colors ${
                    p === page ? "bg-accent text-surface-0" : "text-text-muted hover:bg-surface-3"
                  }`}
                >
                  {p}
                </button>
              );
            })}
            <button
              disabled={page >= totalPages}
              onClick={() => onPageChange?.(page + 1)}
              className="rounded-lg p-1 text-text-muted hover:bg-surface-3 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Column search/filter popover
function FilterPopover({
  columnKey,
  isOpen,
  onToggle,
  onApply,
}: {
  columnKey: string;
  isOpen: boolean;
  onToggle: () => void;
  onApply: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onToggle();
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }
  }, [isOpen, onToggle]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className="rounded p-0.5 text-text-muted hover:text-accent hover:bg-accent/10 transition-colors"
      >
        <Search size={11} />
      </button>
      {isOpen && (
        <div className="absolute left-0 top-full mt-1 z-50 w-52 rounded-lg border border-border bg-surface-2 p-2.5 shadow-[var(--shadow-elevated)]">
          <div className="flex gap-1.5">
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onApply(value);
                if (e.key === "Escape") onToggle();
              }}
              placeholder="Search..."
              className="flex-1 rounded border border-border bg-surface-1 px-2 py-1 text-[12px] text-text-primary placeholder:text-text-muted outline-none focus:border-accent"
            />
            <button
              onClick={() => onApply(value)}
              className="rounded-lg bg-accent px-2.5 py-1 text-[11px] font-medium text-white hover:bg-accent-hover transition-colors"
            >
              <Search size={12} />
            </button>
            <button
              onClick={() => { setValue(""); onApply(""); }}
              className="rounded border border-border px-1.5 py-1 text-text-muted hover:bg-surface-3 transition-colors"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
