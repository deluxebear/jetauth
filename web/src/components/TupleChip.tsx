// TupleChip renders a single (type:value) tuple component as a colored
// pill. Used by the admin Overview, Tuples table, and Check tester to
// keep tuple visuals consistent across the ReBAC admin surface.
//
// `kind` is the role the chip plays in a tuple, not the data type —
// "user" colors the subject, "object" colors the object, "relation"
// shows the relation name without a type prefix. Per-type tints are
// derived from the type prefix in `value`.

const KIND_COLORS: Record<string, string> = {
  user: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  group: "bg-purple-500/10 text-purple-700 dark:text-purple-300",
  folder: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  document: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  organization: "bg-pink-500/10 text-pink-700 dark:text-pink-300",
  relation: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

const FALLBACK = "bg-surface-2 text-text-secondary";

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
      <span className={`px-2 py-0.5 rounded font-mono text-[12px] ${FALLBACK} ${className ?? ""}`}>
        {value}
      </span>
    );
  }
  const type = value.slice(0, colonIdx);
  const name = value.slice(colonIdx + 1);
  const color = KIND_COLORS[type] ?? FALLBACK;
  return (
    <span className={`px-2 py-0.5 rounded font-mono text-[12px] ${color} ${className ?? ""}`}>
      <span className="opacity-60">{type}:</span>{name}
    </span>
  );
}
