import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

export type EntityStat = {
  key: string;
  icon: ReactNode;
  label: string;
  value: number | string;
  onClick?: () => void;
};

type Props = {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  badges?: ReactNode;
  onBack?: () => void;
  stats?: EntityStat[];
  statusSlot?: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
};

export default function EntityHeader({
  icon,
  title,
  subtitle,
  badges,
  onBack,
  stats,
  statusSlot,
  actions,
  tabs,
}: Props) {
  return (
    <div className="sticky top-0 z-30 -mx-6 -mt-6 mb-6 px-6 bg-surface-0/80 backdrop-blur-md border-b border-border-subtle">
      <div className="flex items-start justify-between gap-4 py-3">
        <div className="flex items-start gap-3 min-w-0">
          {onBack && (
            <button
              onClick={onBack}
              className="mt-1 rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors"
              aria-label="Back"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <div className="shrink-0 flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
            {icon}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold tracking-tight truncate">{title}</h1>
              {badges}
            </div>
            {subtitle && (
              <p className="mt-0.5 text-[13px] text-text-muted font-mono truncate">
                {subtitle}
              </p>
            )}
            {stats && stats.length > 0 && (
              <div className="mt-2 flex items-center gap-1 flex-wrap">
                {stats.map((s) => {
                  const Pill: React.ElementType = s.onClick ? "button" : "div";
                  return (
                    <Pill
                      key={s.key}
                      type={s.onClick ? "button" : undefined}
                      onClick={s.onClick}
                      className={`flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-1 px-2.5 py-1 text-[12px] text-text-secondary tabular-nums ${
                        s.onClick
                          ? "hover:border-accent/40 hover:text-accent cursor-pointer transition-colors"
                          : ""
                      }`}
                      aria-label={`${s.label}: ${s.value}`}
                    >
                      <span className="text-text-muted">{s.icon}</span>
                      <span className="font-medium">{s.value}</span>
                      <span className="text-text-muted">{s.label}</span>
                    </Pill>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {statusSlot}
          {actions}
        </div>
      </div>
      {tabs}
    </div>
  );
}
