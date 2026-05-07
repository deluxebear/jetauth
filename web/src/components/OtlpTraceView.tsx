import { useMemo, useState } from "react";
import {
  ChevronRight, ChevronDown, AlertCircle, CheckCircle2, XCircle,
  Server, Globe, Workflow, Send, Inbox, Hash, X, Clock,
} from "lucide-react";
import { useTranslation } from "../i18n";
import {
  parseOtlpTrace, formatDuration, formatOtlpTimestamp,
  type ParsedSpan, type ParsedTrace, type SpanKind, type SpanStatus,
} from "../utils/otlpTrace";

// ────────────────────────────────────────────────────────────────
// Visual mapping per status / kind. Coloring stays consistent with
// the rest of the app (info/accent/success/warning/danger tokens).
// ────────────────────────────────────────────────────────────────

function statusStyle(status: SpanStatus): { bar: string; text: string; Icon: typeof CheckCircle2 | null } {
  switch (status) {
    case "OK":     return { bar: "bg-success", text: "text-success", Icon: CheckCircle2 };
    case "ERROR":  return { bar: "bg-danger",  text: "text-danger",  Icon: XCircle };
    default:       return { bar: "bg-accent",  text: "text-text-muted", Icon: null };
  }
}

function kindIcon(kind: SpanKind) {
  switch (kind) {
    case "SERVER":   return Server;
    case "CLIENT":   return Globe;
    case "PRODUCER": return Send;
    case "CONSUMER": return Inbox;
    case "INTERNAL": return Workflow;
    default:         return Hash;
  }
}

// ────────────────────────────────────────────────────────────────
// Span row (one line of the waterfall). Indentation expresses tree
// depth; the right-side bar shows time placement within the trace
// window. Toggling a span hides its descendants.
// ────────────────────────────────────────────────────────────────

interface SpanRowProps {
  span: ParsedSpan;
  depth: number;
  trace: ParsedTrace;
  selectedId: string;
  onSelect: (id: string) => void;
  collapsed: Set<string>;
  toggleCollapsed: (id: string) => void;
  hasChildren: boolean;
}

function SpanRow({
  span, depth, trace, selectedId, onSelect,
  collapsed, toggleCollapsed, hasChildren,
}: SpanRowProps) {
  const isOpen = !collapsed.has(span.spanId);
  const isSelected = selectedId === span.spanId;
  const traceWindowMs = trace.durationMs > 0 ? trace.durationMs : 1;
  const offsetMs = Number((span.startNano - trace.startNano) / 1_000_000n);
  const leftPct = Math.max(0, Math.min(100, (offsetMs / traceWindowMs) * 100));
  const widthPct = Math.max(0.5, Math.min(100 - leftPct, (span.durationMs / traceWindowMs) * 100));
  const sty = statusStyle(span.status);
  const KindIcon = kindIcon(span.kind);

  return (
    <div
      className={`grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-2 px-2 py-1.5 rounded transition-colors ${isSelected ? "bg-accent/10" : "hover:bg-surface-2/60"}`}
    >
      {/* Left column: tree indent + name + duration */}
      <button
        onClick={() => onSelect(span.spanId)}
        className="flex items-center gap-1.5 min-w-0 text-left"
        style={{ paddingLeft: `${depth * 14}px` }}
      >
        {hasChildren ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); toggleCollapsed(span.spanId); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); toggleCollapsed(span.spanId); } }}
            className="shrink-0 rounded p-0.5 text-text-muted hover:text-text-primary hover:bg-surface-2 cursor-pointer"
          >
            {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        ) : (
          <span className="shrink-0 w-4" />
        )}
        <KindIcon size={11} className="shrink-0 text-text-muted" />
        <span className="truncate text-[12px] text-text-primary font-medium" title={span.name}>
          {span.name || <span className="italic text-text-muted">unnamed</span>}
        </span>
        {span.serviceName && (
          <span className="hidden md:inline truncate text-[10px] text-text-muted font-mono" title={span.serviceName}>
            · {span.serviceName}
          </span>
        )}
      </button>

      {/* Right column: waterfall bar + duration label */}
      <div className="relative h-5 flex items-center">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 bg-surface-2 rounded" />
        <div
          className={`absolute h-2.5 rounded ${sty.bar} ${isSelected ? "ring-1 ring-accent" : ""}`}
          style={{ left: `${leftPct}%`, width: `${widthPct}%`, top: "calc(50% - 5px)" }}
          title={`${formatDuration(span.durationMs)} @ +${formatDuration(offsetMs)}`}
        />
        <span
          className={`absolute text-[10px] font-mono ${sty.text} ${isSelected ? "font-semibold" : ""} pointer-events-none`}
          style={{
            // Place the label inside the bar when there's room, otherwise to its right.
            left: widthPct > 18 ? `calc(${leftPct}% + 4px)` : `calc(${leftPct + widthPct}% + 4px)`,
            top: "calc(50% - 6px)",
            color: widthPct > 18 ? "#fff" : undefined,
          }}
        >
          {formatDuration(span.durationMs)}
        </span>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Tree renderer — DFS the parsed trace, emit one SpanRow per span.
// Collapsed parents stop the descent.
// ────────────────────────────────────────────────────────────────

function renderTree(
  trace: ParsedTrace,
  selectedId: string,
  onSelect: (id: string) => void,
  collapsed: Set<string>,
  toggleCollapsed: (id: string) => void,
): React.ReactNode {
  const out: React.ReactNode[] = [];
  const walk = (span: ParsedSpan, depth: number) => {
    const children = trace.childrenOf.get(span.spanId) ?? [];
    out.push(
      <SpanRow
        key={span.spanId}
        span={span}
        depth={depth}
        trace={trace}
        selectedId={selectedId}
        onSelect={onSelect}
        collapsed={collapsed}
        toggleCollapsed={toggleCollapsed}
        hasChildren={children.length > 0}
      />,
    );
    if (collapsed.has(span.spanId)) return;
    for (const c of children) walk(c, depth + 1);
  };
  for (const root of trace.roots) walk(root, 0);
  return out;
}

// ────────────────────────────────────────────────────────────────
// Detail panel — shows everything we know about the selected span.
// ────────────────────────────────────────────────────────────────

function SpanDetail({
  span, trace, onClose, t,
}: {
  span: ParsedSpan;
  trace: ParsedTrace;
  onClose: () => void;
  t: (k: string) => string;
}) {
  const sty = statusStyle(span.status);
  const KindIcon = kindIcon(span.kind);
  const offsetMs = Number((span.startNano - trace.startNano) / 1_000_000n);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-start justify-between gap-2 px-3 py-2.5 border-b border-border">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <KindIcon size={12} className="text-text-muted" />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">{span.kind}</span>
            {sty.Icon && <sty.Icon size={11} className={sty.text} />}
            <span className={`text-[10px] font-semibold ${sty.text}`}>{span.status}</span>
          </div>
          <h3 className="text-[13px] font-semibold text-text-primary mt-0.5 break-words">
            {span.name || <span className="italic text-text-muted">unnamed</span>}
          </h3>
          {span.statusMessage && (
            <p className={`text-[11px] mt-0.5 ${sty.text}`}>{span.statusMessage}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded p-1 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
          title={t("common.close")}
        >
          <X size={13} />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-3">
        {/* Timing */}
        <section>
          <h4 className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1.5">
            {t("entries.trace.section.timing")}
          </h4>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11.5px]">
            <dt className="text-text-muted">{t("entries.trace.field.duration")}</dt>
            <dd className="font-mono text-text-secondary">{formatDuration(span.durationMs)}</dd>
            <dt className="text-text-muted">{t("entries.trace.field.start")}</dt>
            <dd className="font-mono text-text-secondary break-all">{formatOtlpTimestamp(span.startNano)}</dd>
            <dt className="text-text-muted">{t("entries.trace.field.end")}</dt>
            <dd className="font-mono text-text-secondary break-all">{formatOtlpTimestamp(span.endNano)}</dd>
            <dt className="text-text-muted">{t("entries.trace.field.offset")}</dt>
            <dd className="font-mono text-text-secondary">+{formatDuration(offsetMs)}</dd>
          </dl>
        </section>

        {/* Identity */}
        <section>
          <h4 className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1.5">
            {t("entries.trace.section.identity")}
          </h4>
          <dl className="space-y-1 text-[11.5px]">
            <div>
              <dt className="text-text-muted">{t("entries.trace.field.spanId")}</dt>
              <dd className="font-mono text-text-secondary break-all">{span.spanId}</dd>
            </div>
            {span.parentSpanId && (
              <div>
                <dt className="text-text-muted">{t("entries.trace.field.parentSpanId")}</dt>
                <dd className="font-mono text-text-secondary break-all">{span.parentSpanId}</dd>
              </div>
            )}
            <div>
              <dt className="text-text-muted">{t("entries.trace.field.traceId")}</dt>
              <dd className="font-mono text-text-secondary break-all">{span.traceId}</dd>
            </div>
            {span.serviceName && (
              <div>
                <dt className="text-text-muted">{t("entries.trace.field.service")}</dt>
                <dd className="font-mono text-text-secondary">{span.serviceName}</dd>
              </div>
            )}
            {span.scopeName && (
              <div>
                <dt className="text-text-muted">{t("entries.trace.field.scope")}</dt>
                <dd className="font-mono text-text-secondary">
                  {span.scopeName}{span.scopeVersion ? ` @ ${span.scopeVersion}` : ""}
                </dd>
              </div>
            )}
          </dl>
        </section>

        {/* Span attributes */}
        {span.attributes.length > 0 && (
          <section>
            <h4 className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1.5">
              {t("entries.trace.section.attributes")} ({span.attributes.length})
            </h4>
            <div className="rounded border border-border overflow-hidden">
              <table className="w-full text-[11.5px]">
                <tbody>
                  {span.attributes.map((a, i) => (
                    <tr key={i} className="border-b border-border last:border-b-0">
                      <td className="px-2 py-1 align-top w-[40%] font-mono text-text-muted break-all">{a.key}</td>
                      <td className="px-2 py-1 font-mono text-text-secondary break-all">{a.value || <span className="italic text-text-muted">empty</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Resource attributes (collapsed by default since many spans share these) */}
        {span.resourceAttributes.length > 0 && (
          <details className="rounded border border-border bg-surface-1">
            <summary className="cursor-pointer px-2 py-1.5 text-[11px] font-medium text-text-muted hover:text-text-primary">
              {t("entries.trace.section.resourceAttributes")} ({span.resourceAttributes.length})
            </summary>
            <table className="w-full text-[11.5px] border-t border-border">
              <tbody>
                {span.resourceAttributes.map((a, i) => (
                  <tr key={i} className="border-b border-border last:border-b-0">
                    <td className="px-2 py-1 align-top w-[40%] font-mono text-text-muted break-all">{a.key}</td>
                    <td className="px-2 py-1 font-mono text-text-secondary break-all">{a.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}

        {/* Events — timeline list with offset from span start */}
        {span.events.length > 0 && (
          <section>
            <h4 className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1.5">
              {t("entries.trace.section.events")} ({span.events.length})
            </h4>
            <ol className="space-y-1.5">
              {span.events.map((ev, i) => (
                <li key={i} className="rounded border border-border bg-surface-1 px-2 py-1.5">
                  <div className="flex items-center gap-2 text-[11.5px]">
                    <Clock size={11} className="shrink-0 text-text-muted" />
                    <span className="font-mono text-text-muted">+{formatDuration(ev.offsetMs)}</span>
                    <span className="text-text-primary font-medium truncate" title={ev.name}>{ev.name || "—"}</span>
                  </div>
                  {ev.attributes.length > 0 && (
                    <ul className="mt-1 space-y-0.5 pl-5">
                      {ev.attributes.map((a, j) => (
                        <li key={j} className="text-[11px] font-mono text-text-muted truncate" title={`${a.key}=${a.value}`}>
                          <span className="text-text-secondary">{a.key}</span>={a.value}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Top-level trace view — strip with metadata + the waterfall + side
// detail panel. Drops in directly where the raw <pre> message used
// to live on EntryEditPage.
// ────────────────────────────────────────────────────────────────

interface Props {
  message: string;
}

export default function OtlpTraceView({ message }: Props) {
  const { t } = useTranslation();
  const trace = useMemo(() => parseOtlpTrace(message), [message]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCollapsed = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectedSpan = useMemo(
    () => trace?.spans.find((s) => s.spanId === selectedId) ?? null,
    [trace, selectedId],
  );

  if (!trace) {
    return (
      <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 flex items-start gap-2">
        <AlertCircle size={14} className="shrink-0 mt-0.5 text-warning" />
        <p className="text-[12px] text-text-secondary">
          {t("entries.trace.error.unparseable")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Trace header */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-2 rounded-lg border border-border bg-surface-1 text-[11.5px]">
        <span className="text-text-muted">
          {t("entries.trace.header.spans")}{" "}
          <span className="text-text-primary font-mono font-medium">{trace.spans.length}</span>
        </span>
        <span className="text-text-muted">
          {t("entries.trace.header.duration")}{" "}
          <span className="text-text-primary font-mono font-medium">{formatDuration(trace.durationMs)}</span>
        </span>
        {trace.serviceNames.length > 0 && (
          <span className="text-text-muted">
            {t("entries.trace.header.services")}{" "}
            <span className="text-text-primary font-mono font-medium">{trace.serviceNames.join(", ")}</span>
          </span>
        )}
        {trace.errorCount > 0 && (
          <span className="text-danger inline-flex items-center gap-1">
            <XCircle size={11} />
            {t("entries.trace.header.errors").replace("{count}", String(trace.errorCount))}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-3">
        {/* Waterfall */}
        <div className="rounded-lg border border-border bg-surface-1 overflow-hidden">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-2 px-2 py-1.5 border-b border-border bg-surface-2/50 text-[10px] font-medium text-text-muted uppercase tracking-wide">
            <div>{t("entries.trace.col.span")}</div>
            <div>{t("entries.trace.col.timeline")}</div>
          </div>
          <div className="max-h-[640px] overflow-auto py-1">
            {renderTree(trace, selectedId, setSelectedId, collapsed, toggleCollapsed)}
          </div>
        </div>

        {/* Detail */}
        <aside className="rounded-lg border border-border bg-surface-1 max-h-[640px] overflow-hidden flex flex-col">
          {selectedSpan ? (
            <SpanDetail span={selectedSpan} trace={trace} onClose={() => setSelectedId("")} t={t} />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center px-4 py-8 text-text-muted">
              <Workflow size={26} className="mb-2 opacity-40" />
              <p className="text-[12px]">{t("entries.trace.detail.empty")}</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
