import { useState, useRef, useEffect, useMemo, useCallback } from "react";

export interface SortState {
  field: string;
  order: "ascend" | "descend" | "";
}

interface PersistShape {
  sort?: SortState;
  hidden?: string[];
  widths?: Record<string, number>;
  pageSize?: number;
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

// Shared initial-prefs reader used by both DataTable's uncontrolled state
// and the public useTablePrefs hook. defaultHiddenKeys is consulted first;
// callers that pass `columns` can derive them from columns[].defaultHidden.
export function readInitialPrefs(
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
export function usePersistedPrefs(
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
