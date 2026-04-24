import { useEffect, useState } from "react";
import { Hash, Users, FileText, Calendar, Building2, Share2, Wand2 } from "lucide-react";
import { useTranslation } from "../i18n";
import * as BizBackend from "../backend/BizBackend";
import { parseSchemaJson } from "./bizSchemaAst";
import { REBAC_TEMPLATES, type ReBACTemplate } from "./bizRebacTemplates";
import { useModal } from "./Modal";

const ICONS = { FileText, Building2, Share2 } as const;

// BizReBACOverview — Task 11. A read-only dashboard for a ReBAC app
// showing type/relation/tuple counts and the current authorization
// model id. Aggregates three endpoints in parallel on mount:
//   - getBizAuthorizationModel (current schema → counts)
//   - readBizTuples (no filter → total count)
//   - listBizAuthorizationModels (history → count + latest created)

interface Props {
  appId: string;
}

interface Stats {
  typeCount: number;
  relationCount: number;
  tupleCount: number;
  modelCount: number;
  currentModelId?: string;
  lastUpdated?: string;
  hasSchema: boolean;
}

export default function BizReBACOverview({ appId }: Props) {
  const { t } = useTranslation();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [applying, setApplying] = useState(false);
  const modal = useModal();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      BizBackend.getBizAuthorizationModel(appId),
      // countBizTuples is a scalar SELECT COUNT(*) — safe to call on
      // large stores (post-review R3: prior version pulled every row
      // just to measure length, a multi-MB payload for 10k+ stores).
      BizBackend.countBizTuples(appId),
      BizBackend.listBizAuthorizationModels(appId),
    ])
      .then(([modelRes, countRes, listRes]) => {
        if (cancelled) return;
        const hasSchema =
          modelRes.status === "ok" && !!modelRes.data?.schemaJson;
        let typeCount = 0;
        let relationCount = 0;
        if (hasSchema && modelRes.data?.schemaJson) {
          const ast = parseSchemaJson(modelRes.data.schemaJson);
          typeCount = ast.types.length;
          for (const td of ast.types) relationCount += td.relations.length;
        }
        const tupleCount =
          countRes.status === "ok" && countRes.data
            ? countRes.data.count
            : 0;
        const models =
          listRes.status === "ok" && Array.isArray(listRes.data)
            ? listRes.data
            : [];
        setStats({
          typeCount,
          relationCount,
          tupleCount,
          modelCount: models.length,
          currentModelId: modelRes.status === "ok" ? modelRes.data?.id : undefined,
          lastUpdated: models[0]?.createdTime,
          hasSchema,
        });
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

  if (!stats) {
    return (
      <div className="rounded-lg border border-border bg-surface-1 p-6 text-center text-[13px] text-text-muted">
        {t("rebac.common.error")}
      </div>
    );
  }

  if (!stats.hasSchema) {
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

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<Hash className="w-4 h-4" />}
          label={t("rebac.overview.types")}
          value={stats.typeCount}
        />
        <StatCard
          icon={<FileText className="w-4 h-4" />}
          label={t("rebac.overview.relations")}
          value={stats.relationCount}
        />
        <StatCard
          icon={<Users className="w-4 h-4" />}
          label={t("rebac.overview.tuples")}
          value={stats.tupleCount}
        />
        <StatCard
          icon={<Calendar className="w-4 h-4" />}
          label={t("rebac.overview.currentModel")}
          value={String(stats.modelCount)}
          hint={stats.currentModelId?.slice(0, 8)}
        />
      </div>
      {stats.lastUpdated && (
        <div className="rounded-lg border border-border bg-surface-1 p-3 text-[12px] text-text-muted">
          <span className="font-semibold text-text-primary">
            {t("rebac.overview.lastUpdated")}:
          </span>{" "}
          {new Date(stats.lastUpdated).toLocaleString()}
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-1 p-3 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-text-muted text-[11px] font-semibold uppercase tracking-wide">
        {icon}
        {label}
      </div>
      <div className="text-[24px] font-bold text-text-primary tabular-nums">{value}</div>
      {hint && (
        <div className="text-[11px] text-text-muted font-mono truncate">
          {hint}
        </div>
      )}
    </div>
  );
}
