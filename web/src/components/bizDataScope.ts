export const DATA_SCOPE_TYPES = ["all", "org", "dept_and_children", "dept", "self", "custom"] as const;
export type DataScopeType = (typeof DATA_SCOPE_TYPES)[number];

export interface DataScopeValue {
  type: DataScopeType | "";
  values: string[];
}

type PropsObject = Record<string, unknown>;

function parseObject(raw: string): PropsObject | null {
  if (!raw.trim()) return {};
  try {
    const obj = JSON.parse(raw);
    if (typeof obj === "object" && obj !== null && !Array.isArray(obj)) return obj as PropsObject;
  } catch { /* fall through */ }
  return null;
}

/** Reads the typed dataScope out of a properties JSON string. */
export function readDataScope(raw: string): DataScopeValue {
  const obj = parseObject(raw);
  const ds = obj?.dataScope as Record<string, unknown> | undefined;
  if (!ds || typeof ds !== "object" || typeof ds.type !== "string") return { type: "", values: [] };
  const type = (DATA_SCOPE_TYPES as readonly string[]).includes(ds.type) ? (ds.type as DataScopeType) : "";
  const values = Array.isArray(ds.values) ? ds.values.filter((v): v is string => typeof v === "string") : [];
  return { type, values };
}

/**
 * Returns a new properties JSON string with the dataScope replaced, keeping all
 * other keys (and any per-resource overrides on the existing dataScope).
 * Returns null when `raw` is not a JSON object.
 */
export function writeDataScope(raw: string, next: DataScopeValue): string | null {
  const obj = parseObject(raw);
  if (obj === null) return null;
  const out: PropsObject = { ...obj };
  if (next.type === "") {
    delete out.dataScope;
  } else {
    const prev = out.dataScope as Record<string, unknown> | undefined;
    const ds: Record<string, unknown> = { type: next.type };
    if (next.type === "custom") ds.values = next.values;
    if (prev && typeof prev === "object" && prev.resources) ds.resources = prev.resources;
    out.dataScope = ds;
  }
  return Object.keys(out).length > 0 ? JSON.stringify(out, null, 2) : "";
}

/** True when the raw properties string is empty or a JSON object. */
export function isValidPropsJson(raw: string): boolean {
  return parseObject(raw) !== null;
}
