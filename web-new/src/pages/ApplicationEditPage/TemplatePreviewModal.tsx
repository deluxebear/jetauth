// web-new/src/pages/ApplicationEditPage/TemplatePreviewModal.tsx
//
// Modal that lets an admin preview a candidate layout template at full
// size WITHOUT committing app.template yet. Uses the same postMessage
// pipeline as the sidecar preview — just overrides the template id in
// the config payload so the iframe renders that layout instead of the
// currently-selected one.

import { useEffect, useRef, useState } from "react";
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
  const [iframeReady, setIframeReady] = useState(false);

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

  // When `open` is false the whole modal returns null below, so all local
  // state unmounts. Next open starts fresh with iframeReady=false — no
  // explicit reset needed.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === PREVIEW_READY_TYPE) setIframeReady(true);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [open]);

  useEffect(() => {
    if (!iframeRef.current || !iframeReady || !open) return;
    const cfg = buildPreviewConfig(application);
    // Override with the candidate id — admin is previewing, not committing.
    cfg.template = templateId;
    iframeRef.current.contentWindow?.postMessage(
      { type: PREVIEW_MESSAGE_TYPE, payload: cfg },
      window.location.origin,
    );
  }, [iframeReady, open, application, templateId]);

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
          <iframe
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
