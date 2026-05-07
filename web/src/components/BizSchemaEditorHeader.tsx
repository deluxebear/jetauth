// Detail header for BizSchemaEditor — version label + badges + action
// buttons. Extracted from BizSchemaEditor to keep the editor file focused
// on DSL editing + version routing.
import { useTranslation } from "../i18n";

interface Props {
  meta: {
    id: string;
    description: string;
    createdTime: string;
    createdBy: string;
  };
  mode: "view" | "new";
  isActive: boolean;
  versionLabel: string;
  saving: boolean;
  onBack?: () => void;
  onValidate: () => void;
  onRollback: () => void;
  onPublishNew: () => void;
}

export default function BizSchemaEditorHeader({
  meta,
  mode,
  isActive,
  versionLabel,
  saving,
  onBack,
  onValidate,
  onRollback,
  onPublishNew,
}: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="text-[12px] text-text-muted hover:text-accent mb-2 flex items-center gap-1"
          >
            ← {t("rebac.schema.back")}
          </button>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-[18px] font-bold text-text-primary">
            {mode === "new"
              ? t("rebac.schema.newDraftTitle")
              : `${versionLabel}${meta.description ? ` · ${meta.description}` : ""}`}
          </h2>
          {mode === "view" && isActive && (
            <span className="px-2 py-0.5 text-[11px] rounded-full bg-accent/15 text-accent">
              {t("rebac.schema.activeBadge")}
            </span>
          )}
          {mode === "new" && (
            <span className="px-2 py-0.5 text-[11px] rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300">
              {t("rebac.schema.draftBadge")}
            </span>
          )}
        </div>
        <p className="text-[12px] text-text-muted mt-1 font-mono">
          {mode === "new"
            ? t("rebac.schema.newDraftHint")
            : `${meta.id.slice(0, 5)}…${meta.id.slice(-5)}${meta.createdTime ? ` · ${meta.createdTime}` : ""}${meta.createdBy ? ` · ${t("rebac.schema.publishedBy")} ${meta.createdBy}` : ""}`}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onValidate}
          className="px-3 py-1.5 rounded-md border border-border text-[13px] flex items-center gap-2 hover:bg-surface-2"
        >
          {t("rebac.schema.validate")}
        </button>
        {mode === "view" && !isActive && (
          <button
            type="button"
            onClick={onRollback}
            className="px-3 py-1.5 rounded-md border border-border text-[13px] hover:bg-surface-2"
          >
            {t("rebac.schema.rollback")}
          </button>
        )}
        <button
          type="button"
          onClick={onPublishNew}
          disabled={saving}
          className="px-3 py-1.5 rounded-md bg-accent text-white text-[13px] flex items-center gap-2 hover:bg-accent/90 disabled:opacity-50"
        >
          + {t("rebac.schema.publishNew")}
        </button>
      </div>
    </div>
  );
}
