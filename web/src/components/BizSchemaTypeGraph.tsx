import { useMemo, useState } from "react";
import { useTranslation } from "../i18n";
import { extractTypeGraph, type SchemaAST } from "./bizSchemaAst";

// Type-relationship overhead view. Self-drawn SVG with a simple
// deterministic radial layout — good enough for schemas with < 20
// types (the realistic ceiling for a business permission model).
// Layout:
//   - If "user" is present (the conventional subject type) it is
//     pinned to the left anchor (angle π). The remaining types are
//     distributed across a *half-circle on the right* so no slot can
//     ever collide with user's angle, no matter how many types exist.
//   - Without "user", all types spread around the full circle.
//   - Edges: solid line = direct (this-subject), dashed = inherit
//     (tuple_to_userset). Arrowheads point at the *target* type to
//     make direction readable.
// Interaction:
//   - Click a node → selectedType; sidebar lists its relations.
//   - Click a relation → highlights edges originating from that
//     relation on the selected type.
//   - Hover an edge → native tooltip shows "{from}.{rel} → {to}  ·
//     {kind}" so the admin can see the origin without clicking.
// Legend is rendered as plain HTML *below* the SVG so it never
// competes with nodes for canvas space.

interface Props {
  ast: SchemaAST;
}

const RADIUS = 140;
const CX = 200;
const CY = 180;
const NODE_W = 100;
const NODE_H = 36;
// Distance to pull an edge back from each node's center so the
// arrowhead sits just outside the rect rather than being hidden behind
// it. Half the node width + a 4px gap.
const EDGE_GAP = NODE_W / 2 + 4;

export default function BizSchemaTypeGraph({ ast }: Props) {
  const { t } = useTranslation();
  const graph = useMemo(() => extractTypeGraph(ast), [ast]);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedRelation, setSelectedRelation] = useState<string | null>(null);

  const positions = useMemo(() => {
    const pos = new Map<string, { x: number; y: number }>();
    const nodeNames = graph.nodes.map((n) => n.name);
    const hasUser = nodeNames.includes("user");
    const others = hasUser ? nodeNames.filter((n) => n !== "user") : nodeNames;

    if (hasUser) {
      pos.set("user", { x: CX - RADIUS, y: CY });
      // Distribute others across the right half-circle (from -π/2 top,
      // sweeping through 0 right, to +π/2 bottom). A half-circle sweep
      // guarantees no slot can land on angle π where user sits. We use
      // a half-step offset so nodes avoid the exact top/bottom poles
      // (looks more balanced).
      const n = others.length;
      if (n > 0) {
        const step = Math.PI / n;
        others.forEach((name, i) => {
          const angle = -Math.PI / 2 + step * (i + 0.5);
          pos.set(name, {
            x: CX + Math.cos(angle) * RADIUS,
            y: CY + Math.sin(angle) * RADIUS,
          });
        });
      }
    } else {
      // No user anchor — spread all types around the full circle.
      const n = nodeNames.length;
      if (n > 0) {
        const step = (2 * Math.PI) / n;
        nodeNames.forEach((name, i) => {
          const angle = -Math.PI / 2 + step * i;
          pos.set(name, {
            x: CX + Math.cos(angle) * RADIUS,
            y: CY + Math.sin(angle) * RADIUS,
          });
        });
      }
    }
    return pos;
  }, [graph]);

  if (graph.nodes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface-1 p-10 text-center text-[13px] text-text-muted">
        {t("rebac.schema.graph.noTypes")}
      </div>
    );
  }

  const selectedTd = ast.types.find((td) => td.name === selectedType);

  return (
    <div className="grid grid-cols-[1fr_220px] gap-3">
      <div className="rounded-lg border border-border bg-surface-1 p-2">
        <svg
          viewBox="0 0 400 360"
          role="img"
          aria-label={t("rebac.schema.graph.title")}
          className="w-full h-[360px]"
        >
          <defs>
            {/* Two arrow markers: one uses the neutral border color,
                one uses the accent color for highlighted edges. Both
                share geometry — just differ in fill. */}
            <marker
              id="biz-graph-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path
                d="M0,0 L10,5 L0,10 Z"
                fill="var(--color-border)"
              />
            </marker>
            <marker
              id="biz-graph-arrow-accent"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path
                d="M0,0 L10,5 L0,10 Z"
                fill="var(--color-accent)"
              />
            </marker>
          </defs>

          {/* Edges */}
          {graph.edges.map((e, i) => {
            const from = positions.get(e.from);
            const to = positions.get(e.to);
            if (!from || !to) return null;
            const isHighlighted =
              selectedRelation !== null &&
              e.relation === selectedRelation &&
              e.from === selectedType;
            const isDimmed = selectedRelation !== null && !isHighlighted;

            // Pull the endpoints back so the arrow sits just outside
            // the target node's rect (otherwise it's hidden behind).
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const len = Math.hypot(dx, dy);
            const nx = dx / len;
            const ny = dy / len;
            const startX = from.x + nx * EDGE_GAP;
            const startY = from.y + ny * EDGE_GAP;
            const endX = to.x - nx * EDGE_GAP;
            const endY = to.y - ny * EDGE_GAP;

            const kindLabel = t(
              e.kind === "direct"
                ? "rebac.schema.graph.edgeDirect"
                : "rebac.schema.graph.edgeInherit",
            );
            const tooltip = `${e.from} . ${e.relation} → ${e.to}  ·  ${kindLabel}`;

            return (
              <g key={i} opacity={isDimmed ? 0.25 : 1}>
                {/* Wide invisible stroke for hover/tooltip hit-testing —
                    the visible line is thin but hovering within ~8px
                    still triggers the <title>. */}
                <line
                  x1={startX}
                  y1={startY}
                  x2={endX}
                  y2={endY}
                  strokeWidth={12}
                  stroke="transparent"
                  style={{ cursor: "help" }}
                />
                {/* Visible line. */}
                <line
                  x1={startX}
                  y1={startY}
                  x2={endX}
                  y2={endY}
                  strokeWidth={isHighlighted ? 2 : 1}
                  stroke={
                    isHighlighted
                      ? "var(--color-accent)"
                      : "var(--color-border)"
                  }
                  strokeDasharray={e.kind === "inherit" ? "4 3" : undefined}
                  markerEnd={
                    isHighlighted
                      ? "url(#biz-graph-arrow-accent)"
                      : "url(#biz-graph-arrow)"
                  }
                  pointerEvents="none"
                />
                <title>{tooltip}</title>
              </g>
            );
          })}

          {/* Nodes */}
          {graph.nodes.map((n) => {
            const p = positions.get(n.name);
            if (!p) return null;
            const sel = n.name === selectedType;
            return (
              <g
                key={n.id}
                transform={`translate(${p.x - NODE_W / 2}, ${p.y - NODE_H / 2})`}
                className="cursor-pointer"
                onClick={() => {
                  setSelectedType(n.name);
                  setSelectedRelation(null);
                }}
              >
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={6}
                  fill={sel ? "var(--color-accent)" : "var(--color-surface-2)"}
                  stroke="var(--color-border)"
                />
                <text
                  x={NODE_W / 2}
                  y={NODE_H / 2 - 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="font-mono"
                  fontSize={12}
                  fill={sel ? "#fff" : "var(--color-text-primary)"}
                >
                  {n.name}
                </text>
                <text
                  x={NODE_W / 2}
                  y={NODE_H / 2 + 10}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={10}
                  fill={sel ? "rgba(255,255,255,0.8)" : "var(--color-text-muted)"}
                >
                  {n.relationCount} {n.relationCount === 1 ? "relation" : "relations"}
                </text>
              </g>
            );
          })}

        </svg>
        {/* Legend — rendered outside the SVG so it never collides
            with nodes on the canvas regardless of type count. */}
        <div className="flex items-center gap-4 px-2 pt-1 text-[10px] text-text-muted">
          <span className="inline-flex items-center gap-1.5">
            <svg width="22" height="8" viewBox="0 0 22 8" aria-hidden>
              <line
                x1={0}
                y1={4}
                x2={15}
                y2={4}
                stroke="currentColor"
                strokeWidth={1}
              />
              <path d="M15,1 L21,4 L15,7 Z" fill="currentColor" />
            </svg>
            {t("rebac.schema.graph.legendDirect")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg width="22" height="8" viewBox="0 0 22 8" aria-hidden>
              <line
                x1={0}
                y1={4}
                x2={15}
                y2={4}
                stroke="currentColor"
                strokeWidth={1}
                strokeDasharray="3 2"
              />
              <path d="M15,1 L21,4 L15,7 Z" fill="currentColor" />
            </svg>
            {t("rebac.schema.graph.legendInherit")}
          </span>
        </div>
      </div>

      <aside className="rounded-lg border border-border bg-surface-1 p-3">
        {selectedTd ? (
          <>
            <p className="text-[12px] font-semibold text-text-primary mb-2 font-mono">
              {selectedTd.name}
            </p>
            {selectedTd.relations.length === 0 ? (
              <p className="text-[11px] text-text-muted">
                {t("rebac.schema.graph.noRelations")}
              </p>
            ) : (
              <ul className="space-y-1">
                {selectedTd.relations.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      className={`w-full text-left px-2 py-1 rounded text-[12px] font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                        selectedRelation === r.name
                          ? "bg-accent/10 text-accent"
                          : "hover:bg-surface-2"
                      }`}
                      onClick={() =>
                        setSelectedRelation((cur) =>
                          cur === r.name ? null : r.name,
                        )
                      }
                    >
                      {r.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="text-[11px] text-text-muted">
            {t("rebac.schema.graph.pickType")}
          </p>
        )}
      </aside>
    </div>
  );
}
