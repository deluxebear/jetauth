// Search input + facet filter chips for BizTupleManager. Extracted to
// keep BizTupleManager focused on data-fetching and table rendering.
import { useTranslation } from "../i18n";

export type FacetKey = "user" | "relation" | "object" | "object_type";

const FACETS: FacetKey[] = ["user", "relation", "object", "object_type"];

interface Props {
  search: string;
  facet: FacetKey;
  onSearchChange: (v: string) => void;
  onFacetChange: (f: FacetKey) => void;
}

export default function BizTupleFacetChips({
  search,
  facet,
  onSearchChange,
  onFacetChange,
}: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
      <input
        className="flex-1 min-w-[260px] px-3 py-1.5 rounded-md border border-border bg-surface-2 text-[13px]"
        placeholder={t("rebac.tuples.searchPlaceholder" as never)}
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      <div className="flex items-center gap-1">
        {FACETS.map((k) => {
          const active = facet === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => onFacetChange(k)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-mono border transition-colors ${
                active
                  ? "bg-accent/15 text-accent border-accent/40"
                  : "bg-surface-2 text-text-muted border-border hover:bg-surface-3"
              }`}
            >
              {active ? "● " : ""}
              {k}
            </button>
          );
        })}
      </div>
    </div>
  );
}
