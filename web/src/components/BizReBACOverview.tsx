import { useEffect, useState } from "react";
import {
  Hash, Users, FileText, Calendar, Building2, Share2, Wand2,
  Database, Zap, ListOrdered, ShieldCheck,
} from "lucide-react";
import { useTranslation } from "../i18n";
import * as BizBackend from "../backend/BizBackend";
import type { BizReBACStats } from "../backend/BizBackend";
import { parseSchemaJson } from "./bizSchemaAst";
import { REBAC_TEMPLATES, type ReBACTemplate } from "./bizRebacTemplates";
import { useModal } from "./Modal";
import BizRecentWritesCard from "./BizRecentWritesCard";
import BizTypeDistributionCard from "./BizTypeDistributionCard";

// Suppress unused import warnings for icons kept for future tiles
void Hash; void Users; void FileText; void Calendar; void Building2; void Share2;

const ICONS = { FileText, Building2, Share2 } as const;

// BizReBACOverview — Task D3. Mockup ① layout:
//   4 hero stat tiles + recent-writes card + type-distribution card.
// Falls back to the empty-state onboarding (template picker) when the
// app has no active schema yet.

interface Props {
  appId: string;
  /** Optional callback when the user clicks "View all" in the recent
      writes card. The Overview's host page maps this to a tab change. */
  onJumpTab?: (tab: "schema" | "tuples" | "tester") => void;
}

export default function BizReBACOverview({ appId, onJumpTab }: Props) {
  const { t } = useTranslation();
  const [stats, setStats] = useState<BizReBACStats | null>(null);
  const [hasSchema, setHasSchema] = useState<boolean>(false);
  const [schemaTypeCount, setSchemaTypeCount] = useState(0);
  const [schemaRelationCount, setSchemaRelationCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [applying, setApplying] = useState(false);
  const [assertionStats, setAssertionStats] = useState<{ total: number; passed: number } | null>(null);
  const modal = useModal();

  // Suppress unused warnings — kept for potential future stat tiles
  void schemaTypeCount; void schemaRelationCount;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      BizBackend.getBizReBACStats(appId),
      BizBackend.getBizAuthorizationModel(appId),
      BizBackend.listBizAssertions(appId),
    ])
      .then(([statsRes, modelRes, assertRes]) => {
        if (cancelled) return;
        const haveSchema = modelRes.status === "ok" && !!modelRes.data?.schemaJson;
        setHasSchema(haveSchema);
        if (haveSchema && modelRes.data?.schemaJson) {
          try {
            const ast = parseSchemaJson(modelRes.data.schemaJson);
            setSchemaTypeCount(ast.types.length);
            let relCount = 0;
            for (const td of ast.types) relCount += td.relations.length;
            setSchemaRelationCount(relCount);
          } catch {
            setSchemaTypeCount(0);
            setSchemaRelationCount(0);
          }
        }
        setStats(statsRes.status === "ok" ? statsRes.data ?? null : null);
        if (assertRes.status === "ok" && Array.isArray(assertRes.data)) {
          const list = assertRes.data;
          // Only count assertions that have been run at least once.
          // Unrun assertions don't carry a verdict yet.
          const runList = list.filter((a) => a.lastActual !== undefined);
          const passed = runList.filter((a) => a.lastActual === a.expected).length;
          setAssertionStats({ total: runList.length, passed });
        } else {
          setAssertionStats({ total: 0, passed: 0 });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [appId, reloadKey]);

  async function applyTemplate(tpl: ReBACTemplate) {
    setApplying(true);
    try {
      const saveRes = await BizBackend.saveBizAuthorizationModel(appId, tpl.dsl);
      if (saveRes.status !== "ok" || saveRes.data?.outcome === "conflict") {
        modal.toast(saveRes.msg || t("rebac.common.error"), "error");
        return;
      }
      const writeRes = await BizBackend.writeBizTuples({
        appId,
        writes: tpl.sampleTuples.map((tk) => ({
          object: tk.object,
          relation: tk.relation,
          user: tk.user,
        })),
      });
      if (writeRes.status !== "ok") {
        modal.toast(writeRes.msg || t("rebac.common.error"), "error");
        return;
      }
      modal.toast(t("rebac.templates.applied"), "success");
      setReloadKey((k) => k + 1);
    } catch (err) {
      modal.toast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setApplying(false);
    }
  }

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-border bg-surface-1 p-3 h-[88px] animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (!loading && !hasSchema && stats === null) {
    // getBizReBACStats returned an error — might still have no schema
    // or the server is down; surface the generic error only if we
    // couldn't determine schema status either.
    // But if hasSchema is definitively false (model fetch was ok, no schemaJson),
    // fall through to the empty-state template picker below.
  }

  if (!hasSchema) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface-1 p-8">
        <div className="text-center mb-6">
          <Wand2 className="w-10 h-10 text-text-muted mx-auto mb-3" aria-hidden />
          <p className="text-[15px] font-semibold text-text-primary mb-1">
            {t("rebac.overview.emptyTitle")}
          </p>
          <p className="text-[13px] text-text-muted">
            {t("rebac.overview.emptyHint")}
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {REBAC_TEMPLATES.map((tpl) => {
            const Icon = ICONS[tpl.icon];
            return (
              <button
                key={tpl.id}
                type="button"
                aria-label={t("rebac.overview.applyTemplateLabel", { name: t(`rebac.templates.${tpl.i18nKey}.title`) })}
                disabled={applying}
                className="text-left rounded-lg border border-border bg-surface-2 p-4 hover:border-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 transition disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => void applyTemplate(tpl)}
              >
                <Icon className="w-5 h-5 text-accent mb-2" aria-hidden />
                <p className="text-[13px] font-semibold text-text-primary mb-1">
                  {t(`rebac.templates.${tpl.i18nKey}.title`)}
                </p>
                <p className="text-[12px] text-text-muted">
                  {t(`rebac.templates.${tpl.i18nKey}.subtitle`)}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="rounded-lg border border-border bg-surface-1 p-6 text-center text-[13px] text-text-muted">
        {t("rebac.common.error")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-[20px] font-bold text-text-primary mb-1">
          {t("rebac.overview.title" as any)}
        </h2>
        <p className="text-[13px] text-text-muted">
          {appId} · {fmt(stats.tupleCount)} {t("rebac.overview.relationsLabel" as any)} · {stats.modelCount} {t("rebac.overview.modelVersionsLabel" as any)}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <HeroStatCard
          icon={<ListOrdered className="w-4 h-4" />}
          label={t("rebac.overview.activeModel" as any)}
          value={`v${stats.modelCount}`}
          hint={fmtRelative(stats.lastUpdated) + " " + t("rebac.overview.published" as any)}
        />
        <HeroStatCard
          icon={<Database className="w-4 h-4" />}
          label={t("rebac.overview.relationTotal" as any)}
          value={fmt(stats.tupleCount)}
          hint={`${t("rebac.overview.todayPrefix" as any)} +${stats.todayDelta}`}
        />
        <HeroStatCard
          icon={<Zap className="w-4 h-4" />}
          label={t("rebac.overview.checkQps" as any)}
          value={fmtCompact(stats.checkQpsLastHour / 3600)}
          hint={t("rebac.overview.checkQpsHint" as any)}
        />
        <HeroStatCard
          icon={<ShieldCheck className="w-4 h-4" />}
          label={t("rebac.overview.assertionPass" as any)}
          value={assertionStats && assertionStats.total > 0
            ? `${assertionStats.passed}/${assertionStats.total}`
            : "—"}
          hint={
            assertionStats && assertionStats.total > 0
              ? `${assertionStats.total - assertionStats.passed} ${t("rebac.overview.assertionsFailed" as any)}`
              : t("rebac.overview.assertionsEmpty" as any)
          }
          muted={!assertionStats || assertionStats.total === 0}
          onClick={onJumpTab ? () => onJumpTab("assertions" as any) : undefined}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <BizRecentWritesCard
          writes={stats.recentWrites}
          onViewAll={onJumpTab ? () => onJumpTab("tuples") : undefined}
        />
        <BizTypeDistributionCard rows={stats.typeDistribution} />
      </div>
    </div>
  );
}

// ── Private helpers ───────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString();
}

function fmtCompact(n: number): string {
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toFixed(1).replace(/\.0$/, "");
}

function fmtRelative(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay} d ago`;
  return d.toLocaleDateString();
}

function HeroStatCard({
  icon,
  label,
  value,
  hint,
  muted,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  hint?: string;
  muted?: boolean;
  onClick?: () => void;
}) {
  const clickable = onClick !== undefined;
  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      className={`rounded-xl border border-border bg-surface-1 p-4 flex flex-col gap-1 ${muted ? "opacity-60" : ""} ${clickable ? "cursor-pointer hover:border-accent transition-colors" : ""}`}
    >
      <div className="flex items-center gap-2 text-text-muted text-[11px] font-semibold uppercase tracking-wide">
        {icon}
        {label}
      </div>
      <div className="text-[28px] font-bold text-text-primary tabular-nums leading-none mt-1">
        {value}
      </div>
      {hint && (
        <div className="text-[11px] text-text-muted truncate mt-1">{hint}</div>
      )}
    </div>
  );
}
