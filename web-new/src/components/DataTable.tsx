import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { ChevronLeft, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown, Search, X, ChevronDown, Columns3 } from "lucide-react";
import { useTranslation } from "../i18n";

export interface Column<T> {
  key: string;
  title: string;
  sortable?: boolean;
  filterable?: boolean;
  filterOptions?: { label: string; value: string }[]; // dropdown filter instead of text search
  fixed?: "left" | "right"; // sticky column
  render?: (value: unknown, record: T, index: number) => React.ReactNode;
  width?: string;
  mono?: boolean;
  // Column visibility menu knobs — only read when `columnsToggle` is enabled.
  // hideable=false keeps the column in the visible set regardless of menu
  // toggles (e.g. primary-identity columns); defaultHidden=true makes the
  // column start hidden until a user opts in.
  hideable?: boolean;
  defaultHidden?: boolean;
  // Client-side sort comparator. When `clientSort` is enabled on the table,
  // columns without a comparator fall back to string-compare on the raw value.
  sortFn?: (a: T, b: T) => number;
}

export interface SortState {
  field: string;
  order: "ascend" | "descend" | "";
}

export interface FilterState {
  field: string;
  value: string;
}

// Render-prop context passed to `bulkActions` so callers get the currently
// selected rows + a clear() callback without having to manage selection state
// themselves.
export interface BulkActionContext<T> {
  selected: T[];
  clear: () => void;
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

  // ── Optional, additive features (all off by default) ─────────────────
  // Row click: when provided, rows become clickable. Cells that shouldn't
  // trigger row click (checkboxes, action buttons, count badges that route
  // somewhere specific) must call e.stopPropagation() in their own handlers.
  onRowClick?: (record: T) => void;

  // Bulk selection: adds a leading checkbox column. `bulkActions` renders a
  // floating bar above the table when at least one row is selected.
  selectable?: boolean;
  bulkActions?: (ctx: BulkActionContext<T>) => React.ReactNode;
  onSelectionChange?: (selected: T[]) => void;

  // Client-side sort — for lists that fit in memory (few hundred rows). When
  // off, the table preserves its current "callback-only" behavior: sort
  // header clicks fire onSort and the caller re-fetches / re-sorts.
  clientSort?: boolean;
  defaultSort?: SortState;

  // Persistence: when provided, sort state + hidden-column set survive
  // reloads under `localStorage[persistKey]`. Use a stable per-screen key
  // like "biz-role-table:{owner}/{app}".
  persistKey?: string;

  // Column visibility menu: renders a "Columns" dropdown in the toolbar so
  // users can hide/show columns. Columns with `hideable: false` are locked.
  columnsToggle?: boolean;

  // Extra toolbar content (buttons, search, etc.) rendered right-aligned in
  // the toolbar bar. The toolbar only appears when there's something to show
  // (bulk actions, columns toggle, or this prop).
  toolbar?: React.ReactNode;
}

interface PersistShape {
  sort?: SortState;
  hidden?: string[];
}

function loadPersisted(key?: string): PersistShape | null {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as PersistShape;
  } catch { /* quota / parse — ignore */ }
  return null;
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
  onRowClick,
  selectable,
  bulkActions,
  onSelectionChange,
  clientSort,
  defaultSort,
  persistKey,
  columnsToggle,
  toolbar,
}: DataTableProps<T>) {
  const { t } = useTranslation();

  const getKey = useCallback(
    (r: T) => (typeof rowKey === "function" ? rowKey(r) : String(r[rowKey])),
    [rowKey],
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // ── Sort state ───────────────────────────────────────────────────────
  // Init precedence: persisted → defaultSort → empty. Only runs on mount
  // (and when persistKey changes, which is rare).
  const initial = useMemo(() => {
    const p = loadPersisted(persistKey);
    const sort: SortState = p?.sort ?? defaultSort ?? { field: "", order: "" };
    const hiddenFromPersist = p?.hidden && Array.isArray(p.hidden) ? p.hidden : null;
    const hiddenDefault = columns.filter((c) => c.defaultHidden).map((c) => c.key);
    const hidden = hiddenFromPersist ?? hiddenDefault;
    return { sort, hidden: new Set(hidden) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistKey]);

  const [sort, setSort] = useState<SortState>(initial.sort);
  const [hidden, setHidden] = useState<Set<string>>(initial.hidden);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const colMenuRef = useRef<HTMLDivElement>(null);

  // Persist sort + hidden on change (no-op if persistKey is unset).
  useEffect(() => {
    if (!persistKey) return;
    try {
      localStorage.setItem(persistKey, JSON.stringify({ sort, hidden: Array.from(hidden) }));
    } catch { /* quota — non-fatal */ }
  }, [persistKey, sort, hidden]);

  // Close columns menu on outside click.
  useEffect(() => {
    if (!colMenuOpen) return;
    const h = (e: MouseEvent) => {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) setColMenuOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [colMenuOpen]);

  // When the data set changes (refetch / pagination), drop stale selection
  // keys that no longer correspond to a visible row. This keeps "select-all"
  // indeterminate logic honest.
  useEffect(() => {
    if (!selectable) return;
    const visible = new Set(data.map(getKey));
    setSelected((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((k) => {
        if (visible.has(k)) next.add(k);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [data, selectable, getKey]);

  // Emit selection changes to the caller — fed actual row objects, not keys,
  // since the caller almost always wants the records.
  useEffect(() => {
    if (!onSelectionChange) return;
    const rows = data.filter((r) => selected.has(getKey(r)));
    onSelectionChange(rows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

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

  // Visible columns respect the columnsToggle hidden set. `fixed` and
  // hideable:false columns can never be hidden, so they're filtered out of
  // the hidden check before we compute anything positional.
  const visibleColumns = useMemo(
    () => columns.filter((c) => !hidden.has(c.key) || c.hideable === false || !!c.fixed),
    [columns, hidden],
  );

  // Compute left offsets for fixed-left columns — using VISIBLE columns so
  // hiding a middle column doesn't open a gap in the sticky offset math.
  // When `selectable`, reserve the checkbox column's width (40px) so fixed
  // columns start after it.
  const selectionWidth = selectable ? 40 : 0;
  const fixedLeftCols = visibleColumns.filter((c) => c.fixed === "left");
  const leftOffsets = new Map<string, number>();
  let accLeft = selectionWidth;
  for (const col of fixedLeftCols) {
    leftOffsets.set(col.key, accLeft);
    accLeft += parseInt(col.width || "120", 10);
  }
  const lastLeftKey = fixedLeftCols.length > 0 ? fixedLeftCols[fixedLeftCols.length - 1].key : "";

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
    if (col.fixed === "left") return { left: leftOffsets.get(col.key) ?? 0 };
    return undefined;
  };

  // Client-side sort — only when `clientSort` is on AND a sort is active.
  // Columns can supply `sortFn` for custom ordering; otherwise fall back to
  // a naive localeCompare on the string value at col.key.
  const sortedData = useMemo(() => {
    if (!clientSort || !sort.field || !sort.order) return data;
    const col = columns.find((c) => c.key === sort.field);
    if (!col) return data;
    const dir = sort.order === "ascend" ? 1 : -1;
    const cmp = col.sortFn
      ? col.sortFn
      : (a: T, b: T) => {
          const av = a[col.key];
          const bv = b[col.key];
          if (typeof av === "number" && typeof bv === "number") return av - bv;
          return String(av ?? "").localeCompare(String(bv ?? ""));
        };
    return [...data].sort((a, b) => dir * cmp(a, b));
  }, [data, clientSort, sort, columns]);

  // Selection helpers
  const allVisibleKeys = useMemo(() => sortedData.map(getKey), [sortedData, getKey]);
  const allSelected = allVisibleKeys.length > 0 && allVisibleKeys.every((k) => selected.has(k));
  const someSelected = allVisibleKeys.some((k) => selected.has(k)) && !allSelected;
  const toggleSelectAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(allVisibleKeys));
  };
  const toggleRow = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());
  const selectedRows = useMemo(
    () => (selectable ? data.filter((r) => selected.has(getKey(r))) : []),
    [selectable, data, selected, getKey],
  );

  // Columns toggle helpers
  const toggleColHidden = (key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const bulkBarActive = selectable && !!bulkActions && selected.size > 0;
  const toolbarVisible = bulkBarActive || columnsToggle || !!toolbar;

  // colspan used by loading skeleton + empty state
  const totalRenderedCols = visibleColumns.length + (selectable ? 1 : 0);

  return (
    <div className="rounded-xl border border-border bg-surface-1 overflow-hidden">
      {toolbarVisible && (
        <div className="flex items-center justify-between gap-2 border-b border-border-subtle bg-surface-2/50 px-3 py-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {bulkBarActive && bulkActions!({ selected: selectedRows, clear: clearSelection })}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {toolbar}
            {columnsToggle && (
              <div ref={colMenuRef} className="relative">
                <button
                  onClick={() => setColMenuOpen((v) => !v)}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-1 px-2.5 py-1 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors"
                  title={t("common.columns" as any) || "Columns"}
                >
                  <Columns3 size={13} />
                  <ChevronDown size={11} />
                </button>
                {colMenuOpen && (
                  <div className="absolute right-0 z-30 mt-1 min-w-[200px] rounded-lg border border-border bg-surface-1 p-1.5 shadow-[var(--shadow-elevated)]">
                    {columns.filter((c) => c.hideable !== false && !c.fixed).map((c) => (
                      <label key={c.key} className="flex items-center gap-2 rounded px-2 py-1.5 text-[12px] text-text-primary hover:bg-surface-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!hidden.has(c.key)}
                          onChange={() => toggleColHidden(c.key)}
                          className="rounded border-border"
                        />
                        {c.title}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left" style={{ minWidth: "max-content" }}>
          <thead>
            <tr className="border-b border-border bg-surface-2">
              {selectable && (
                <th
                  className="sticky left-0 z-20 bg-surface-2 px-3 py-2.5 w-10"
                  style={{ width: 40, minWidth: 40 }}
                >
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected; }}
                    onChange={toggleSelectAll}
                    className="rounded border-border cursor-pointer"
                    aria-label="Select all rows"
                  />
                </th>
              )}
              {visibleColumns.map((col, colIdx) => (
                <th
                  key={col.key}
                  style={{ ...(col.width ? { width: col.width, minWidth: col.width } : {}), ...stickyStyle(col) }}
                  className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted relative ${stickyHeadClass(col)} ${colIdx < visibleColumns.length - 1 ? "border-r border-border" : ""}`}
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
                        options={col.filterOptions}
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
                  {selectable && <td className="sticky left-0 z-10 bg-surface-1 px-3 py-3 w-10"><div className="h-4 w-4 animate-pulse rounded bg-surface-3" /></td>}
                  {visibleColumns.map((col) => (
                    <td key={col.key} style={stickyStyle(col)} className={`px-4 py-3 ${stickyClass(col)}`}>
                      <div className="h-4 w-24 animate-pulse rounded bg-surface-3" />
                    </td>
                  ))}
                </tr>
              ))
            ) : sortedData.length === 0 ? (
              <tr>
                <td colSpan={totalRenderedCols} className="px-4 py-20 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="rounded-full bg-surface-2 p-4">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted/50">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="9" y1="13" x2="15" y2="13" />
                        <line x1="9" y1="17" x2="15" y2="17" />
                      </svg>
                    </div>
                    <span className="text-[13px] text-text-muted">{emptyText}</span>
                  </div>
                </td>
              </tr>
            ) : (
              sortedData.map((record, idx) => {
                const key = getKey(record);
                const isSelected = selectable && selected.has(key);
                const rowClickable = !!onRowClick;
                // Row-bg is driven by selection > clickable hover > default.
                // We keep a `group` on the tr so child cells can opt into
                // hover-reveal styling via `group-hover:...`.
                const rowClass = `group border-b border-border-subtle transition-colors ${
                  isSelected
                    ? "bg-accent/5 hover:bg-accent/10"
                    : rowClickable
                      ? "cursor-pointer hover:bg-surface-2/50"
                      : "hover:bg-surface-2/50"
                }`;
                // Cells need to match the row bg when selected so sticky
                // columns don't look out-of-band.
                const cellStickyBg = isSelected
                  ? "bg-accent/5 group-hover:bg-accent/10"
                  : "bg-surface-1 group-hover:bg-surface-2/50";
                return (
                  <tr
                    key={key}
                    onClick={rowClickable ? () => onRowClick!(record) : undefined}
                    className={rowClass}
                  >
                    {selectable && (
                      <td
                        className={`sticky left-0 z-10 px-3 py-2.5 w-10 ${cellStickyBg}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={!!isSelected}
                          onChange={() => toggleRow(key)}
                          className="rounded border-border cursor-pointer"
                          aria-label="Select row"
                        />
                      </td>
                    )}
                    {visibleColumns.map((col) => {
                      const isStickyLeft = col.fixed === "left";
                      const isStickyRight = col.fixed === "right";
                      const needsBg = isStickyLeft || isStickyRight;
                      return (
                        <td
                          key={col.key}
                          style={stickyStyle(col)}
                          className={`px-4 py-2.5 text-[13px] ${
                            col.mono ? "font-mono text-text-secondary" : "text-text-primary"
                          } ${stickyClass(col)} ${needsBg ? cellStickyBg : ""}`}
                        >
                          {col.render
                            ? col.render(record[col.key], record, idx)
                            : (record[col.key] as React.ReactNode) ?? "—"}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

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

// Column search/filter popover — uses fixed positioning to escape overflow:hidden
function FilterPopover({
  columnKey: _columnKey,
  isOpen,
  onToggle,
  onApply,
  options,
}: {
  columnKey: string;
  isOpen: boolean;
  onToggle: () => void;
  onApply: (value: string) => void;
  options?: { label: string; value: string }[];
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  // Stabilize onToggle ref to avoid re-registering listener on every parent render
  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;

  // Calculate fixed position from button rect
  useEffect(() => {
    if (isOpen && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left + rect.width / 2 });
    }
    if (isOpen && !options) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, options]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target)) return;
      if (popRef.current && !popRef.current.contains(target)) onToggleRef.current();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className="rounded p-0.5 text-text-muted hover:text-accent hover:bg-accent/10 transition-colors"
      >
        {options ? <ChevronDown size={12} /> : <Search size={11} />}
      </button>
      {isOpen && (
        <div
          ref={popRef}
          className={`fixed z-10 rounded-lg border border-border bg-surface-2 shadow-[var(--shadow-elevated)] ${options ? "w-24" : "w-52"}`}
          style={{ top: pos.top, left: pos.left, transform: "translateX(-50%)" }}
        >
          {options ? (
            <div className="py-1">
              <button
                onClick={() => { onApply(""); onToggle(); }}
                className="w-full text-left px-3 py-1.5 text-[12px] text-text-muted hover:bg-surface-3 transition-colors whitespace-nowrap"
              >
                {t("common.viewAll" as any)}
              </button>
              {options.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { onApply(opt.value); onToggle(); }}
                  className="w-full text-left px-3 py-1.5 text-[12px] text-text-primary hover:bg-surface-3 transition-colors whitespace-nowrap"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="p-2.5">
              <div className="flex gap-1.5">
                <input
                  ref={inputRef}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onApply(value);
                    if (e.key === "Escape") onToggle();
                  }}
                  placeholder={t("common.search" as any)}
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
      )}
    </>
  );
}
