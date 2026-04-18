import { useMemo, useState } from "react";
import type { AuthApplication } from "../../auth/api/types";
import PreviewToolbar, {
  type PreviewDevice, type PreviewMode, type PreviewTheme,
} from "./PreviewToolbar";
import { buildPreviewConfig, encodePreviewConfig } from "./buildPreviewConfig";

interface AdminPreviewPaneProps {
  application: AuthApplication;
  /** Collapsed on narrow viewports by default. */
  initiallyCollapsed?: boolean;
}

/**
 * Sidecar iframe that renders the live auth UI for the current (unsaved)
 * ApplicationEditPage form state. Re-renders on every application change
 * via a changing previewConfig query param — React's referential-equality
 * + useMemo keep the re-render cheap and debounced (React's batching).
 */
export default function AdminPreviewPane({
  application, initiallyCollapsed = false,
}: AdminPreviewPaneProps) {
  const [mode, setMode] = useState<PreviewMode>("signin");
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [theme, setTheme] = useState<PreviewTheme>("light");
  const [collapsed, setCollapsed] = useState(initiallyCollapsed);

  const src = useMemo(() => {
    const cfg = buildPreviewConfig(application);
    const encoded = encodePreviewConfig(cfg);
    const orgName = application.organizationObj?.name ?? application.organization ?? "built-in";
    const prefix =
      mode === "signin" ? "/login" :
      mode === "signup" ? "/signup" : "/forget";
    const path =
      mode === "signin" ? `/login/${orgName}/${application.name}` :
      mode === "signup" ? `/signup/${application.name}` :
      `/forget/${application.name}`;
    // Suppress unused prefix warning; path already includes it
    void prefix;
    return `${path}?previewConfig=${encoded}&previewTheme=${theme}`;
  }, [application, mode, theme]);

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
          src={src}
          title="admin preview"
          className={iframeClass}
        />
      </div>
    </div>
  );
}
