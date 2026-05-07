import { useMemo } from "react";
import type { BizExpandNode } from "../backend/BizBackend";
import { useTranslation } from "../i18n";
// Re-exported for parity with TupleChip — the graph nodes don't
// currently per-type-color (SVG uses fill-* not bg-*), but the import
// keeps both visualizations pulling from the same palette source.
import { KIND_COLORS } from "../styles/tupleColors";

interface Props {
  /** Root of the BizExpand response. May be undefined (e.g. before a Check runs). */
  root?: BizExpandNode;
  /** The user being checked — rendered as the leftmost node. */
  highlightUser?: string;
  /** When known, the 1-indexed rule that resolved this Check.
   *  iter-1 just passes 1 when allowed and omits when denied — full
   *  rule-index inference is out of scope. */
  matchedRule?: number;
  /** Optional className for the outer container. */
  className?: string;
}

interface Layered {
  nodes: Array<{ id: string; label: string; layer: number; row: number }>;
  edges: Array<{ from: string; to: string; label?: string; dashed?: boolean }>;
}

const NODE_WIDTH = 130;
const NODE_HEIGHT = 30;
const LAYER_GAP_X = 160;
const ROW_GAP_Y = 60;
const PADDING = 16;

function nodeLabel(n: BizExpandNode): string {
  if (n.users && n.users.length > 0) return n.users[0];
  if (n.computed?.object) return n.computed.object;
  return n.kind;
}

function layout(root: BizExpandNode | undefined, highlightUser?: string): Layered {
  const nodes: Layered["nodes"] = [];
  const edges: Layered["edges"] = [];
  if (!root) return { nodes, edges };

  const seen = new Map<string, { layer: number; row: number }>();
  const layerCounters = new Map<number, number>();

  // Optional leading "user" node; layer 0.
  if (highlightUser) {
    const id = highlightUser;
    const row = layerCounters.get(0) ?? 0;
    layerCounters.set(0, row + 1);
    nodes.push({ id, label: highlightUser, layer: 0, row });
    seen.set(id, { layer: 0, row });
  }

  function visit(node: BizExpandNode, layer: number, parentId: string | null): string {
    const id = nodeLabel(node);
    if (!seen.has(id)) {
      const row = layerCounters.get(layer) ?? 0;
      layerCounters.set(layer, row + 1);
      nodes.push({ id, label: id, layer, row });
      seen.set(id, { layer, row });
    }
    if (parentId !== null) {
      // Edge from parent → this node, labelled with the relation if known.
      let label: string | undefined;
      if (node.computed?.relation) label = node.computed.relation;
      else if (node.kind && node.kind !== "this") label = node.kind;
      edges.push({ from: parentId, to: id, label });
    }
    if (node.children) {
      for (const c of node.children) visit(c, layer + 1, id);
    }
    if (node.base) visit(node.base, layer + 1, id);
    if (node.subtract) visit(node.subtract, layer + 1, id);
    return id;
  }

  // The root node sits at layer 1 if we have a highlightUser, else 0.
  const startLayer = highlightUser ? 1 : 0;
  const rootId = visit(root, startLayer, null);

  // Connect highlightUser → root with the implicit "lookup" edge.
  if (highlightUser && rootId !== highlightUser) {
    edges.push({ from: highlightUser, to: rootId, dashed: true });
  }

  return { nodes, edges };
}

function nodeBox(layer: number, row: number) {
  return {
    x: PADDING + layer * LAYER_GAP_X,
    y: PADDING + row * ROW_GAP_Y,
    w: NODE_WIDTH,
    h: NODE_HEIGHT,
  };
}

export default function BizDecisionPathGraph({ root, highlightUser, matchedRule, className }: Props) {
  const { t } = useTranslation();
  const { nodes, edges } = useMemo(() => layout(root, highlightUser), [root, highlightUser]);

  if (nodes.length === 0) {
    return (
      <div className={`rounded-xl border border-border bg-surface-1 p-4 ${className ?? ""}`}>
        <p className="text-[12px] text-text-muted text-center py-8">No decision path yet</p>
      </div>
    );
  }

  // Compute SVG dimensions from node positions.
  const maxLayer = nodes.reduce((m, n) => Math.max(m, n.layer), 0);
  const maxRow = nodes.reduce((m, n) => Math.max(m, n.row), 0);
  const width = PADDING * 2 + (maxLayer + 1) * LAYER_GAP_X;
  const height = PADDING * 2 + (maxRow + 1) * ROW_GAP_Y;

  // Quick lookup: id → box.
  const boxByNode = new Map(nodes.map((n) => [n.id, nodeBox(n.layer, n.row)]));

  return (
    <div className={`rounded-xl border border-border bg-surface-1 p-4 overflow-auto ${className ?? ""}`}>
      {nodes.length > 0 && (
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[13px] font-semibold text-text-primary">
            {t("rebac.tester.decisionPath")}
          </h3>
          <span className="text-[12px] text-text-muted">
            {(t("rebac.tester.hops") as string).replace("{n}", String(maxLayer))}
            {matchedRule !== undefined && (
              <>
                {" · "}
                {(t("rebac.tester.ruleMatched") as string).replace("{rule}", String(matchedRule))}
              </>
            )}
          </span>
        </div>
      )}
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="text-text-secondary"
        role="img"
        aria-label="ReBAC decision path"
      >
        {edges.map((e, i) => {
          const from = boxByNode.get(e.from);
          const to = boxByNode.get(e.to);
          if (!from || !to) return null;
          const x1 = from.x + from.w;
          const y1 = from.y + from.h / 2;
          const x2 = to.x;
          const y2 = to.y + to.h / 2;
          // Cubic bezier with horizontal control points so edges curve nicely.
          const cx1 = x1 + LAYER_GAP_X / 3;
          const cx2 = x2 - LAYER_GAP_X / 3;
          const path = `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`;
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2 - 4;
          return (
            <g key={`${e.from}->${e.to}-${i}`}>
              <path
                d={path}
                fill="none"
                stroke="currentColor"
                strokeWidth={1}
                strokeDasharray={e.dashed ? "4 4" : undefined}
                opacity={e.dashed ? 0.5 : 0.8}
              />
              {e.label && (
                <text
                  x={midX}
                  y={midY}
                  textAnchor="middle"
                  className="fill-current text-[10px]"
                  style={{ fontFamily: "monospace" }}
                >
                  {e.label}
                </text>
              )}
            </g>
          );
        })}
        {nodes.map((n) => {
          const b = nodeBox(n.layer, n.row);
          return (
            <g key={n.id}>
              <rect
                x={b.x}
                y={b.y}
                width={b.w}
                height={b.h}
                rx={6}
                ry={6}
                className="fill-surface-2 stroke-border"
                strokeWidth={1}
              />
              <text
                x={b.x + b.w / 2}
                y={b.y + b.h / 2 + 4}
                textAnchor="middle"
                className="fill-current text-[11px]"
                style={{ fontFamily: "monospace" }}
              >
                {n.label.length > 18 ? n.label.slice(0, 16) + "…" : n.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
