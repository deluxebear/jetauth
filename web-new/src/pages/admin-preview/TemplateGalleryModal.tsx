import { useEffect } from "react";
import { X, Sparkles } from "lucide-react";
import { useTranslation } from "../../i18n";
import { AUTH_TEMPLATES, type AuthTemplate } from "./templates";

interface Props {
  open: boolean;
  onClose: () => void;
  onApply: (t: AuthTemplate) => void;
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
export default function TemplateGalleryModal({ open, onClose, onApply }: Props) {
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
            {AUTH_TEMPLATES.map((tmpl) => (
              <TemplateCard
                key={tmpl.id}
                template={tmpl}
                applyLabel={t("apps.template.apply" as any)}
                onApply={() => onApply(tmpl)}
              />
            ))}
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
}

function TemplateCard({ template, applyLabel, onApply }: CardProps) {
  return (
    <div
      className="flex flex-col rounded-xl border border-border bg-surface-0 overflow-hidden hover:border-accent/60 hover:shadow-[var(--shadow-card)] transition-all"
      data-testid={`template-card-${template.id}`}
    >
      <div
        className="aspect-[12/7] bg-surface-2 border-b border-border overflow-hidden [&>svg]:h-full [&>svg]:w-full"
        // Preview SVG comes from the template data file — fully authored by us,
        // never user input, so dangerouslySetInnerHTML is safe here.
        dangerouslySetInnerHTML={{ __html: template.preview }}
        aria-hidden="true"
      />
      <div className="flex-1 flex flex-col gap-3 p-4">
        <div>
          <h4 className="text-[14px] font-semibold text-text-primary">{template.name}</h4>
          <p className="mt-1 text-[12px] leading-relaxed text-text-muted">{template.description}</p>
        </div>
        <div className="mt-auto pt-1">
          <button
            type="button"
            onClick={onApply}
            className="w-full rounded-lg bg-accent px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-accent-hover transition-colors"
            data-testid={`template-apply-${template.id}`}
          >
            {applyLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
