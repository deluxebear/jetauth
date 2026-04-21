import type { ReactNode } from "react";

type Props = {
  icon: ReactNode;
  label: string;
  value: number | string;
  hint?: string;
  tone?: "default" | "muted" | "accent";
  onClick?: () => void;
};

export default function StatCard({
  icon,
  label,
  value,
  hint,
  tone = "default",
  onClick,
}: Props) {
  const toneClass =
    tone === "accent"
      ? "bg-accent/5 border-accent/20"
      : tone === "muted"
        ? "bg-surface-1 border-border-subtle opacity-70"
        : "bg-surface-1 border-border";
  const interactive = onClick
    ? "cursor-pointer hover:border-accent/40 hover:bg-accent/5 transition-colors"
    : "";

  const Root: React.ElementType = onClick ? "button" : "div";

  return (
    <Root
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`flex flex-col gap-2 rounded-xl border p-4 text-left ${toneClass} ${interactive}`}
    >
      <div className="flex items-center gap-2 text-[12px] font-medium text-text-muted">
        <span className="shrink-0">{icon}</span>
        <span>{label}</span>
      </div>
      <div className="text-2xl font-bold tabular-nums tracking-tight text-text-primary">
        {value}
      </div>
      {hint && <div className="text-[11px] text-text-muted">{hint}</div>}
    </Root>
  );
}
