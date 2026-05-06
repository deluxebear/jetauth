import type { BizReBACRecentWrite } from "../backend/BizBackend";
import { useTranslation } from "../i18n";
import TupleChip from "./TupleChip";

interface Props {
  writes: BizReBACRecentWrite[];
  /** Optional "view all" callback — renders the link only when supplied. */
  onViewAll?: () => void;
}

function formatTime(at: string): string {
  // RFC3339 strings parse cleanly with the Date constructor; fall back
  // to the raw string if it doesn't (server-side malformed value).
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function BizRecentWritesCard({ writes, onViewAll }: Props) {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-semibold text-text-primary">
          {t("rebac.overview.recentWrites" as any)}
        </h3>
        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="text-[12px] text-accent hover:underline"
          >
            {t("rebac.overview.viewAll" as any)} →
          </button>
        )}
      </div>
      {writes.length === 0 ? (
        <p className="text-[12px] text-text-muted py-6 text-center">
          {t("rebac.overview.noRecentWrites" as any)}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {writes.map((w, i) => (
            <li
              key={`${w.at}-${w.object}-${w.relation}-${w.user}-${i}`}
              className="flex items-center gap-3 text-[12px] flex-wrap"
            >
              <span className="font-mono text-text-muted w-16 shrink-0">
                {formatTime(w.at)}
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-medium shrink-0 ${
                  w.op === "write"
                    ? "bg-success/15 text-success"
                    : "bg-danger/15 text-danger"
                }`}
              >
                {w.op}
              </span>
              <TupleChip kind="user" value={w.user} />
              <TupleChip kind="relation" value={w.relation} />
              <TupleChip kind="object" value={w.object} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
