import { useEffect, useMemo, useState } from "react";
import { Calendar, Filter, X } from "lucide-react";
import { useTranslation } from "../i18n";
import SingleSearchSelect from "./SingleSearchSelect";
import * as ProviderBackend from "../backend/ProviderBackend";
import * as ApplicationBackend from "../backend/ApplicationBackend";
import type { EntryAdvancedFilter } from "../backend/EntryBackend";

// Entry.type values that show up in practice (see openclaw_transcript_sync.go
// and log/agent_openclaw.go). Order is intentional: most useful for triage
// first.
const KNOWN_TYPES = ["trace", "metrics", "log", "session"] as const;

interface Option {
  value: string;
  label: string;
}

interface Props {
  owner: string;
  value: EntryAdvancedFilter;
  onChange: (next: EntryAdvancedFilter) => void;
}

/**
 * Multi-criteria filter bar for the Entry list. Emits an EntryAdvancedFilter
 * back to the parent — the parent owns the state. Empty fields are omitted
 * so the resulting query string stays compact and the backend's IsEmpty()
 * short-circuit kicks in for "everything off".
 */
export default function EntryFilterBar({ owner, value, onChange }: Props) {
  const { t } = useTranslation();
  const [providerOptions, setProviderOptions] = useState<Option[]>([]);
  const [appOptions, setAppOptions] = useState<Option[]>([]);

  // Load provider + application lists once the owner is known. We don't
  // refresh on tab focus or anything fancy; admins rarely add a provider
  // mid-investigation, and stale-by-a-minute is fine for a filter dropdown.
  useEffect(() => {
    if (!owner) return;
    let cancelled = false;
    ProviderBackend.getProviders({ owner, pageSize: -1 }).then((res) => {
      if (cancelled || res.status !== "ok" || !Array.isArray(res.data)) return;
      setProviderOptions(
        res.data.map((p) => ({
          value: p.name,
          label: `${p.displayName || p.name}${p.type ? ` · ${p.type}` : ""}`,
        })),
      );
    }).catch(() => {});
    ApplicationBackend.getApplicationsByOrganization({ owner: "admin", organization: owner }).then((res) => {
      if (cancelled || res.status !== "ok" || !res.data) return;
      setAppOptions(res.data.map((a) => ({
        value: a.name,
        label: (a as { displayName?: string }).displayName || a.name,
      })));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [owner]);

  const selectedTypes = useMemo<string[]>(
    () => (value.types ? value.types.split(",").filter(Boolean) : []),
    [value.types],
  );

  const toggleType = (type: string) => {
    const next = selectedTypes.includes(type)
      ? selectedTypes.filter((t) => t !== type)
      : [...selectedTypes, type];
    onChange({ ...value, types: next.length > 0 ? next.join(",") : undefined });
  };

  const setProvider = (v: string) => onChange({ ...value, provider: v || undefined });
  const setApplication = (v: string) => onChange({ ...value, application: v || undefined });
  // <input type="date"> emits "YYYY-MM-DD". We append the bound time-of-day
  // to make the SQL comparison meaningful: startTime defaults to the start
  // of the day, endTime to the end. Empty string clears the bound.
  const setStartTime = (v: string) =>
    onChange({ ...value, startTime: v ? `${v}T00:00:00` : undefined });
  const setEndTime = (v: string) =>
    onChange({ ...value, endTime: v ? `${v}T23:59:59` : undefined });

  const clear = () => onChange({});

  // Counter shown in the corner: how many filter dimensions are active.
  // (Not how many *values* — multi-typed filter still counts as 1.)
  const activeCount =
    (selectedTypes.length > 0 ? 1 : 0) +
    (value.provider ? 1 : 0) +
    (value.application ? 1 : 0) +
    (value.startTime ? 1 : 0) +
    (value.endTime ? 1 : 0);

  // Strip the time portion off whatever's in state so the date input shows
  // the raw YYYY-MM-DD it expects.
  const startDate = (value.startTime || "").slice(0, 10);
  const endDate = (value.endTime || "").slice(0, 10);

  return (
    <div className="rounded-lg border border-border bg-surface-1 p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[12px] font-medium text-text-secondary">
          <Filter size={13} className="text-text-muted" />
          {t("entries.filter.title")}
          {activeCount > 0 && (
            <span className="rounded-full bg-accent/15 text-accent px-1.5 py-0.5 text-[10px] font-semibold">
              {activeCount}
            </span>
          )}
        </div>
        {activeCount > 0 && (
          <button
            onClick={clear}
            className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
            title={t("entries.filter.clear")}
          >
            <X size={11} /> {t("entries.filter.clear")}
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] text-text-muted mr-1">{t("entries.filter.type")}:</span>
        {KNOWN_TYPES.map((type) => {
          const active = selectedTypes.includes(type);
          return (
            <button
              key={type}
              onClick={() => toggleType(type)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium border transition-colors ${
                active
                  ? "bg-accent/10 text-accent border-accent/30"
                  : "bg-surface-2 text-text-muted border-border hover:bg-surface-3"
              }`}
            >
              {type}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <div>
          <label className="block text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1">
            {t("entries.filter.provider")}
          </label>
          <SingleSearchSelect
            value={value.provider ?? ""}
            options={providerOptions}
            onChange={setProvider}
            placeholder={t("common.all")}
          />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1">
            {t("entries.filter.application")}
          </label>
          <SingleSearchSelect
            value={value.application ?? ""}
            options={appOptions}
            onChange={setApplication}
            placeholder={t("common.all")}
          />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1">
            {t("entries.filter.startTime")}
          </label>
          <div className="relative">
            <Calendar size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-2 pl-7 pr-2 py-1.5 text-[12px] focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition-colors"
            />
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1">
            {t("entries.filter.endTime")}
          </label>
          <div className="relative">
            <Calendar size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-2 pl-7 pr-2 py-1.5 text-[12px] focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition-colors"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
