// web-new/src/pages/ApplicationEditPage/TemplatePreviewModal.tsx
//
// Modal that lets an admin preview a candidate layout template at full
// size WITHOUT committing app.template yet. Uses the same postMessage
// pipeline as the sidecar preview — just overrides the template id in
// the config payload so the iframe renders that layout instead of the
// currently-selected one.

import { useEffect, useRef, useState } from "react";
import { X, Monitor, Tablet, Smartphone } from "lucide-react";
import { buildPreviewConfig } from "../admin-preview/buildPreviewConfig";
import type { AuthApplication } from "../../auth/api/types";
import { useTranslation } from "../../i18n";

type Device = "desktop" | "tablet" | "mobile";

const DEVICE_FRAME: Record<Device, { width: string; height: string; rounded: string }> = {
  desktop: { width: "100%", height: "100%", rounded: "rounded-none" },
  tablet: { width: "768px", height: "1024px", rounded: "rounded-xl" },
  mobile: { width: "375px", height: "720px", rounded: "rounded-2xl" },
};

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
  const [device, setDevice] = useState<Device>("desktop");

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
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0 gap-4">
          <div className="text-[14px] font-semibold text-text-primary min-w-0 truncate">
            {t("apps.uiGroup.layoutTemplate.previewTitle" as never)}
            <span className="text-text-muted font-normal"> — {templateLabel}</span>
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-surface-2 p-1 shrink-0">
            {(["desktop", "tablet", "mobile"] as const).map((d) => {
              const Icon = d === "desktop" ? Monitor : d === "tablet" ? Tablet : Smartphone;
              const active = device === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDevice(d)}
                  aria-label={t(`apps.uiGroup.layoutTemplate.device.${d}` as never)}
                  aria-pressed={active}
                  className={[
                    "rounded-md p-1.5 transition-colors",
                    active
                      ? "bg-white text-text-primary shadow-sm dark:bg-surface-0"
                      : "text-text-muted hover:text-text-secondary",
                  ].join(" ")}
                >
                  <Icon size={14} />
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors shrink-0"
            aria-label="close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-surface-2 flex items-start justify-center p-4">
          {/* key={templateId} forces a fresh iframe on every preview click.
              Without this the modal stays open across clicks, src is
              stable, and the postMessage override can race with the
              iframe's already-rendered state — visually every template
              ends up showing whatever rendered first. Remount is cheap
              and removes the race entirely. */}
          <iframe
            key={`${templateId}-${device}`}
            ref={iframeRef}
            src={src}
            title="template preview"
            style={{
              width: DEVICE_FRAME[device].width,
              height: DEVICE_FRAME[device].height,
              maxHeight: "100%",
            }}
            className={`border border-border ${DEVICE_FRAME[device].rounded} shadow-sm bg-white`}
          />
        </div>
      </div>
    </div>
  );
}
