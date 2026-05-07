import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, RefreshCw, AlertCircle, CheckCircle2, XCircle, Wrench,
  MessageSquare, Trophy, X, Anchor, ExternalLink,
} from "lucide-react";
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  type Node, type Edge, type NodeProps, Handle, Position, useReactFlow,
} from "@xyflow/react";
import dagre from "dagre";
import "@xyflow/react/dist/style.css";

import { useTranslation } from "../i18n";
import * as EntryBackend from "../backend/EntryBackend";
import type {
  OpenClawSessionGraph,
  OpenClawSessionGraphNode,
} from "../backend/EntryBackend";

// ────────────────────────────────────────────────────────────────
// Node typing & visual mapping. Each session payload `kind` gets its
// own color band and icon so the tree is scannable at a glance.
// ────────────────────────────────────────────────────────────────

type Kind = "task" | "tool_call" | "tool_result" | "final" | "assistant" | string;

interface KindStyle {
  /** tailwind classes for the node container border + background tint */
  container: string;
  /** tailwind classes for the icon chip */
  iconBg: string;
  /** the lucide icon */
  Icon: typeof Wrench;
  /** localized label key suffix under sessionGraph.kind.* */
  labelKey: string;
}

function kindStyle(node: OpenClawSessionGraphNode): KindStyle {
  // tool_result splits on success: green vs red is the most useful signal
  // in a debugging session, so we branch before falling through.
  if (node.kind === "tool_result") {
    if (node.ok === false) {
      return {
        container: "border-danger/50 bg-danger/5",
        iconBg: "bg-danger/15 text-danger",
        Icon: XCircle,
        labelKey: "toolResultFail",
      };
    }
    return {
      container: "border-success/50 bg-success/5",
      iconBg: "bg-success/15 text-success",
      Icon: CheckCircle2,
      labelKey: "toolResultOk",
    };
  }
  switch (node.kind as Kind) {
    case "task":
      return {
        container: "border-info/50 bg-info/5",
        iconBg: "bg-info/15 text-info",
        Icon: MessageSquare,
        labelKey: "task",
      };
    case "tool_call":
      return {
        container: "border-accent/50 bg-accent/5",
        iconBg: "bg-accent/15 text-accent",
        Icon: Wrench,
        labelKey: "toolCall",
      };
    case "final":
      return {
        container: "border-warning/50 bg-warning/5",
        iconBg: "bg-warning/15 text-warning",
        Icon: Trophy,
        labelKey: "final",
      };
    default:
      return {
        container: "border-border bg-surface-1",
        iconBg: "bg-surface-2 text-text-secondary",
        Icon: MessageSquare,
        labelKey: "other",
      };
  }
}

// ────────────────────────────────────────────────────────────────
// Custom node — keeps ReactFlow's positioning while letting us
// render a real card with title + meta line. Selected state lifts
// the border to the accent color so it's obvious which node the
// detail panel is showing.
// ────────────────────────────────────────────────────────────────

// ReactFlow v12 constrains node data to Record<string, unknown>; the index
// signature satisfies that constraint while preserving the strongly-typed
// fields we actually use.
interface CustomNodeData {
  payload: OpenClawSessionGraphNode;
  selected: boolean;
  onSelect: (id: string) => void;
  [key: string]: unknown;
}

function SessionNode({ data, id }: NodeProps<Node<CustomNodeData>>) {
  const { payload, selected, onSelect } = data;
  const style = kindStyle(payload);
  const Icon = style.Icon;
  const isSelected = selected;

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onSelect(id); }}
      className={`group cursor-pointer rounded-lg border-2 ${style.container} ${isSelected ? "ring-2 ring-accent ring-offset-2 ring-offset-surface-1" : ""} px-3 py-2 shadow-sm hover:shadow-md transition-shadow w-[260px]`}
    >
      <Handle type="target" position={Position.Top} className="!bg-text-muted/40 !border-0 !w-2 !h-2" />
      <div className="flex items-start gap-2">
        <div className={`shrink-0 rounded-md ${style.iconBg} p-1.5`}>
          <Icon size={13} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
              {payload.kind}
            </span>
            {payload.isAnchor && (
              <span className="inline-flex items-center gap-0.5 rounded bg-accent/15 text-accent text-[9px] font-semibold px-1 py-0.5">
                <Anchor size={8} />
              </span>
            )}
          </div>
          <div className="text-[12px] font-medium text-text-primary truncate mt-0.5" title={payload.summary}>
            {payload.summary || payload.tool || payload.kind}
          </div>
          {payload.tool && payload.kind !== "task" && (
            <div className="text-[10px] font-mono text-text-muted truncate mt-0.5" title={payload.tool}>
              {payload.tool}
            </div>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-text-muted/40 !border-0 !w-2 !h-2" />
    </div>
  );
}

const nodeTypes = { session: SessionNode };

// ────────────────────────────────────────────────────────────────
// Layout: dagre lays out the tree top-to-bottom. We pin sizes that
// match the SessionNode card so collisions are minimal. Tweak
// rankSep to increase vertical breathing room when sessions are
// dense (10+ tool calls per task).
// ────────────────────────────────────────────────────────────────

const NODE_WIDTH = 260;
const NODE_HEIGHT = 88;

function layoutWithDagre(
  rawNodes: Node<CustomNodeData>[],
  rawEdges: Edge[],
): { nodes: Node<CustomNodeData>[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 60 });

  rawNodes.forEach((n) => g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  rawEdges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);

  const positioned = rawNodes.map((n) => {
    const pos = g.node(n.id);
    return {
      ...n,
      // Dagre returns center-of-node; ReactFlow expects top-left.
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
    };
  });
  return { nodes: positioned, edges: rawEdges };
}

// ────────────────────────────────────────────────────────────────
// Stats strip — 6 metric tiles fed straight from the graph.stats
// payload. Failed count goes danger-tinted when > 0 so the eye
// catches it.
// ────────────────────────────────────────────────────────────────

function StatsStrip({ stats, t }: { stats: OpenClawSessionGraph["stats"]; t: (k: string) => string }) {
  const tiles: { key: string; label: string; value: number; danger?: boolean }[] = [
    { key: "total", label: t("sessionGraph.stats.total"), value: stats.totalNodes },
    { key: "task", label: t("sessionGraph.stats.task"), value: stats.taskCount },
    { key: "call", label: t("sessionGraph.stats.toolCall"), value: stats.toolCallCount },
    { key: "result", label: t("sessionGraph.stats.toolResult"), value: stats.toolResultCount },
    { key: "final", label: t("sessionGraph.stats.final"), value: stats.finalCount },
    { key: "failed", label: t("sessionGraph.stats.failed"), value: stats.failedCount, danger: stats.failedCount > 0 },
  ];
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
      {tiles.map((tile) => (
        <div
          key={tile.key}
          className={`rounded-lg border ${tile.danger ? "border-danger/40 bg-danger/5" : "border-border bg-surface-1"} px-3 py-2`}
        >
          <div className={`text-[18px] font-semibold ${tile.danger ? "text-danger" : "text-text-primary"} font-mono leading-none`}>
            {tile.value}
          </div>
          <div className="text-[11px] text-text-muted mt-1">{tile.label}</div>
        </div>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Detail panel — rendered to the right of the graph. Shows every
// useful field on the selected node, pretty-printing JSON-ish
// values when present.
// ────────────────────────────────────────────────────────────────

function DetailPanel({
  node,
  onClose,
  t,
}: {
  node: OpenClawSessionGraphNode | null;
  onClose: () => void;
  t: (k: string) => string;
}) {
  if (!node) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-4 text-text-muted">
        <MessageSquare size={28} className="mb-2 opacity-40" />
        <p className="text-[13px]">{t("sessionGraph.detail.empty")}</p>
      </div>
    );
  }

  const style = kindStyle(node);
  const Icon = style.Icon;

  const fields: { label: string; value: React.ReactNode; mono?: boolean }[] = [];
  if (node.timestamp) fields.push({ label: t("sessionGraph.field.timestamp"), value: node.timestamp, mono: true });
  if (node.tool) fields.push({ label: t("sessionGraph.field.tool"), value: node.tool, mono: true });
  if (node.query) fields.push({ label: t("sessionGraph.field.query"), value: node.query });
  if (node.url) {
    fields.push({
      label: t("sessionGraph.field.url"),
      value: (
        <a href={node.url} target="_blank" rel="noreferrer" className="text-accent hover:underline inline-flex items-center gap-1 break-all">
          {node.url} <ExternalLink size={11} />
        </a>
      ),
    });
  }
  if (node.path) fields.push({ label: t("sessionGraph.field.path"), value: node.path, mono: true });
  if (typeof node.ok === "boolean") {
    fields.push({
      label: t("sessionGraph.field.status"),
      value: node.ok ? (
        <span className="inline-flex items-center gap-1 text-success text-[12px] font-medium"><CheckCircle2 size={12} /> OK</span>
      ) : (
        <span className="inline-flex items-center gap-1 text-danger text-[12px] font-medium"><XCircle size={12} /> Failed</span>
      ),
    });
  }
  if (node.error) fields.push({ label: t("sessionGraph.field.error"), value: <span className="text-danger">{node.error}</span> });
  if (node.entryId) fields.push({ label: t("sessionGraph.field.entryId"), value: node.entryId, mono: true });
  if (node.toolCallId) fields.push({ label: t("sessionGraph.field.toolCallId"), value: node.toolCallId, mono: true });
  if (node.parentId) fields.push({ label: t("sessionGraph.field.parentId"), value: node.parentId, mono: true });

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-border">
        <div className="flex items-start gap-2 min-w-0">
          <div className={`shrink-0 rounded-md ${style.iconBg} p-1.5 mt-0.5`}>
            <Icon size={13} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">{node.kind}</span>
              {node.isAnchor && (
                <span className="inline-flex items-center gap-0.5 rounded bg-accent/15 text-accent text-[9px] font-semibold px-1 py-0.5">
                  <Anchor size={8} /> {t("sessionGraph.anchor")}
                </span>
              )}
            </div>
            <h2 className="text-[14px] font-semibold text-text-primary mt-0.5 break-words">
              {node.summary || node.tool || node.kind}
            </h2>
          </div>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded p-1 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
          title={t("common.close")}
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-auto px-4 py-3 space-y-3">
        {fields.length > 0 && (
          <dl className="space-y-2">
            {fields.map((f, i) => (
              <div key={i}>
                <dt className="text-[11px] font-medium text-text-muted uppercase tracking-wide mb-0.5">{f.label}</dt>
                <dd className={`text-[12px] text-text-secondary break-words ${f.mono ? "font-mono" : ""}`}>{f.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {node.text && (
          <div>
            <dt className="text-[11px] font-medium text-text-muted uppercase tracking-wide mb-1">
              {t("sessionGraph.field.text")}
            </dt>
            <pre className="rounded-md border border-border bg-surface-2 p-2.5 text-[11.5px] font-mono text-text-secondary whitespace-pre-wrap break-words max-h-[300px] overflow-auto">
              {node.text}
            </pre>
          </div>
        )}

        {fields.length === 0 && !node.text && (
          <p className="text-[12px] text-text-muted italic">{t("sessionGraph.detail.noFields")}</p>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Inner page — must live inside <ReactFlowProvider> so we can call
// useReactFlow() to fit the view after data loads / refreshes.
// ────────────────────────────────────────────────────────────────

interface InnerProps {
  graph: OpenClawSessionGraph | null;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}

function GraphSurface({ graph, selectedId, setSelectedId }: InnerProps) {
  const { fitView } = useReactFlow();
  const { t } = useTranslation();

  const select = useCallback((id: string) => setSelectedId(id), [setSelectedId]);

  // Build ReactFlow nodes/edges from the API payload + run dagre layout.
  // useMemo-keyed on graph identity so re-render only happens when data
  // actually changes (selection toggles re-use the layout).
  const { nodes, edges } = useMemo(() => {
    if (!graph) return { nodes: [] as Node<CustomNodeData>[], edges: [] as Edge[] };

    const rfNodes: Node<CustomNodeData>[] = graph.nodes.map((p) => ({
      id: p.id,
      type: "session",
      position: { x: 0, y: 0 }, // overridden by dagre
      data: {
        payload: p,
        selected: false, // updated by the next memo
        onSelect: select,
      },
    }));
    const rfEdges: Edge[] = graph.edges.map((e, i) => ({
      id: `e${i}`,
      source: e.source,
      target: e.target,
      animated: false,
      style: { stroke: "var(--border)", strokeWidth: 1.5 },
    }));
    return layoutWithDagre(rfNodes, rfEdges);
  }, [graph, select]);

  // Decorate nodes with current selection — cheaper than recomputing layout.
  const decoratedNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        data: { ...n.data, selected: n.id === selectedId },
      })),
    [nodes, selectedId],
  );

  // Auto-fit the viewport whenever the underlying graph changes shape.
  useEffect(() => {
    if (nodes.length === 0) return;
    // Schedule for after the initial render so the viewport has a real size.
    const id = window.setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 50);
    return () => window.clearTimeout(id);
  }, [nodes, fitView]);

  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-4">
        <AlertCircle size={32} className="text-text-muted/60 mb-3" />
        <h3 className="text-[14px] font-semibold text-text-primary">{t("sessionGraph.empty.title")}</h3>
        <p className="text-[12px] text-text-muted mt-1 max-w-md">{t("sessionGraph.empty.body")}</p>
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={decoratedNodes}
      edges={edges}
      nodeTypes={nodeTypes}
      proOptions={{ hideAttribution: true }}
      onPaneClick={() => setSelectedId(null)}
      fitView
      minZoom={0.2}
      maxZoom={1.5}
      nodesDraggable={false}
      nodesConnectable={false}
      panOnScroll
      zoomOnScroll={false}
      zoomOnPinch
    >
      <Background gap={16} size={1} />
      <Controls position="bottom-right" showInteractive={false} />
      <MiniMap
        position="bottom-left"
        nodeColor={(n) => {
          const p = (n.data as CustomNodeData).payload;
          if (p.kind === "tool_result" && p.ok === false) return "rgb(239 68 68)";
          if (p.kind === "tool_result") return "rgb(34 197 94)";
          if (p.kind === "tool_call") return "rgb(59 130 246)";
          if (p.kind === "final") return "rgb(234 179 8)";
          if (p.kind === "task") return "rgb(14 165 233)";
          return "rgb(148 163 184)";
        }}
        maskColor="rgba(15, 23, 42, 0.05)"
        pannable
        zoomable
      />
    </ReactFlow>
  );
}

// ────────────────────────────────────────────────────────────────
// Page wrapper — header, stats, two-column body.
// ────────────────────────────────────────────────────────────────

export default function SessionGraphPage() {
  const { owner, name } = useParams<{ owner: string; name: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [graph, setGraph] = useState<OpenClawSessionGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!owner || !name) return;
    setLoading(true);
    setError(null);
    try {
      const res = await EntryBackend.getOpenClawSessionGraph(owner, name);
      if (res.status === "ok") {
        setGraph(res.data ?? null);
      } else {
        setError(res.msg || t("sessionGraph.error.fetch"));
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("sessionGraph.error.fetch"));
    } finally {
      setLoading(false);
    }
  }, [owner, name, t]);

  useEffect(() => { load(); }, [load]);

  // Auto-select the anchor node on first load so users see context immediately
  // rather than an empty detail panel.
  useEffect(() => {
    if (!graph || selectedId !== null) return;
    const anchor = graph.nodes.find((n) => n.isAnchor);
    if (anchor) setSelectedId(anchor.id);
  }, [graph, selectedId]);

  const selectedNode = useMemo(
    () => graph?.nodes.find((n) => n.id === selectedId) ?? null,
    [graph, selectedId],
  );

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate(`/entries/${owner}/${name}`)}
            className="rounded-lg border border-border p-2 text-text-muted hover:bg-surface-2 transition-colors"
            title={t("common.back")}
          >
            <ArrowLeft size={15} />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight">{t("sessionGraph.title")}</h1>
            <p className="text-[12px] text-text-muted mt-0.5 font-mono truncate">
              {owner}/{name}
              {" · "}
              <Link to={`/entries/${owner}/${name}`} className="text-accent hover:underline">
                {t("sessionGraph.viewRawEntry")}
              </Link>
            </p>
          </div>
        </div>
        <motion.button
          whileHover={{ rotate: 180 }}
          transition={{ duration: 0.3 }}
          onClick={load}
          className="rounded-lg border border-border p-2 text-text-muted hover:bg-surface-2 transition-colors"
          title={t("common.refresh")}
        >
          <RefreshCw size={15} />
        </motion.button>
      </div>

      {/* Stats */}
      {graph && <StatsStrip stats={graph.stats} t={t} />}

      {/* Body */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        <div className="rounded-xl border border-border bg-surface-1 overflow-hidden h-[calc(100vh-260px)] min-h-[480px]">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
            </div>
          ) : error ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <AlertCircle size={28} className="text-danger mb-2" />
              <p className="text-[13px] font-medium text-danger">{error}</p>
            </div>
          ) : (
            <ReactFlowProvider>
              <GraphSurface graph={graph} selectedId={selectedId} setSelectedId={setSelectedId} />
            </ReactFlowProvider>
          )}
        </div>

        <aside className="rounded-xl border border-border bg-surface-1 overflow-hidden h-[calc(100vh-260px)] min-h-[480px]">
          <DetailPanel node={selectedNode} onClose={() => setSelectedId(null)} t={t} />
        </aside>
      </div>
    </motion.div>
  );
}
