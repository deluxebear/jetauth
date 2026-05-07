// Parser for OTLP trace payloads stored on Entry.message.
//
// The backend marshals incoming protobuf with protojson (Multiline + Indent),
// see controllers/entry_opentelemetry.go: AddOtlpTrace. So `Entry.message`
// for a trace looks like:
//
// {
//   "resourceSpans": [{
//     "resource": { "attributes": [...] },
//     "scopeSpans": [{
//       "scope": { "name": "...", "version": "..." },
//       "spans": [{
//         "traceId": "<base64 16B>",
//         "spanId": "<base64 8B>",
//         "parentSpanId": "<base64 8B>",
//         "name": "...",
//         "kind": "SPAN_KIND_INTERNAL",
//         "startTimeUnixNano": "1735000000000000000",
//         "endTimeUnixNano":   "1735000001000000000",
//         "attributes": [{ "key": "...", "value": { "stringValue": "..." } }],
//         "events": [{ "timeUnixNano": "...", "name": "...", "attributes": [...] }],
//         "status": { "code": "STATUS_CODE_OK" }
//       }]
//     }]
//   }]
// }
//
// Notes:
//  * protojson encodes int64 as strings — we parse them as BigInt to keep ns precision
//  * traceId / spanId are base64-encoded bytes; we keep them as opaque strings for
//    parent-child matching (no need to render the raw bytes)
//  * `kind` and `status.code` may be the SPAN_KIND_/STATUS_CODE_ enum string OR a
//    numeric string (older protojson versions); we normalize

export type SpanStatus = "OK" | "ERROR" | "UNSET";
export type SpanKind = "INTERNAL" | "SERVER" | "CLIENT" | "PRODUCER" | "CONSUMER" | "UNSPECIFIED";

export interface ParsedAttribute {
  key: string;
  value: string;
  raw: unknown;
}

export interface ParsedEvent {
  name: string;
  timeNano: bigint;
  /** ms offset from the parent span's startNano, for waterfall placement */
  offsetMs: number;
  attributes: ParsedAttribute[];
}

export interface ParsedSpan {
  /** unique within the parsed trace; we use base64 spanId as-is */
  spanId: string;
  parentSpanId: string;
  traceId: string;
  name: string;
  kind: SpanKind;
  status: SpanStatus;
  statusMessage: string;
  startNano: bigint;
  endNano: bigint;
  durationMs: number;
  /** resource service.name — convention to identify the producing service */
  serviceName: string;
  /** scope name — e.g. instrumentation library */
  scopeName: string;
  scopeVersion: string;
  attributes: ParsedAttribute[];
  resourceAttributes: ParsedAttribute[];
  events: ParsedEvent[];
}

export interface ParsedTrace {
  /** all spans, flat */
  spans: ParsedSpan[];
  /** spans whose parent isn't present in this payload (display roots) */
  roots: ParsedSpan[];
  /** spanId → its children (sorted by startNano) */
  childrenOf: Map<string, ParsedSpan[]>;
  /** earliest startNano among all spans */
  startNano: bigint;
  /** latest endNano among all spans */
  endNano: bigint;
  /** end - start in ms (rounded to nearest µs in float) */
  durationMs: number;
  /** distinct service.name values seen in the resource attributes */
  serviceNames: string[];
  /** count of spans with status ERROR */
  errorCount: number;
}

const NANOS_PER_MS = 1_000_000n;

function safeBigInt(v: unknown): bigint {
  if (typeof v === "string" && /^-?\d+$/.test(v)) {
    try { return BigInt(v); } catch { /* fall through */ }
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    return BigInt(Math.trunc(v));
  }
  return 0n;
}

function nanosToMs(n: bigint): number {
  // Carry sub-ms precision: divmod for whole ms, fractional from remainder.
  const whole = n / NANOS_PER_MS;
  const remainder = n % NANOS_PER_MS;
  return Number(whole) + Number(remainder) / 1_000_000;
}

function normalizeKind(raw: unknown): SpanKind {
  const s = typeof raw === "string" ? raw : "";
  if (s.endsWith("INTERNAL") || s === "1") return "INTERNAL";
  if (s.endsWith("SERVER") || s === "2") return "SERVER";
  if (s.endsWith("CLIENT") || s === "3") return "CLIENT";
  if (s.endsWith("PRODUCER") || s === "4") return "PRODUCER";
  if (s.endsWith("CONSUMER") || s === "5") return "CONSUMER";
  return "UNSPECIFIED";
}

function normalizeStatus(raw: unknown): SpanStatus {
  const s = typeof raw === "string" ? raw : "";
  if (s.endsWith("OK") || s === "1") return "OK";
  if (s.endsWith("ERROR") || s === "2") return "ERROR";
  return "UNSET";
}

// AnyValue → human display + the raw underlying JS value.
// Spec: https://github.com/open-telemetry/opentelemetry-proto/blob/main/opentelemetry/proto/common/v1/common.proto
export function unwrapAnyValue(v: unknown): { display: string; raw: unknown } {
  if (v === null || typeof v !== "object") {
    return { display: v == null ? "" : String(v), raw: v };
  }
  const obj = v as Record<string, unknown>;
  if ("stringValue" in obj) return { display: String(obj.stringValue ?? ""), raw: obj.stringValue };
  if ("intValue" in obj) return { display: String(obj.intValue ?? ""), raw: obj.intValue };
  if ("doubleValue" in obj) return { display: String(obj.doubleValue ?? ""), raw: obj.doubleValue };
  if ("boolValue" in obj) return { display: String(!!obj.boolValue), raw: !!obj.boolValue };
  if ("bytesValue" in obj) return { display: `<bytes ${typeof obj.bytesValue === "string" ? obj.bytesValue.length : 0}b>`, raw: obj.bytesValue };
  if ("arrayValue" in obj && obj.arrayValue && typeof obj.arrayValue === "object") {
    const inner = (obj.arrayValue as { values?: unknown[] }).values ?? [];
    const items = inner.map((x) => unwrapAnyValue(x).display);
    return { display: `[${items.join(", ")}]`, raw: inner };
  }
  if ("kvlistValue" in obj && obj.kvlistValue && typeof obj.kvlistValue === "object") {
    const list = (obj.kvlistValue as { values?: Array<{ key?: string; value?: unknown }> }).values ?? [];
    const items = list.map((kv) => `${kv.key ?? ""}=${unwrapAnyValue(kv.value).display}`);
    return { display: `{${items.join(", ")}}`, raw: list };
  }
  // Unknown variant — just stringify so we don't lose data.
  try { return { display: JSON.stringify(obj), raw: obj }; } catch { return { display: "", raw: obj }; }
}

function unwrapAttributes(raw: unknown): ParsedAttribute[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((kv): kv is Record<string, unknown> => !!kv && typeof kv === "object")
    .map((kv) => {
      const key = typeof kv.key === "string" ? kv.key : "";
      const u = unwrapAnyValue(kv.value);
      return { key, value: u.display, raw: u.raw };
    })
    .filter((a) => a.key !== "");
}

function findAttribute(attrs: ParsedAttribute[], key: string): string {
  for (const a of attrs) if (a.key === key) return a.value;
  return "";
}

interface RawSpan {
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  name?: string;
  kind?: unknown;
  startTimeUnixNano?: string;
  endTimeUnixNano?: string;
  attributes?: unknown;
  events?: Array<{
    timeUnixNano?: string;
    name?: string;
    attributes?: unknown;
  }>;
  status?: { code?: unknown; message?: string };
}

interface RawScope {
  scope?: { name?: string; version?: string };
  spans?: RawSpan[];
}

interface RawResource {
  resource?: { attributes?: unknown };
  scopeSpans?: RawScope[];
}

/**
 * Parse a JSON OTLP trace payload (protojson form). Returns null when the
 * payload is empty / unparseable / contains no spans.
 */
export function parseOtlpTrace(message: string): ParsedTrace | null {
  if (!message || !message.trim()) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(message);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  const resourceSpansRaw = (payload as { resourceSpans?: RawResource[] }).resourceSpans;
  if (!Array.isArray(resourceSpansRaw) || resourceSpansRaw.length === 0) return null;

  const flat: ParsedSpan[] = [];

  for (const rs of resourceSpansRaw) {
    const resourceAttrs = unwrapAttributes(rs?.resource?.attributes);
    const serviceName = findAttribute(resourceAttrs, "service.name");
    const scopeSpans = Array.isArray(rs?.scopeSpans) ? rs!.scopeSpans! : [];

    for (const ss of scopeSpans) {
      const scopeName = ss?.scope?.name ?? "";
      const scopeVersion = ss?.scope?.version ?? "";
      const spans = Array.isArray(ss?.spans) ? ss!.spans! : [];

      for (const s of spans) {
        const spanId = s?.spanId ?? "";
        if (!spanId) continue; // unkeyed spans aren't useful for a tree
        const startNano = safeBigInt(s?.startTimeUnixNano);
        const endNano = safeBigInt(s?.endTimeUnixNano);
        const attributes = unwrapAttributes(s?.attributes);
        const events: ParsedEvent[] = (s?.events ?? []).map((e) => {
          const t = safeBigInt(e?.timeUnixNano);
          return {
            name: e?.name ?? "",
            timeNano: t,
            offsetMs: nanosToMs(t > startNano ? t - startNano : 0n),
            attributes: unwrapAttributes(e?.attributes),
          };
        });

        flat.push({
          spanId,
          parentSpanId: s?.parentSpanId ?? "",
          traceId: s?.traceId ?? "",
          name: s?.name ?? "",
          kind: normalizeKind(s?.kind),
          status: normalizeStatus(s?.status?.code),
          statusMessage: s?.status?.message ?? "",
          startNano,
          endNano,
          durationMs: nanosToMs(endNano > startNano ? endNano - startNano : 0n),
          serviceName,
          scopeName,
          scopeVersion,
          attributes,
          resourceAttributes: resourceAttrs,
          events,
        });
      }
    }
  }

  if (flat.length === 0) return null;

  // Build adjacency. spans whose parentSpanId isn't in our set become "roots"
  // (their parent might live in another trace payload, or this is genuinely
  // a top-level span).
  const ids = new Set(flat.map((s) => s.spanId));
  const childrenOf = new Map<string, ParsedSpan[]>();
  const roots: ParsedSpan[] = [];

  for (const s of flat) {
    if (s.parentSpanId && ids.has(s.parentSpanId)) {
      const arr = childrenOf.get(s.parentSpanId) ?? [];
      arr.push(s);
      childrenOf.set(s.parentSpanId, arr);
    } else {
      roots.push(s);
    }
  }

  // Stable order: by startNano then by name for deterministic rendering.
  const sorter = (a: ParsedSpan, b: ParsedSpan) =>
    a.startNano === b.startNano
      ? a.name.localeCompare(b.name)
      : a.startNano < b.startNano ? -1 : 1;
  roots.sort(sorter);
  for (const arr of childrenOf.values()) arr.sort(sorter);

  // Trace-level bounds — fall back to root span bounds if anything looks off.
  let startNano = flat[0].startNano;
  let endNano = flat[0].endNano;
  for (const s of flat) {
    if (s.startNano > 0n && (startNano === 0n || s.startNano < startNano)) startNano = s.startNano;
    if (s.endNano > endNano) endNano = s.endNano;
  }
  if (endNano < startNano) endNano = startNano;

  const serviceNames = Array.from(new Set(flat.map((s) => s.serviceName).filter(Boolean)));
  const errorCount = flat.filter((s) => s.status === "ERROR").length;

  return {
    spans: flat,
    roots,
    childrenOf,
    startNano,
    endNano,
    durationMs: nanosToMs(endNano - startNano),
    serviceNames,
    errorCount,
  };
}

/**
 * Format an OTLP timestamp string-int64 (nanoseconds since epoch) as ISO 8601.
 * Falls back to the raw string when out of range or unparseable.
 */
export function formatOtlpTimestamp(nano: bigint): string {
  if (nano === 0n) return "";
  const ms = Number(nano / 1_000_000n);
  if (!Number.isFinite(ms)) return nano.toString();
  try {
    return new Date(ms).toISOString();
  } catch {
    return nano.toString();
  }
}

/**
 * Format milliseconds with a sensible unit. 0.42ms → "420µs", 12.345 → "12.3ms",
 * 1234.5 → "1.23s".
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0";
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
  if (ms < 1000) return `${ms.toFixed(ms < 10 ? 2 : 1)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60_000).toFixed(2)}min`;
}
