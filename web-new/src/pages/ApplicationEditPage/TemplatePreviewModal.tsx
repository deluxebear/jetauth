// web-new/src/pages/ApplicationEditPage/TemplatePreviewModal.tsx
//
// Modal that lets an admin preview a candidate layout template at full
// size WITHOUT committing app.template yet. Uses the same postMessage
// pipeline as the sidecar preview — just overrides the template id in
// the config payload so the iframe renders that layout instead of the
// currently-selected one.

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { buildPreviewConfig } from "../admin-preview/buildPreviewConfig";
import type { AuthApplication } from "../../auth/api/types";
import { useTranslation } from "../../i18n";

// Duplicated from admin-preview/AdminPreviewPane to avoid a cross-import
// just for two string constants. If these ever diverge something's wrong.
const PREVIEW_MESSAGE_TYPE = "jetauth.preview.config" as const;
const PREVIEW_READY_TYPE = "jetauth.preview.ready" as const;

interface Props {
  open: boolean;
  onClose: () => void;
  application: AuthApplication;
  templateId: string;
  templateLabel: string;
}

export default function TemplatePreviewModal({
  open,
  onClose,
  application,
  templateId,
  templateLabel,
}: Props) {
  const { t } = useTranslation();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const orgName =
    application.organizationObj?.name ?? application.organization ?? "built-in";
  const src = open
    ? `/login/${orgName}/${application.name}?preview=1&asGuest=1&previewTheme=light`
    : "";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Single handler: when a fresh iframe signals READY, post the config
  // with the template override using the closure's current templateId.
  // Re-registers on templateId change so the closure is never stale.
  // Combined with key={templateId} on the iframe this also means: each
  // new iframe gets exactly one config post tagged with the right id.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type !== PREVIEW_READY_TYPE) return;
      if (!iframeRef.current) return;
      const cfg = buildPreviewConfig(application);
      cfg.template = templateId;
      iframeRef.current.contentWindow?.postMessage(
        { type: PREVIEW_MESSAGE_TYPE, payload: cfg },
        window.location.origin,
      );
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [open, application, templateId]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("apps.uiGroup.layoutTemplate.previewTitle" as never)}
    >
      <div
        className="relative w-full max-w-6xl h-[85vh] bg-surface-1 rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <div className="text-[14px] font-semibold text-text-primary">
            {t("apps.uiGroup.layoutTemplate.previewTitle" as never)}
            <span className="text-text-muted font-normal"> — {templateLabel}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
            aria-label="close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-hidden bg-surface-2">
          {/* key={templateId} forces a fresh iframe on every preview click.
              Without this the modal stays open across clicks, src is
              stable, and the postMessage override can race with the
              iframe's already-rendered state — visually every template
              ends up showing whatever rendered first. Remount is cheap
              and removes the race entirely. */}
          <iframe
            key={templateId}
            ref={iframeRef}
            src={src}
            title="template preview"
            className="w-full h-full border-0"
          />
        </div>
      </div>
    </div>
  );
}
