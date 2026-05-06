import type { BizReBACTypeDistribution } from "../backend/BizBackend";
import { useTranslation } from "../i18n";

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return String(n);
}

interface Props {
  rows: BizReBACTypeDistribution[];
}

export default function BizTypeDistributionCard({ rows }: Props) {
  const { t } = useTranslation();
  const max = rows.reduce((m, r) => (r.count > m ? r.count : m), 1);
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-4">
      <h3 className="text-[13px] font-semibold text-text-primary mb-3">
        {t("rebac.overview.typeDistribution" as any)}
      </h3>
      {rows.length === 0 ? (
        <p className="text-[12px] text-text-muted py-6 text-center">
          {t("rebac.overview.noTypeData" as any)}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.type} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[12px]">
                <span className="font-mono text-text-secondary">{r.type}</span>
                <span className="font-mono text-text-muted tabular-nums">
                  {formatCount(r.count)}
                </span>
              </div>
              <div
                className="h-1.5 rounded-full bg-surface-2 overflow-hidden"
                role="progressbar"
                aria-valuenow={r.count}
                aria-valuemin={0}
                aria-valuemax={max}
                aria-label={`${r.type}: ${formatCount(r.count)}`}
              >
                <div
                  className="h-full bg-accent transition-[width]"
                  style={{ width: `${(r.count / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
