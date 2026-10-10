import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "../i18n";
import * as BizBackend from "../backend/BizBackend";
import type { BizAppConfig, UserPermissionSummary } from "../backend/BizBackend";

// Per-application view of a user's business-permission footprint: biz roles
// plus the effective resources/actions resolved by /api/biz-get-user-permissions.
// ReBAC apps have no role/permission summary (the endpoint returns the OQ-2
// guidance error), so they are listed with a "not supported" note instead of
// being queried.

type BlockState =
  | { kind: "ok"; summary: UserPermissionSummary }
  | { kind: "rebac" }
  | { kind: "error"; msg: string };

interface Block {
  config: BizAppConfig;
  state: BlockState;
}

interface Props {
  userOwner: string;
  userName: string;
}

export default function UserBizPermissionOverview({ userOwner, userName }: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [blocks, setBlocks] = useState<Block[]>([]);
  const userId = `${userOwner}/${userName}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");

    (async () => {
      try {
        const res = await BizBackend.getBizAppConfigs(userOwner);
        if (res.status !== "ok") {
          if (!cancelled) setLoadError(res.msg || t("common.loadFailed"));
          return;
        }
        const configs = (res.data ?? []).filter((c) => c.owner === userOwner);
        const result: Block[] = await Promise.all(
          configs.map(async (config): Promise<Block> => {
            if (config.modelType === "rebac") return { config, state: { kind: "rebac" } };
            try {
              const r = await BizBackend.bizGetUserPermissions(`${config.owner}/${config.appName}`, userId);
              if (r.status === "ok") return { config, state: { kind: "ok", summary: r.data } };
              return { config, state: { kind: "error", msg: r.msg } };
            } catch (e) {
              return { config, state: { kind: "error", msg: e instanceof Error ? e.message : String(e) } };
            }
          }),
        );
        if (!cancelled) setBlocks(result);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userOwner, userName]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  if (loadError) {
    return <div role="alert" className="py-12 text-center text-danger text-[13px]">{loadError}</div>;
  }

  if (blocks.length === 0) {
    return <div className="py-12 text-center text-text-muted text-[13px]">{t("authz.userBizPerms.noApps")}</div>;
  }

  return (
    <div className="space-y-4" data-testid="user-biz-permission-overview">
      {blocks.map(({ config, state }) => {
        const summary = state.kind === "ok" ? state.summary : null;
        const roles = summary?.roles ?? [];
        const resources = summary?.allowedResources ?? [];
        const actions = summary?.allowedActions ?? [];
        const hasAccess = roles.length > 0 || resources.length > 0;
        return (
          <div
            key={config.appName}
            className={`rounded-xl border border-border overflow-hidden ${state.kind === "ok" && !hasAccess ? "opacity-60" : ""}`}
          >
            <div className="flex items-center gap-3 px-4 py-3 bg-surface-2 border-b border-border">
              <div className="flex-1 min-w-0">
                <Link
                  to={`/authorization/${config.owner}/${config.appName}`}
                  className="text-[14px] font-semibold text-text-primary hover:text-accent transition-colors"
                >
                  {config.displayName || config.appName}
                </Link>
                <div className="text-[11px] text-text-muted font-mono">{config.owner} / {config.appName}</div>
              </div>
              {state.kind === "ok" && (
                <div className="flex flex-wrap gap-1 justify-end">
                  {roles.length > 0 ? (
                    roles.map((r) => (
                      <span key={r} className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold bg-accent/10 text-accent">
                        {r.split("/").pop()}
                      </span>
                    ))
                  ) : (
                    <span className="text-[11px] text-text-muted">{t("authz.userPerms.noRole")}</span>
                  )}
                </div>
              )}
            </div>

            {state.kind === "rebac" && (
              <div className="px-4 py-3 text-[12px] text-text-muted">{t("authz.userBizPerms.rebacNotSupported")}</div>
            )}
            {state.kind === "error" && (
              <div role="alert" className="px-4 py-3 text-[12px] text-danger">
                {t("authz.userBizPerms.loadFailed")}: {state.msg}
              </div>
            )}
            {state.kind === "ok" && (
              <div className="px-4 py-3 space-y-3">
                <ChipRow label={t("authz.perms.col.resources")} items={resources} empty={t("authz.userPerms.noPermission")} />
                <ChipRow label={t("authz.userPerms.allowedActions")} items={actions} empty="—" tone="success" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ChipRow({ label, items, empty, tone }: { label: string; items: string[]; empty: string; tone?: "success" }) {
  const cls = tone === "success" ? "bg-success/10 text-success" : "bg-surface-2 text-text-secondary font-mono";
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1">{label}</div>
      <div className="flex flex-wrap gap-1">
        {items.length > 0 ? (
          items.map((i) => (
            <span key={i} className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{i}</span>
          ))
        ) : (
          <span className="text-text-muted text-[11px]">{empty}</span>
        )}
      </div>
    </div>
  );
}
