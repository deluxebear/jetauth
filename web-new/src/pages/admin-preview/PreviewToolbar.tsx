import { Monitor, Smartphone, Sun, Moon } from "lucide-react";
import { useTranslation } from "../../i18n";

export type PreviewMode = "signin" | "signup" | "forget";
export type PreviewDevice = "desktop" | "mobile";
export type PreviewTheme = "light" | "dark";

interface PreviewToolbarProps {
  mode: PreviewMode;
  device: PreviewDevice;
  theme: PreviewTheme;
  onModeChange: (m: PreviewMode) => void;
  onDeviceChange: (d: PreviewDevice) => void;
  onThemeChange: (t: PreviewTheme) => void;
}

/**
 * Controls above the admin live-preview iframe. Three button groups:
 *   - Mode: Signin / Signup / Reset (forget password)
 *   - Device: Desktop / Mobile
 *   - Theme: Light / Dark
 *
 * Controlled component. Parent owns state and feeds the derived iframe
 * URL (mode → URL path prefix; device → iframe width; theme → URL param).
 */
export default function PreviewToolbar({
  mode, device, theme,
  onModeChange, onDeviceChange, onThemeChange,
}: PreviewToolbarProps) {
  const { t } = useTranslation();

  const btn = (active: boolean) =>
    `px-3 py-1.5 text-[12px] font-medium transition-colors ${
      active
        ? "bg-accent text-white"
        : "bg-surface-1 text-text-secondary hover:bg-surface-2"
    }`;

  return (
    <div className="flex items-center gap-3 p-3 border-b border-border bg-surface-0">
      {/* Mode group */}
      <div className="flex rounded-lg overflow-hidden border border-border">
        <button
          type="button"
          onClick={() => onModeChange("signin")}
          className={btn(mode === "signin")}
        >
          {t("adminPreview.mode.signin")}
        </button>
        <button
          type="button"
          onClick={() => onModeChange("signup")}
          className={`border-l border-border ${btn(mode === "signup")}`}
        >
          {t("adminPreview.mode.signup")}
        </button>
        <button
          type="button"
          onClick={() => onModeChange("forget")}
          className={`border-l border-border ${btn(mode === "forget")}`}
        >
          {t("adminPreview.mode.forget")}
        </button>
      </div>

      <div className="h-6 w-px bg-border" />

      {/* Device group */}
      <div className="flex rounded-lg overflow-hidden border border-border">
        <button
          type="button"
          aria-label={t("adminPreview.device.desktop")}
          onClick={() => onDeviceChange("desktop")}
          className={`flex items-center gap-1 ${btn(device === "desktop")}`}
        >
          <Monitor size={14} />
          <span className="hidden sm:inline">{t("adminPreview.device.desktop")}</span>
        </button>
        <button
          type="button"
          aria-label={t("adminPreview.device.mobile")}
          onClick={() => onDeviceChange("mobile")}
          className={`flex items-center gap-1 border-l border-border ${btn(device === "mobile")}`}
        >
          <Smartphone size={14} />
          <span className="hidden sm:inline">{t("adminPreview.device.mobile")}</span>
        </button>
      </div>

      <div className="h-6 w-px bg-border" />

      {/* Theme group */}
      <div className="flex rounded-lg overflow-hidden border border-border">
        <button
          type="button"
          aria-label="Light"
          onClick={() => onThemeChange("light")}
          className={btn(theme === "light")}
        >
          <Sun size={14} />
        </button>
        <button
          type="button"
          aria-label="Dark"
          onClick={() => onThemeChange("dark")}
          className={`border-l border-border ${btn(theme === "dark")}`}
        >
          <Moon size={14} />
        </button>
      </div>
    </div>
  );
}
