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
  // Column visibility menu knobs — consumed by the exported ColumnsMenu
  // helper. hideable=false keeps the column visible regardless of menu
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

// Render-prop context passed to `bulkActions`. `selected` resolves row
// objects via current `data` + a cross-page cache; `selectedKeys` is the
// authoritative id list (including rows on pages the user hasn't re-
// visited recently). Use `selectedKeys` for "N selected" counts and API
// calls; use `selected` only when you need full row objects in the UI.
export interface BulkActionContext<T> {
  selected: T[];
  selectedKeys: string[];
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
  // floating bar above the table when at least one row is selected. When
  // `crossPageSelection` is on, selections persist across pagination —
  // header checkbox "select all" still operates on the current page only,
  // and the bulk bar shows the cross-page total via `selectedKeys.length`.
  selectable?: boolean;
  crossPageSelection?: boolean;
  bulkActions?: (ctx: BulkActionContext<T>) => React.ReactNode;
  onSelectionChange?: (selected: T[], selectedKeys: string[]) => void;

  // Client-side sort — for lists that fit in memory (few hundred rows). When
  // off, the table preserves its current "callback-only" behavior: sort
  // header clicks fire onSort and the caller re-fetches / re-sorts.
  clientSort?: boolean;
  defaultSort?: SortState;

  // Persistence (uncontrolled mode only): sort + hidden-column set survive
  // reloads under `localStorage[persistKey]`. Use a stable per-screen key
  // like "biz-role-table:{owner}/{app}". Ignored when `sort` / `hidden` are
  // provided as controlled props.
  persistKey?: string;

  // ── Controlled prefs (optional) ──────────────────────────────────────
  // When provided, the table defers sort + visibility state to the caller.
  // Pair with `useTablePrefs()` + `<ColumnsMenu>` to render the columns
  // dropdown somewhere outside the table (e.g. next to a primary CTA).
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
  hidden?: Set<string>;

  // ── Column resize ───────────────────────────────────────────────────
  // When `resizable` is on, each non-fixed column header grows a drag
  // handle on its right edge. Drag to resize, double-click to auto-fit.
  // Pair with `useTablePrefs()` for persisted widths (controlled mode).
  resizable?: boolean;
  widths?: Record<string, number>;           // controlled widths (px)
  onWidthChange?: (key: string, width: number) => void;


  // ── Pagination ──────────────────────────────────────────────────────
  // Server-side: caller passes `page`/`pageSize`/`total`/`onPageChange`;
  // DataTable renders what arrives and only handles chrome (UI + arrows +
  // page-size selector via `onPageSizeChange`).
  // Client-side: set `clientPagination` + `clientSort`. DataTable manages
  // page + pageSize state itself; `pageSize`/`onPageSizeChange` are
  // optional (for callers that want to persist via useTablePrefs).
  clientPagination?: boolean;
  defaultPageSize?: number;                  // initial pageSize in client mode (persisted via useTablePrefs / persistKey)
  pageSizeOptions?: number[];                // selector options; default [10,20,50,100]
  onPageSizeChange?: (size: number) => void;
}

interface PersistShape {
  sort?: SortState;
  hidden?: string[];
  widths?: Record<string, number>;
  pageSize?: number;
}

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

// Column resize bounds. Narrow enough to accommodate a single chip; wide
// enough that a wrapped long title can still fit on one line after user
// drags aggressively. Keep these constants in sync with the autoFit buffer.
const MIN_COL_WIDTH = 60;
const MAX_COL_WIDTH = 800;

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

// Shared initial-prefs reader used by both DataTable's uncontrolled state
// and the public useTablePrefs hook. defaultHiddenKeys is consulted first;
// callers that pass `columns` can derive them from columns[].defaultHidden.
function readInitialPrefs(
  persistKey: string | undefined,
  defaultSort: SortState | undefined,
  defaultHiddenKeys: string[],
  defaultPageSize: number,
): { sort: SortState; hidden: Set<string>; widths: Record<string, number>; pageSize: number } {
  const p = loadPersisted(persistKey);
  const sort: SortState = p?.sort ?? defaultSort ?? { field: "", order: "" };
  const hiddenFromPersist = p?.hidden && Array.isArray(p.hidden) ? p.hidden : null;
  const hidden = new Set(hiddenFromPersist ?? defaultHiddenKeys);
  const widths = (p?.widths && typeof p.widths === "object") ? p.widths : {};
  const pageSize = typeof p?.pageSize === "number" && p.pageSize > 0 ? p.pageSize : defaultPageSize;
  return { sort, hidden, widths, pageSize };
}

// Shared persistence writer. Dedups by serialized payload (via the provided
// ref) so dragging a column 200 pixels doesn't trigger 200 localStorage
// writes when the logical state is unchanged on any given frame.
function usePersistedPrefs(
  persistKey: string | undefined,
  enabled: boolean,
  sort: SortState,
  hidden: Set<string>,
  widths: Record<string, number>,
  pageSize: number,
) {
  // Seed the dedup ref from disk on first run so a mount with no user
  // interaction doesn't re-serialize the same blob back into localStorage.
  const lastPayloadRef = useRef<string | null>(null);
  useEffect(() => {
    if (!persistKey || !enabled) return;
    const payload = JSON.stringify({
      sort,
      hidden: Array.from(hidden),
      widths,
      pageSize,
    });
    if (lastPayloadRef.current === null) {
      try { lastPayloadRef.current = localStorage.getItem(persistKey); } catch { /* ignore */ }
    }
    if (lastPayloadRef.current === payload) return;
    lastPayloadRef.current = payload;
    try { localStorage.setItem(persistKey, payload); } catch { /* quota — non-fatal */ }
  }, [persistKey, enabled, sort, hidden, widths, pageSize]);
}

export default function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  rowKey,
  loading,
  page: pageControlled,
  pageSize,
  total: totalProp,
  onPageChange,
  onSort,
  onFilter,
  emptyText = "No data",
  onRowClick,
  selectable,
  crossPageSelection,
  bulkActions,
  onSelectionChange,
  clientSort,
  defaultSort,
  persistKey,
  sort: sortControlled,
  onSortChange,
  hidden: hiddenControlled,
  resizable,
  widths: widthsControlled,
  onWidthChange,
  clientPagination,
  defaultPageSize,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  onPageSizeChange,
}: DataTableProps<T>) {
  const { t } = useTranslation();

  const getKey = useCallback(
    (r: T) => (typeof rowKey === "function" ? rowKey(r) : String(r[rowKey])),
    [rowKey],
  );


  // Init precedence: persisted → defaultSort → empty. Runs on mount only.
  // columns is excluded from deps — column schema is assumed stable per
  // table instance; remount with a different persistKey to re-init.
  const initial = useMemo(
    () => readInitialPrefs(
      persistKey,
      defaultSort,
      columns.filter((c) => c.defaultHidden).map((c) => c.key),
      defaultPageSize ?? 20,
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [persistKey],
  );

  // When the page owns sort via onSort (e.g. useEntityList), skip
  // persisted sort: its state starts empty and a seeded arrow would
  // desync with unsorted rows.
  const sortExternallyOwned = !!onSort;
  const [sortInternal, setSortInternal] = useState<SortState>(
    sortExternallyOwned ? (defaultSort ?? { field: "", order: "" }) : initial.sort,
  );
  const [hiddenInternal] = useState<Set<string>>(initial.hidden);
  const [widthsInternal, setWidthsInternal] = useState<Record<string, number>>(initial.widths);
  const [pageSizeInternal, setPageSizeInternal] = useState<number>(initial.pageSize);
  const [pageInternal, setPageInternal] = useState<number>(1);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const tableRef = useRef<HTMLTableElement>(null);

  const sort = sortControlled ?? sortInternal;
  const hidden = hiddenControlled ?? hiddenInternal;
  const widths = widthsControlled ?? widthsInternal;
  // pageSize is controlled if `pageSize` prop is a positive number; else we
  // manage it internally (with persistence if persistKey is set).
  const pageSizeControlled = typeof pageSize === "number" && pageSize > 0;
  const effectivePageSize = pageSizeControlled ? pageSize : pageSizeInternal;
  const setSort = (next: SortState) => {
    if (!sortControlled) setSortInternal(next);
    onSortChange?.(next);
  };
  const setWidth = (key: string, w: number) => {
    if (widthsControlled) {
      onWidthChange?.(key, w);
    } else {
      setWidthsInternal((prev) => (prev[key] === w ? prev : { ...prev, [key]: w }));
    }
  };
  const setPageSize = (n: number) => {
    if (!pageSizeControlled) setPageSizeInternal(n);
    onPageSizeChange?.(n);
    // Reset to page 1 — staying on page 7 of a now-2-page list would be
    // confusing. In server mode the caller owns paging; in client mode
    // DataTable owns it. Only one setter fires per mode.
    if (clientPagination) setPageInternal(1);
    else onPageChange?.(1);
  };

  const resolvedSort = (sortControlled || sortExternallyOwned)
    ? (defaultSort ?? { field: "", order: "" as const })
    : sortInternal;
  const resolvedPageSize = pageSizeControlled ? (defaultPageSize ?? 20) : pageSizeInternal;
  usePersistedPrefs(
    persistKey,
    !hiddenControlled && !widthsControlled,
    resolvedSort,
    hiddenInternal,
    widthsInternal,
    resolvedPageSize,
  );

  // Resolved column width for a given column (px). Falls back to the
  // column's static `width` prop, then a 120px default.
  const getColumnWidth = (col: Column<T>): number => {
    const persisted = widths[col.key];
    if (typeof persisted === "number" && persisted > 0) return persisted;
    return parseInt(col.width || "120", 10);
  };

  // Active drag cleanup — held in a ref so unmounting mid-drag (e.g. route
  // change while dragging) can release listeners + body cursor without
  // leaking.
  const dragCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => { dragCleanupRef.current?.(); }, []);

  // Start drag-resize from the resizer handle on a column header. Uses
  // window-level mousemove/up so release is captured even if the pointer
  // leaves the handle mid-drag. mousemove is RAF-throttled + deduped on
  // width equality so dragging 200px across a 10-column table doesn't emit
  // 200 full re-renders + localStorage writes.
  const startResize = (col: Column<T>, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = getColumnWidth(col);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    let latestW = startW;
    let rafId: number | null = null;
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const nw = Math.max(MIN_COL_WIDTH, Math.min(MAX_COL_WIDTH, startW + dx));
      if (nw === latestW) return;
      latestW = nw;
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        setWidth(col.key, latestW);
      });
    };
    const cleanup = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", cleanup);
      dragCleanupRef.current = null;
    };
    dragCleanupRef.current = cleanup;
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", cleanup);
  };

  // Double-click the resizer to auto-fit to the widest cell in the column.
  // Works by temporarily removing the width constraint on the <th>, letting
  // the browser re-layout the column to natural content width, measuring
  // cell widths, then restoring. Capped at MAX_COL_WIDTH.
  const autoFitColumn = (col: Column<T>) => {
    if (!tableRef.current) return;
    const th = tableRef.current.querySelector<HTMLElement>(`th[data-col-key="${col.key}"]`);
    if (!th) return;
    const cells = Array.from(
      tableRef.current.querySelectorAll<HTMLElement>(`[data-col-key="${col.key}"]`),
    );
    if (cells.length === 0) return;
    const saved = { w: th.style.width, mw: th.style.minWidth };
    th.style.width = "";
    th.style.minWidth = "";
    // Force reflow so auto-sized column width is reflected.
    void th.offsetWidth;
    let max = MIN_COL_WIDTH;
    cells.forEach((c) => { max = Math.max(max, c.offsetWidth); });
    th.style.width = saved.w;
    th.style.minWidth = saved.mw;
    // +4px buffer for sub-pixel rounding.
    setWidth(col.key, Math.min(max + 4, MAX_COL_WIDTH));
  };

  // Cross-page row cache: key → row for every row ever seen. Lets bulk
  // actions access row objects for keys selected on pages the user has
  // since navigated away from. Unbounded (bounded by total pages visited);
  // cleared implicitly when the DataTable instance unmounts.
  const rowCacheRef = useRef<Map<string, T>>(new Map());
  useEffect(() => {
    // Only the cross-page selection path needs the cache — in single-page
    // or client-pagination mode, `data` is always the full list so row
    // lookups via `currentByKey` cover everything.
    if (!selectable || !crossPageSelection) return;
    data.forEach((r) => rowCacheRef.current.set(getKey(r), r));
  }, [data, selectable, crossPageSelection, getKey]);

  // When the data set changes, drop stale selection keys unless cross-page
  // selection is on. Cross-page mode lets the caller keep selections across
  // paginated refetches (and take responsibility for dedup at commit time).
  useEffect(() => {
    if (!selectable || crossPageSelection) return;
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
  }, [data, selectable, crossPageSelection, getKey]);

  // Shared row-lookup: built once per `data` change, consumed by both the
  // selectedRows memo and the onSelectionChange effect.
  const currentByKey = useMemo(
    () => new Map(data.map((r) => [getKey(r), r] as const)),
    [data, getKey],
  );

  // Emit selection changes to the caller. Rows come from current page +
  // cross-page cache (same resolution as bulkActions); keys are authoritative.
  useEffect(() => {
    if (!onSelectionChange) return;
    const rows: T[] = [];
    const keys: string[] = [];
    selected.forEach((k) => {
      keys.push(k);
      const row = currentByKey.get(k) ?? rowCacheRef.current.get(k);
      if (row) rows.push(row);
    });
    onSelectionChange(rows, keys);
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
    accLeft += getColumnWidth(col);
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
    // All thead cells are sticky to top-0 so column titles stay visible
    // when the body scrolls vertically. Fixed-left/right cells are sticky
    // on BOTH axes; their z-index is bumped one tier higher so they sit
    // above plain top-sticky cells at the row intersection.
    if (col.fixed === "left") {
      const line = col.key === lastLeftKey ? dividerLeft : "";
      return `sticky top-0 z-30 bg-surface-2 relative ${line}`;
    }
    if (col.fixed === "right") return `sticky right-0 top-0 z-30 bg-surface-2 relative ${dividerRight}`;
    return "sticky top-0 z-20 bg-surface-2";
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

  // Pagination resolution. Server mode: caller owns page/total via props.
  // Client mode: we own page, total is derived from sortedData.length.
  const effectivePage = clientPagination ? pageInternal : (pageControlled ?? 1);
  const effectiveTotal = clientPagination ? sortedData.length : (totalProp ?? 0);
  const totalPages = Math.max(1, Math.ceil(effectiveTotal / effectivePageSize));
  // Slice in client mode; in server mode, `data` is already a single page.
  const pagedData = useMemo(() => {
    if (!clientPagination) return sortedData;
    const start = (effectivePage - 1) * effectivePageSize;
    return sortedData.slice(start, start + effectivePageSize);
  }, [clientPagination, sortedData, effectivePage, effectivePageSize]);
  // If filters cut the list so current page is out of range, snap back.
  useEffect(() => {
    if (!clientPagination) return;
    if (pageInternal > totalPages) setPageInternal(totalPages);
  }, [clientPagination, totalPages, pageInternal]);

  const goToPage = (p: number) => {
    const clamped = Math.max(1, Math.min(totalPages, p));
    if (clientPagination) setPageInternal(clamped);
    onPageChange?.(clamped);
  };

  // Selection helpers. Header checkbox always operates on current-page keys
  // only — in single-page mode that equals all rows, in cross-page mode it
  // preserves selections made on other pages.
  const allVisibleKeys = useMemo(() => pagedData.map(getKey), [pagedData, getKey]);
  const allSelected = allVisibleKeys.length > 0 && allVisibleKeys.every((k) => selected.has(k));
  const someSelected = allVisibleKeys.some((k) => selected.has(k)) && !allSelected;
  const toggleSelectAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) allVisibleKeys.forEach((k) => next.delete(k));
      else allVisibleKeys.forEach((k) => next.add(k));
      return next;
    });
  };
  const toggleRow = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());
  const selectedKeys = useMemo(() => Array.from(selected), [selected]);
  // Resolve row objects: current-page data first (freshest), cross-page
  // cache for rows selected on other pages. Keys without a resolvable row
  // are skipped — caller still sees them via selectedKeys.
  const selectedRows = useMemo(() => {
    if (!selectable) return [];
    const rows: T[] = [];
    selected.forEach((k) => {
      const row = currentByKey.get(k) ?? rowCacheRef.current.get(k);
      if (row) rows.push(row);
    });
    return rows;
  }, [selectable, currentByKey, selected]);

  const bulkBarActive = selectable && !!bulkActions && selected.size > 0;

  // colspan used by loading skeleton + empty state
  const totalRenderedCols = visibleColumns.length + (selectable ? 1 : 0);

  return (
    <div className="rounded-xl border border-border bg-surface-1 overflow-hidden">
      {/* Toolbar only renders when the bulk action bar has something to
          show. The columns dropdown lives OUTSIDE the table — render
          <ColumnsMenu> in your page header via useTablePrefs(). */}
      {bulkBarActive && (
        <div className="flex items-center gap-2 border-b border-border-subtle bg-accent/5 px-3 py-2">
          {bulkActions!({ selected: selectedRows, selectedKeys, clear: clearSelection })}
        </div>
      )}

      {/* Capped body height so choosing 20/50/100 per page triggers a
          vertical scroll inside the table rather than pushing the page
          down and hiding the pagination below the fold. `thead` cells all
          get `sticky top-0` so column headers stay visible while the body
          scrolls. 100dvh so mobile browser chrome doesn't clip. The -260
          buffer leaves room for the sticky page header + list chrome +
          pagination footer without being fragile to small layout tweaks. */}
      <div className="overflow-auto max-h-[calc(100dvh-260px)]">
        <table ref={tableRef} className="w-full text-left" style={{ minWidth: "max-content" }}>
          <thead>
            {/* `shadow-[...]` gives the sticky row a subtle bottom edge so
                body rows sliding under it read as "behind" instead of
                butting up against the header borderlessly. */}
            <tr className="border-b border-border bg-surface-2 shadow-[0_1px_0_0_var(--color-border)]">
              {selectable && (
                <th
                  className="z-30 bg-surface-2 px-3 py-2.5 w-10"
                  style={{ width: 40, minWidth: 40, position: "sticky", top: 0, left: 0 }}
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
              {visibleColumns.map((col, colIdx) => {
                const w = getColumnWidth(col);
                const widthStyle = { width: `${w}px`, minWidth: `${w}px` };
                // Fixed columns are locked (sticky offset math would break);
                // everything else grows a resize handle when `resizable` is on.
                const canResize = resizable && !col.fixed;
                return (
                <th
                  key={col.key}
                  data-col-key={col.key}
                  // Inline `position: sticky` wins over any Tailwind class
                  // ordering collision (we previously had both `relative`
                  // and `sticky` in the class list — whichever came last in
                  // the generated CSS won, which is fragile). position:
                  // sticky also serves as the positioning context for the
                  // absolute-positioned resize handle below, so we no
                  // longer need a separate `relative`.
                  style={{ ...widthStyle, ...stickyStyle(col), position: "sticky", top: 0 }}
                  className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted ${stickyHeadClass(col)} ${colIdx < visibleColumns.length - 1 ? "border-r border-border" : ""}`}
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
                  {canResize && (
                    // Hit zone: 10px straddling the column's right edge
                    // (half inside, half past) so the user doesn't need
                    // pixel-perfect aim. Visible affordance: a subtle
                    // static bar that brightens to accent on hover/drag.
                    <div
                      onMouseDown={(e) => startResize(col, e)}
                      onDoubleClick={(e) => { e.stopPropagation(); autoFitColumn(col); }}
                      onClick={(e) => e.stopPropagation()}
                      title={t("common.resizeColumnHint") || "Drag to resize · double-click to auto-fit"}
                      className="group/resizer absolute top-0 bottom-0 right-0 w-2.5 translate-x-1/2 cursor-col-resize select-none z-30"
                    >
                      <div className="pointer-events-none absolute inset-y-1.5 left-1/2 -translate-x-1/2 w-[2px] rounded-full bg-border/60 group-hover/resizer:bg-accent group-hover/resizer:w-[3px] group-active/resizer:bg-accent group-active/resizer:w-[3px] transition-all" />
                    </div>
                  )}
                </th>
              );})}
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
            ) : pagedData.length === 0 ? (
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
              pagedData.map((record, idx) => {
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
                          data-col-key={col.key}
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

      {effectiveTotal > 0 && (
        <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-4 py-2.5">
          <span className="text-[12px] text-text-muted tabular-nums">
            {(effectivePage - 1) * effectivePageSize + 1}–{Math.min(effectivePage * effectivePageSize, effectiveTotal)} / {effectiveTotal}
          </span>
          <div className="flex items-center gap-2">
            {/* Page-size selector — hidden on very small lists where it'd
                just be noise. Exposed whenever there are more rows than
                the smallest available option. */}
            {pageSizeOptions.length > 1 && effectiveTotal > Math.min(...pageSizeOptions) && (
              <select
                value={effectivePageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="rounded-lg border border-border bg-surface-1 px-1.5 py-0.5 text-[12px] text-text-secondary outline-none hover:bg-surface-2 focus:border-accent cursor-pointer"
                aria-label="Rows per page"
              >
                {pageSizeOptions.map((n) => (
                  <option key={n} value={n}>{(t("common.rowsPerPage" as any) || "{n} / page").replace("{n}", String(n))}</option>
                ))}
              </select>
            )}
            <div className="flex items-center gap-1">
              <button
                disabled={effectivePage <= 1}
                onClick={() => goToPage(effectivePage - 1)}
                className="rounded-lg p-1 text-text-muted hover:bg-surface-3 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const p = i + 1;
                return (
                  <button
                    key={p}
                    onClick={() => goToPage(p)}
                    className={`min-w-[28px] rounded-lg px-1.5 py-0.5 text-[12px] font-medium transition-colors ${
                      p === effectivePage ? "bg-accent text-surface-0" : "text-text-muted hover:bg-surface-3"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                disabled={effectivePage >= totalPages}
                onClick={() => goToPage(effectivePage + 1)}
                className="rounded-lg p-1 text-text-muted hover:bg-surface-3 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
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
          className={`fixed z-50 rounded-lg border border-border bg-surface-2 shadow-[var(--shadow-elevated)] ${options ? "w-24" : "w-52"}`}
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

// ═══════════════════════════════════════════════════════════════════════
// useTablePrefs + ColumnsMenu — externalize the columns dropdown so callers
// can place it wherever fits their page layout (typically next to a primary
// CTA like "New Role"). Pair these with DataTable's controlled `sort` and
// `hidden` props.
//
// Usage:
//   const prefs = useTablePrefs({ persistKey: "my-table:org/app" });
//   <ColumnsMenu columns={columns} hidden={prefs.hidden} onToggle={prefs.toggleHidden} />
//   <DataTable ... sort={prefs.sort} onSortChange={prefs.setSort} hidden={prefs.hidden} />
// ═══════════════════════════════════════════════════════════════════════

export interface TablePrefs {
  sort: SortState;
  setSort: (s: SortState) => void;
  hidden: Set<string>;
  setHidden: (h: Set<string>) => void;
  toggleHidden: (key: string) => void;
  widths: Record<string, number>;
  setWidth: (key: string, width: number) => void;
  resetWidths: () => void;
  pageSize: number;
  setPageSize: (n: number) => void;
}

export function useTablePrefs(opts?: {
  persistKey?: string;
  defaultSort?: SortState;
  defaultHiddenKeys?: string[];
  defaultPageSize?: number;
}): TablePrefs {
  const { persistKey, defaultSort, defaultHiddenKeys, defaultPageSize } = opts || {};
  const initial = useMemo(
    () => readInitialPrefs(persistKey, defaultSort, defaultHiddenKeys ?? [], defaultPageSize ?? 20),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [persistKey],
  );
  const [sort, setSort] = useState<SortState>(initial.sort);
  const [hidden, setHidden] = useState<Set<string>>(initial.hidden);
  const [widths, setWidths] = useState<Record<string, number>>(initial.widths);
  const [pageSize, setPageSize] = useState<number>(initial.pageSize);
  usePersistedPrefs(persistKey, true, sort, hidden, widths, pageSize);
  const toggleHidden = useCallback((key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);
  const setWidth = useCallback((key: string, width: number) => {
    setWidths((prev) => (prev[key] === width ? prev : { ...prev, [key]: width }));
  }, []);
  const resetWidths = useCallback(() => setWidths({}), []);
  return { sort, setSort, hidden, setHidden, toggleHidden, widths, setWidth, resetWidths, pageSize, setPageSize };
}

export function ColumnsMenu<T>({
  columns,
  hidden,
  onToggle,
  onResetWidths,
  align = "right",
}: {
  columns: Column<T>[];
  hidden: Set<string>;
  onToggle: (key: string) => void;
  // When provided, a "Reset column widths" footer appears in the dropdown.
  // Typically wire this to `useTablePrefs().resetWidths`.
  onResetWidths?: () => void;
  align?: "left" | "right";
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const toggleable = columns.filter((c) => c.hideable !== false && !c.fixed);
  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-1 px-2.5 py-2 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors"
        title={t("common.columns" as any) || "Columns"}
        aria-label={t("common.columns" as any) || "Columns"}
      >
        <Columns3 size={13} />
        <ChevronDown size={11} />
      </button>
      {open && (
        // z-50 sits above the table's sticky headers (z-30). Prior z-30
        // tied the sticky "操作" column on equal footing — later DOM
        // painting let the column cover this popup. Lift it out of the
        // competition entirely.
        <div className={`absolute ${align === "right" ? "right-0" : "left-0"} z-50 mt-1 min-w-[200px] rounded-lg border border-border bg-surface-1 p-1.5 shadow-[var(--shadow-elevated)]`}>
          {toggleable.map((c) => (
            <label key={c.key} className="flex items-center gap-2 rounded px-2 py-1.5 text-[12px] text-text-primary hover:bg-surface-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!hidden.has(c.key)}
                onChange={() => onToggle(c.key)}
                className="rounded border-border"
              />
              {c.title}
            </label>
          ))}
          {onResetWidths && (
            <>
              <div className="my-1 h-px bg-border-subtle" />
              <button
                onClick={() => { onResetWidths(); setOpen(false); }}
                className="w-full text-left rounded px-2 py-1.5 text-[12px] text-text-secondary hover:bg-surface-2 transition-colors"
              >
                {t("common.resetColumnWidths" as any) || "重置列宽"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
