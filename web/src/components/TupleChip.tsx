// TupleChip renders a single (type:value) tuple component as a colored
// pill. Used by the admin Overview, Tuples table, and Check tester to
// keep tuple visuals consistent across the ReBAC admin surface.
//
// `kind` is the role the chip plays in a tuple, not the data type —
// "user" colors the subject, "object" colors the object, "relation"
// shows the relation name without a type prefix. Per-type tints are
// derived from the type prefix in `value`.

import { KIND_COLORS, FALLBACK_TUPLE_COLOR } from "../styles/tupleColors";

interface Props {
  kind: "user" | "object" | "relation";
  value: string;
  className?: string;
}

export default function TupleChip({ kind, value, className }: Props) {
  if (kind === "relation") {
    return (
      <span className={`px-2 py-0.5 rounded font-mono text-[12px] ${KIND_COLORS.relation} ${className ?? ""}`}>
        {value}
      </span>
    );
  }
  const colonIdx = value.indexOf(":");
  if (colonIdx < 0) {
    return (
      <span className={`px-2 py-0.5 rounded font-mono text-[12px] ${FALLBACK_TUPLE_COLOR} ${className ?? ""}`}>
        {value}
      </span>
    );
  }
  const type = value.slice(0, colonIdx);
  const name = value.slice(colonIdx + 1);
  const color = KIND_COLORS[type] ?? FALLBACK_TUPLE_COLOR;
  return (
    <span className={`px-2 py-0.5 rounded font-mono text-[12px] ${color} ${className ?? ""}`}>
      <span className="opacity-60">{type}:</span>{name}
    </span>
  );
}
