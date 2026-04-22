import { useEffect, useState } from "react";
import { LayoutDashboard, Hash, Users, FileText, Calendar } from "lucide-react";
import { useTranslation } from "../i18n";
import * as BizBackend from "../backend/BizBackend";
import { parseSchemaJson } from "./bizSchemaAst";

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
  }, [appId]);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-surface-1 p-6 text-center text-[13px] text-text-muted">
        {t("rebac.common.loading")}
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
      <div className="rounded-xl border border-dashed border-border bg-surface-1 p-12 text-center">
        <LayoutDashboard className="w-10 h-10 text-text-muted mx-auto mb-3" />
        <p className="text-[14px] font-semibold text-text-primary mb-2">
          {t("rebac.tab.overview")}
        </p>
        <p className="text-[12px] text-text-muted">
          {t("rebac.overview.emptyState")}
        </p>
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
      <div className="text-[24px] font-bold text-text-primary">{value}</div>
      {hint && (
        <div className="text-[11px] text-text-muted font-mono truncate">
          {hint}
        </div>
      )}
    </div>
  );
}
