import { useEffect, useMemo, useRef, useState } from "react";
import type { AuthApplication } from "../../auth/api/types";
import PreviewToolbar, {
  type PreviewDevice, type PreviewMode, type PreviewTheme,
} from "./PreviewToolbar";
import { buildPreviewConfig } from "./buildPreviewConfig";

interface AdminPreviewPaneProps {
  application: AuthApplication;
  /** Collapsed on narrow viewports by default. */
  initiallyCollapsed?: boolean;
  /**
   * Called when a user clicks an element inside the preview iframe that has
   * a `data-cfg-section` attribute. The admin page typically uses this to
   * scroll to and briefly highlight the matching config card.
   */
  onInspect?: (section: string, field?: string) => void;
}

/**
 * Sidecar iframe that renders the live auth UI for the current (unsaved)
 * ApplicationEditPage form state.
 *
 * Config delivery: postMessage. The iframe src is a short URL with just
 * ?preview=1 (signals AuthShell to skip auth). The full application
 * override is posted to iframe.contentWindow once it signals ready. This
 * avoids HTTP 431 (request headers too large) that the URL-embedded
 * approach hit when the payload exceeded ~8 KB.
 */
export const PREVIEW_MESSAGE_TYPE = "jetauth.preview.config" as const;
export const PREVIEW_READY_TYPE = "jetauth.preview.ready" as const;
export const PREVIEW_INSPECT_TYPE = "jetauth.preview.inspect" as const;

export default function AdminPreviewPane({
  application, initiallyCollapsed = false, onInspect,
}: AdminPreviewPaneProps) {
  const [mode, setMode] = useState<PreviewMode>("signin");
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [theme, setTheme] = useState<PreviewTheme>("light");
  const [collapsed, setCollapsed] = useState(initiallyCollapsed);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeReady, setIframeReady] = useState(false);

  const orgName =
    application.organizationObj?.name ?? application.organization ?? "built-in";
  const appName = application.name;

  const externalPath = useMemo(() => {
    const base =
      mode === "signin" ? `/login/${orgName}/${appName}` :
      mode === "signup" ? `/signup/${appName}` :
      `/forget/${appName}`;
    return `${base}?asGuest=1`;
  }, [mode, orgName, appName]);

  const src = useMemo(() => `${externalPath}?preview=1&previewTheme=${theme}`, [externalPath, theme]);

  // Listen for iframe messages: ready + inspect (bidirectional link for P4).
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === PREVIEW_READY_TYPE) {
        setIframeReady(true);
        return;
      }
      if (e.data?.type === PREVIEW_INSPECT_TYPE) {
        const { section, field } = (e.data.payload ?? {}) as {
          section?: string;
          field?: string;
        };
        if (section && onInspect) onInspect(section, field);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onInspect]);

  // Reset ready state when src changes (iframe re-creates).
  useEffect(() => {
    setIframeReady(false);
  }, [src]);

  // Push the current config to the iframe whenever it's ready + on every
  // application change thereafter.
  useEffect(() => {
    if (!iframeRef.current || !iframeReady) return;
    const cfg = buildPreviewConfig(application);
    iframeRef.current.contentWindow?.postMessage(
      { type: PREVIEW_MESSAGE_TYPE, payload: cfg },
      window.location.origin
    );
  }, [application, iframeReady]);

  const iframeClass = device === "mobile"
    ? "w-[375px] h-[720px] mx-auto border border-border rounded-2xl shadow-sm"
    : "w-full h-full min-h-[600px] border border-border rounded-lg";

  if (collapsed) {
    return (
      <div className="flex items-center justify-center p-4">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="rounded-lg border border-border bg-surface-1 px-4 py-2 text-[13px] text-text-secondary hover:bg-surface-2"
        >
          Show live preview
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-surface-0 h-full">
      <PreviewToolbar
        mode={mode} device={device} theme={theme}
        onModeChange={setMode} onDeviceChange={setDevice} onThemeChange={setTheme}
        externalUrl={externalPath}
      />
      <div className="flex-1 p-4 bg-surface-1 overflow-auto">
        <iframe
          key={src}
          ref={iframeRef}
          src={src}
          title="admin preview"
          className={iframeClass}
        />
      </div>
    </div>
  );
}
