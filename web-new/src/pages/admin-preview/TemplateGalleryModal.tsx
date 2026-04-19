import { useEffect } from "react";
import { X, Sparkles, LayoutTemplate, Check, ArrowUpCircle } from "lucide-react";
import { useTranslation } from "../../i18n";
import { AUTH_TEMPLATES, type AuthTemplate } from "./templates";
import { templates as LAYOUT_TEMPLATES } from "../../auth/templates";

interface Props {
  open: boolean;
  onClose: () => void;
  onApply: (t: AuthTemplate) => void;
  /**
   * Tombstone stamped on the app at last apply (templateOptions._manifest).
   * When set, the matching card renders a "Currently applied" badge; if
   * the version in the catalog has moved on, the Apply button becomes
   * "Update to v{new}" instead.
   */
  currentManifest?: { id: string; version: string };
}

/**
 * Full-screen template gallery. Styled to mirror the live-preview modal in
 * ApplicationEditPage for visual continuity.
 *
 * - ESC closes
 * - Backdrop click closes
 * - "Apply" on a card delegates to the parent; the parent performs the
 *   config merge and closes.
 */
export default function TemplateGalleryModal({ open, onClose, onApply, currentManifest }: Props) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      data-testid="template-gallery-backdrop"
    >
      <div
        className="w-[90vw] h-[90vh] max-w-[1400px] rounded-2xl border border-border bg-surface-0 shadow-[var(--shadow-elevated)] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-gallery-title"
      >
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-border bg-surface-1">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-accent" />
              <h3 id="template-gallery-title" className="text-[16px] font-semibold text-text-primary">
                {t("apps.template.title" as any)}
              </h3>
            </div>
            <p className="mt-1 text-[13px] text-text-muted">
              {t("apps.template.subtitle" as any)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors"
            aria-label={t("apps.template.cancel" as any)}
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 bg-surface-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {AUTH_TEMPLATES.map((tmpl) => {
              const isCurrent = currentManifest?.id === tmpl.id;
              const hasUpdate = isCurrent && currentManifest?.version !== tmpl.version;
              const applyLabel = hasUpdate
                ? `${t("apps.template.update" as never)} → v${tmpl.version}`
                : isCurrent
                ? t("apps.template.reapply" as never)
                : t("apps.template.apply" as never);
              return (
                <TemplateCard
                  key={tmpl.id}
                  template={tmpl}
                  applyLabel={applyLabel}
                  onApply={() => onApply(tmpl)}
                  isCurrent={isCurrent}
                  hasUpdate={hasUpdate}
                  currentBadgeLabel={t("apps.template.current" as never)}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

interface CardProps {
  template: AuthTemplate;
  applyLabel: string;
  onApply: () => void;
  isCurrent: boolean;
  hasUpdate: boolean;
  currentBadgeLabel: string;
}

function TemplateCard({
  template,
  applyLabel,
  onApply,
  isCurrent,
  hasUpdate,
  currentBadgeLabel,
}: CardProps) {
  const layoutId = template.config.template;
  const layoutMeta = layoutId ? LAYOUT_TEMPLATES[layoutId]?.meta : undefined;
  return (
    <div
      className={[
        "flex flex-col rounded-xl border bg-surface-0 overflow-hidden transition-all",
        isCurrent
          ? "border-accent ring-2 ring-accent/30"
          : "border-border hover:border-accent/60 hover:shadow-[var(--shadow-card)]",
      ].join(" ")}
      data-testid={`template-card-${template.id}`}
    >
      <div className="relative">
        <div
          className="aspect-[12/7] bg-surface-2 border-b border-border overflow-hidden [&>svg]:h-full [&>svg]:w-full"
          // Preview SVG comes from the template data file — fully authored by us,
          // never user input, so dangerouslySetInnerHTML is safe here.
          dangerouslySetInnerHTML={{ __html: template.preview }}
          aria-hidden="true"
        />
        {layoutMeta && (
          <span
            className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-surface-0/90 border border-border px-2 py-0.5 text-[10px] font-semibold text-text-secondary backdrop-blur-sm"
            title={layoutMeta.description.en}
          >
            <LayoutTemplate size={10} />
            {layoutMeta.name.en}
          </span>
        )}
        {isCurrent && (
          <span
            className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm"
            data-testid={`template-current-${template.id}`}
          >
            <Check size={10} />
            {currentBadgeLabel}
          </span>
        )}
      </div>
      <div className="flex-1 flex flex-col gap-3 p-4">
        <div>
          <h4 className="text-[14px] font-semibold text-text-primary">
            {template.name}
            <span className="ml-2 text-[11px] font-mono text-text-muted">
              v{template.version}
            </span>
          </h4>
          <p className="mt-1 text-[12px] leading-relaxed text-text-muted">{template.description}</p>
        </div>
        <div className="mt-auto pt-1">
          <button
            type="button"
            onClick={onApply}
            className={[
              "w-full inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors",
              hasUpdate
                ? "bg-warning text-white hover:opacity-90"
                : isCurrent
                ? "bg-surface-2 text-text-secondary hover:bg-surface-1 border border-border"
                : "bg-accent text-white hover:bg-accent-hover",
            ].join(" ")}
            data-testid={`template-apply-${template.id}`}
          >
            {hasUpdate && <ArrowUpCircle size={13} />}
            {applyLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
