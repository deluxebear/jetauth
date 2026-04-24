import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import { useTranslation } from "../i18n";
import { extractTypeGraph, type SchemaAST } from "./bizSchemaAst";

// Type-relationship overhead view. Self-drawn SVG with a deterministic
// radial layout plus pan + zoom for scale.
//
// Layout:
//   - If "user" is present (the conventional subject type) it is
//     pinned to the left anchor (angle π). The remaining types are
//     distributed across a *half-circle on the right* so no slot can
//     ever collide with user's angle, no matter how many types exist.
//   - Without "user", all types spread around the full circle.
//   - RADIUS scales with node count so 15+ types don't pile on the
//     same arc.
//
// Viewport:
//   - SVG viewBox is React state. Wheel events zoom toward cursor.
//     Background drag pans. Initial mount fits-to-content.
//   - Click-select on nodes still works; drag only initiates on the
//     empty canvas (checks for data-node-group on the event target).
//   - Floating controls top-right: zoom-in, zoom-out, reset.
//
// Edges: solid = direct (this-subject), dashed = inherit (tuple_to_
// userset). Arrowheads point at the *target* type. Hover an edge to
// see which relation produced it via the native SVG <title> tooltip.
//
// Legend and the pan/zoom hint are rendered as plain HTML below the
// SVG so they never compete with nodes for canvas space.

interface Props {
  ast: SchemaAST;
}

const CX = 200;
const CY = 180;
const NODE_W = 100;
const NODE_H = 36;
// Pull edges back from node centers so the arrowhead lands just
// outside the rect. Half the node width + a 4px gap.
const EDGE_GAP = NODE_W / 2 + 4;
// Baseline radius (≤5 nodes) and per-node growth factor. At n=10
// radius ≈ 240; at n=20 radius ≈ 480. Keeps arc length per node
// roughly constant so nodes don't overlap on the circle.
const MIN_RADIUS = 140;
const RADIUS_PER_NODE = 24;

interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Fallback viewBox used before fit-to-content runs (e.g. during
// the very first render when refs aren't attached yet).
const DEFAULT_VIEWBOX: ViewBox = { x: 0, y: 0, w: 400, h: 360 };

export default function BizSchemaTypeGraph({ ast }: Props) {
  const { t } = useTranslation();
  const graph = useMemo(() => extractTypeGraph(ast), [ast]);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedRelation, setSelectedRelation] = useState<string | null>(null);

  const radius = useMemo(
    () => Math.max(MIN_RADIUS, RADIUS_PER_NODE * graph.nodes.length),
    [graph.nodes.length],
  );

  const positions = useMemo(() => {
    const pos = new Map<string, { x: number; y: number }>();
    const nodeNames = graph.nodes.map((n) => n.name);
    const hasUser = nodeNames.includes("user");
    const others = hasUser ? nodeNames.filter((n) => n !== "user") : nodeNames;

    if (hasUser) {
      pos.set("user", { x: CX - radius, y: CY });
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
            x: CX + Math.cos(angle) * radius,
            y: CY + Math.sin(angle) * radius,
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
            x: CX + Math.cos(angle) * radius,
            y: CY + Math.sin(angle) * radius,
          });
        });
      }
    }
    return pos;
  }, [graph, radius]);

  // Tight bounding box around all nodes, padded by a small margin.
  // Used by fit-to-content and the initial viewBox.
  const contentBox = useMemo<ViewBox>(() => {
    const coords = Array.from(positions.values());
    if (coords.length === 0) return DEFAULT_VIEWBOX;
    const xs = coords.map((p) => p.x);
    const ys = coords.map((p) => p.y);
    const margin = 40;
    const minX = Math.min(...xs) - NODE_W / 2 - margin;
    const maxX = Math.max(...xs) + NODE_W / 2 + margin;
    const minY = Math.min(...ys) - NODE_H / 2 - margin;
    const maxY = Math.max(...ys) + NODE_H / 2 + margin;
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }, [positions]);

  // Viewport state. `null` means "no user override yet — just track
  // contentBox", which auto-refits the view when the schema loads or
  // types change. As soon as the user zooms/pans, `userViewBox`
  // becomes the actual state and we stop following contentBox.
  // resetView() returns to `null` to re-sync with contentBox again.
  const [userViewBox, setUserViewBox] = useState<ViewBox | null>(null);
  const viewBox: ViewBox = userViewBox ?? contentBox;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    vx: number;
    vy: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Wheel zoom. Attached via native addEventListener so `passive: false`
  // is actually respected — React's synthetic wheel is passive by
  // default on Chrome, which breaks preventDefault.
  // Depends on `contentBox` so the fallback (when userViewBox is null
  // and the user's first interaction is a scroll) starts from the
  // currently-visible box.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;
      setUserViewBox((prev) => {
        const v = prev ?? contentBox;
        // Point in SVG coords the cursor is currently over.
        const svgX = v.x + (cursorX / rect.width) * v.w;
        const svgY = v.y + (cursorY / rect.height) * v.h;
        // deltaY < 0 = scroll up = zoom in.
        const factor = e.deltaY < 0 ? 0.85 : 1 / 0.85;
        const newW = clamp(v.w * factor, 60, 6000);
        const newH = newW * (v.h / v.w);
        // Re-anchor so the cursor stays on the same SVG point.
        return {
          x: svgX - (cursorX / rect.width) * newW,
          y: svgY - (cursorY / rect.height) * newH,
          w: newW,
          h: newH,
        };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [contentBox]);

  // Drag-to-pan, only when the mousedown starts on background (not a
  // node), so click-to-select still works.
  const handleMouseDown = (e: ReactMouseEvent<SVGSVGElement>) => {
    const target = e.target as Element;
    if (target.closest("[data-node-group]")) return;
    dragStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      vx: viewBox.x,
      vy: viewBox.y,
    };
    setIsDragging(true);
    e.preventDefault();
  };

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      const ds = dragStateRef.current;
      const svg = svgRef.current;
      if (!ds || !svg) return;
      const rect = svg.getBoundingClientRect();
      const dx = ((e.clientX - ds.startX) / rect.width) * viewBox.w;
      const dy = ((e.clientY - ds.startY) / rect.height) * viewBox.h;
      setUserViewBox((prev) => {
        const v = prev ?? contentBox;
        return { ...v, x: ds.vx - dx, y: ds.vy - dy };
      });
    };
    const onUp = () => {
      setIsDragging(false);
      dragStateRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging, viewBox.w, viewBox.h, contentBox]);

  const zoomBy = useCallback(
    (factor: number) => {
      setUserViewBox((prev) => {
        const v = prev ?? contentBox;
        // Anchor at center so +/- buttons zoom to the middle of the view.
        const cx = v.x + v.w / 2;
        const cy = v.y + v.h / 2;
        const newW = clamp(v.w * factor, 60, 6000);
        const newH = newW * (v.h / v.w);
        return { x: cx - newW / 2, y: cy - newH / 2, w: newW, h: newH };
      });
    },
    [contentBox],
  );

  // Passing `null` re-syncs with contentBox so the view re-fits if
  // the schema changed since the user last interacted.
  const resetView = useCallback(() => setUserViewBox(null), []);

  if (graph.nodes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface-1 p-10 text-center text-[13px] text-text-muted">
        {t("rebac.schema.graph.noTypes")}
      </div>
    );
  }

  const selectedTd = ast.types.find((td) => td.name === selectedType);
  const viewBoxStr = `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`;

  return (
    <div className="grid grid-cols-[1fr_220px] gap-3">
      <div className="rounded-lg border border-border bg-surface-1 p-2">
        <div className="relative">
          <svg
            ref={svgRef}
            viewBox={viewBoxStr}
            role="img"
            aria-label={t("rebac.schema.graph.title")}
            className="w-full h-[360px] select-none"
            style={{ cursor: isDragging ? "grabbing" : "grab" }}
            onMouseDown={handleMouseDown}
          >
            <defs>
              {/* Two arrow markers: one uses the neutral border color,
                  one uses the accent color for highlighted edges. */}
              <marker
                id="biz-graph-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 Z" fill="var(--color-border)" />
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
                <path d="M0,0 L10,5 L0,10 Z" fill="var(--color-accent)" />
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
                  {/* Wide transparent stroke for hover hit-testing so
                      the <title> fires within ~8px of the thin line. */}
                  <line
                    x1={startX}
                    y1={startY}
                    x2={endX}
                    y2={endY}
                    strokeWidth={12}
                    stroke="transparent"
                    style={{ cursor: "help" }}
                  />
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
                  data-node-group
                  transform={`translate(${p.x - NODE_W / 2}, ${p.y - NODE_H / 2})`}
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    setSelectedType(n.name);
                    setSelectedRelation(null);
                  }}
                >
                  <rect
                    width={NODE_W}
                    height={NODE_H}
                    rx={6}
                    fill={
                      sel ? "var(--color-accent)" : "var(--color-surface-2)"
                    }
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
                    pointerEvents="none"
                  >
                    {n.name}
                  </text>
                  <text
                    x={NODE_W / 2}
                    y={NODE_H / 2 + 10}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={10}
                    fill={
                      sel
                        ? "rgba(255,255,255,0.8)"
                        : "var(--color-text-muted)"
                    }
                    pointerEvents="none"
                  >
                    {n.relationCount}{" "}
                    {n.relationCount === 1 ? "relation" : "relations"}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Floating zoom controls (top-right inside the graph card) */}
          <div className="absolute top-2 right-2 flex flex-col gap-1">
            <button
              type="button"
              aria-label={t("rebac.schema.graph.zoomIn")}
              title={t("rebac.schema.graph.zoomIn")}
              className="w-7 h-7 inline-flex items-center justify-center rounded border border-border bg-surface-1 text-text-muted hover:text-text-primary hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              onClick={() => zoomBy(0.8)}
            >
              <Plus className="w-3.5 h-3.5" aria-hidden />
            </button>
            <button
              type="button"
              aria-label={t("rebac.schema.graph.zoomOut")}
              title={t("rebac.schema.graph.zoomOut")}
              className="w-7 h-7 inline-flex items-center justify-center rounded border border-border bg-surface-1 text-text-muted hover:text-text-primary hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              onClick={() => zoomBy(1.25)}
            >
              <Minus className="w-3.5 h-3.5" aria-hidden />
            </button>
            <button
              type="button"
              aria-label={t("rebac.schema.graph.resetView")}
              title={t("rebac.schema.graph.resetView")}
              className="w-7 h-7 inline-flex items-center justify-center rounded border border-border bg-surface-1 text-text-muted hover:text-text-primary hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              onClick={resetView}
            >
              <Maximize2 className="w-3.5 h-3.5" aria-hidden />
            </button>
          </div>
        </div>

        {/* Legend + pan/zoom hint. Rendered outside the SVG so they
            never collide with nodes on the canvas. */}
        <div className="flex items-center gap-4 px-2 pt-1 text-[10px] text-text-muted flex-wrap">
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
          <span className="ml-auto text-text-muted/80">
            {t("rebac.schema.graph.panZoomHint")}
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

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
