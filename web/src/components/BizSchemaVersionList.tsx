import { ExternalLink, MoreHorizontal, Plus, RotateCcw } from "lucide-react";
import type { BizAuthorizationModel } from "../backend/BizBackend";
import { useTranslation } from "../i18n";
import { fmtRelative } from "../utils/format";

interface Props {
  /** Authorization model versions, newest first (matches the API response order). */
  versions: BizAuthorizationModel[];
  /** The currently active model id (from BizAppConfig.currentAuthorizationModelId). */
  activeId?: string;
  /** Click on a row anywhere except the rollback button → open detail. */
  onSelect: (modelId: string) => void;
  /** Click the rollback button on a non-active row. */
  onRollback: (modelId: string) => void;
  /** Click the "新建版本" header button. */
  onCreateNew: () => void;
  /** Click the "导出 DSL" header button — host fetches the active DSL and downloads it. */
  onExportDsl: () => void;
}

function shortId(id: string): string {
  if (!id) return "";
  if (id.length <= 12) return id;
  return id.slice(0, 5) + "…" + id.slice(-5);
}

export default function BizSchemaVersionList({
  versions,
  activeId,
  onSelect,
  onRollback,
  onCreateNew,
  onExportDsl,
}: Props) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-bold text-text-primary mb-1">
            {t("rebac.schema.title" as any)}
          </h2>
          <p className="text-[13px] text-text-muted">
            {t("rebac.schema.subtitle" as any)}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onExportDsl}
            className="px-3 py-1.5 rounded-md border border-border hover:border-accent/40 text-[13px] flex items-center gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            {t("rebac.schema.exportDsl" as any)}
          </button>
          <button
            type="button"
            onClick={onCreateNew}
            className="px-3 py-1.5 rounded-md bg-accent text-white text-[13px] flex items-center gap-2 hover:bg-accent/90"
          >
            <Plus className="w-4 h-4" />
            {t("rebac.schema.newVersion" as any)}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface-1">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
          <span className="text-[12px] text-text-muted">
            {t("rebac.schema.versionHistory" as any)} · {versions.length}
          </span>
          <span className="text-[12px] text-text-muted">
            {t("rebac.schema.activeOnlyHint" as any)}
          </span>
        </div>
        {versions.length === 0 ? (
          <p className="text-[12px] text-text-muted py-8 text-center">
            {t("rebac.schema.noVersions" as any)}
          </p>
        ) : (
          <ul>
            {versions.map((v, idx) => {
              // Versions are newest-first; v(N) is the latest, v(1) is the oldest.
              const versionLabel = `v${versions.length - idx}`;
              const isActive = v.id === activeId;
              return (
                <li
                  key={v.id}
                  className={`flex items-center px-4 py-3 border-b border-border last:border-b-0 cursor-pointer hover:bg-surface-2 ${
                    isActive ? "bg-accent/5" : ""
                  }`}
                  onClick={() => onSelect(v.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(v.id);
                    }
                  }}
                >
                  <div
                    className={`w-10 h-10 rounded-md flex items-center justify-center text-[12px] font-bold mr-3 shrink-0 ${
                      isActive ? "bg-accent text-white" : "bg-surface-2 text-text-secondary"
                    }`}
                  >
                    {versionLabel}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[14px] font-semibold text-text-primary">
                        {v.description || t("rebac.schema.noDescription" as any)}
                      </span>
                      {isActive && (
                        <span className="px-2 py-0.5 text-[11px] rounded-full bg-accent/15 text-accent">
                          {t("rebac.schema.activeBadge" as any)}
                        </span>
                      )}
                    </div>
                    <div className="text-[12px] text-text-muted font-mono">
                      {shortId(v.id)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-[12px] text-text-muted shrink-0">
                    {v.createdBy && <span className="truncate max-w-[120px]">{v.createdBy}</span>}
                    <span>{fmtRelative(v.createdTime)}</span>
                    {!isActive && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRollback(v.id);
                        }}
                        aria-label={t("rebac.schema.rollbackTo" as any) + " " + versionLabel}
                        className="p-1.5 rounded hover:bg-surface-3"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    )}
                    <MoreHorizontal className="w-4 h-4 opacity-30" />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
