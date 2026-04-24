import { useMemo, useState } from "react";
import { useTranslation } from "../i18n";
import { extractTypeGraph, type SchemaAST } from "./bizSchemaAst";

// Type-relationship overhead view. Self-drawn SVG with a simple
// deterministic radial layout — good enough for schemas with < 20
// types (the realistic ceiling for a business permission model).
// Layout:
//   - Nodes on a circle, evenly spaced; "user" pinned to the left if
//     present (subject types conventionally anchor the graph).
//   - Edges: solid line = direct (this-subject), dashed = inherit
//     (tuple_to_userset).
// Interaction:
//   - Click a node → selectedType; sidebar lists its relations.
//   - Click a relation → highlights edges originating from that
//     relation on the selected type.

interface Props {
  ast: SchemaAST;
}

const RADIUS = 140;
const CX = 200;
const CY = 180;
const NODE_W = 100;
const NODE_H = 36;

export default function BizSchemaTypeGraph({ ast }: Props) {
  const { t } = useTranslation();
  const graph = useMemo(() => extractTypeGraph(ast), [ast]);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedRelation, setSelectedRelation] = useState<string | null>(null);

  const positions = useMemo(() => {
    const pos = new Map<string, { x: number; y: number }>();
    const nodeNames = graph.nodes.map((n) => n.name);
    const hasUser = nodeNames.includes("user");
    if (hasUser) pos.set("user", { x: CX - RADIUS, y: CY });
    const others = hasUser ? nodeNames.filter((n) => n !== "user") : nodeNames;
    const total = others.length + (hasUser ? 1 : 0);
    if (total === 0) return pos;
    // Spread non-user nodes around the remaining arc.
    others.forEach((name, i) => {
      // Start from -π/2 (top) and walk clockwise; if user is present,
      // skip the left slot (π) by adding the right offset.
      const step = (2 * Math.PI) / total;
      const angle = -Math.PI / 2 + step * (i + (hasUser ? 1 : 0));
      pos.set(name, {
        x: CX + Math.cos(angle) * RADIUS,
        y: CY + Math.sin(angle) * RADIUS,
      });
    });
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
          {/* Edges */}
          {graph.edges.map((e, i) => {
            const from = positions.get(e.from);
            const to = positions.get(e.to);
            if (!from || !to) return null;
            const isHighlighted =
              selectedRelation !== null &&
              e.relation === selectedRelation &&
              e.from === selectedType;
            return (
              <line
                key={i}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                strokeWidth={isHighlighted ? 2.5 : 1}
                stroke={
                  isHighlighted
                    ? "var(--color-accent, #0891b2)"
                    : "var(--color-border, #d4d4d8)"
                }
                strokeDasharray={e.kind === "inherit" ? "4 3" : undefined}
                opacity={selectedRelation && !isHighlighted ? 0.35 : 1}
              />
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
                  fill={sel ? "var(--color-accent, #0891b2)" : "var(--color-surface-2, #f4f4f5)"}
                  stroke="var(--color-border, #d4d4d8)"
                />
                <text
                  x={NODE_W / 2}
                  y={NODE_H / 2 - 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="font-mono"
                  fontSize={12}
                  fill={sel ? "#fff" : "var(--color-text-primary, #18181b)"}
                >
                  {n.name}
                </text>
                <text
                  x={NODE_W / 2}
                  y={NODE_H / 2 + 10}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={10}
                  fill={sel ? "rgba(255,255,255,0.8)" : "var(--color-text-muted, #71717a)"}
                >
                  {n.relationCount} {n.relationCount === 1 ? "relation" : "relations"}
                </text>
              </g>
            );
          })}
        </svg>
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
