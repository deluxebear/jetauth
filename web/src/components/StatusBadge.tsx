interface StatusBadgeProps {
  status: "active" | "inactive" | "pending" | "error" | "warning" | string;
  label?: string;
}

const colorMap: Record<string, string> = {
  active: "bg-success/15 text-success border-success/20",
  inactive: "bg-surface-3 text-text-muted border-border",
  pending: "bg-warning/15 text-warning border-warning/20",
  error: "bg-danger/15 text-danger border-danger/20",
  warning: "bg-warning/15 text-warning border-warning/20",
};

export default function StatusBadge({ status, label }: StatusBadgeProps) {
  const cls = colorMap[status] ?? colorMap.inactive;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${cls}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label ?? status}
    </span>
  );
}
