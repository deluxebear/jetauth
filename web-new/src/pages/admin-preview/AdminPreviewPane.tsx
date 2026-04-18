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

export default function AdminPreviewPane({
  application, initiallyCollapsed = false,
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

  // Short URL — just enough for the iframe's AuthShell to pick the right app.
  const src = useMemo(() => {
    const path =
      mode === "signin" ? `/login/${orgName}/${appName}` :
      mode === "signup" ? `/signup/${appName}` :
      `/forget/${appName}`;
    return `${path}?preview=1&previewTheme=${theme}`;
  }, [mode, theme, orgName, appName]);

  // Listen for the iframe's "ready" signal.
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === PREVIEW_READY_TYPE) {
        setIframeReady(true);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

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
    : "w-full h-[720px] border border-border rounded-lg";

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
    <div className="flex flex-col bg-surface-0">
      <PreviewToolbar
        mode={mode} device={device} theme={theme}
        onModeChange={setMode} onDeviceChange={setDevice} onThemeChange={setTheme}
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
