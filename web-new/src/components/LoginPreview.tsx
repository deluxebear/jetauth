import { ShieldCheck } from "lucide-react";
import { useTranslation } from "../i18n";
import { deriveThemeVars } from "../lib/theme-utils";

interface LoginPreviewProps {
  colorPrimary: string;
  themeType: string;
  borderRadius: number;
}

export default function LoginPreview({ colorPrimary, themeType, borderRadius }: LoginPreviewProps) {
  const { t } = useTranslation();
  const isDark = themeType === "dark";
  const vars = deriveThemeVars(colorPrimary, themeType, borderRadius);
  const radius = `${borderRadius}px`;

  const bgColor = isDark ? "#0f1117" : "#ffffff";
  const surfaceBg = isDark ? "#161923" : "#f8f9fb";
  const inputBg = isDark ? "#1e2231" : "#f0f2f5";
  const borderColor = isDark ? "#2a3040" : "#dfe2ea";
  const textPrimary = isDark ? "#e8eaf0" : "#111827";
  const textSecondary = isDark ? "#8b93a8" : "#4b5563";
  const textMuted = isDark ? "#555d73" : "#9ca3af";

  return (
    <div
      className="w-full rounded-xl overflow-hidden border border-border"
      style={{ maxWidth: 480, aspectRatio: "5 / 3" }}
    >
      <div className="flex h-full">
        {/* Left branding panel */}
        <div
          className="w-[42%] relative overflow-hidden flex items-center justify-center"
          style={{ background: surfaceBg }}
        >
          <div
            className="absolute top-[20%] left-[25%] h-24 w-24 rounded-full blur-[40px] opacity-30"
            style={{ background: vars["--gradient-from"] }}
          />
          <div
            className="absolute bottom-[25%] right-[20%] h-20 w-20 rounded-full blur-[35px] opacity-20"
            style={{ background: vars["--gradient-to"] }}
          />
          <div className="relative z-10 flex flex-col items-center gap-2">
            <div
              className="h-8 w-8 rounded-lg flex items-center justify-center"
              style={{ background: `${vars["--accent"]}20`, border: `1px solid ${vars["--accent"]}30` }}
            >
              <ShieldCheck size={16} style={{ color: vars["--accent"] }} />
            </div>
            <div className="text-[10px] font-bold" style={{ color: textPrimary }}>
              JetAuth
            </div>
            <div className="text-[7px] font-mono uppercase tracking-wider" style={{ color: textMuted }}>
              Identity Platform
            </div>
          </div>
        </div>

        {/* Right form panel */}
        <div className="flex-1 flex flex-col justify-center px-5 py-4" style={{ background: bgColor }}>
          <div className="text-[11px] font-bold mb-0.5" style={{ color: textPrimary }}>
            {t("login.title")}
          </div>
          <div className="text-[7px] mb-3" style={{ color: textMuted }}>
            {t("login.subtitle")}
          </div>

          <div className="mb-1.5">
            <div className="text-[6px] mb-0.5" style={{ color: textSecondary }}>
              {t("login.username")}
            </div>
            <div
              className="h-4 w-full"
              style={{ background: inputBg, borderRadius: radius, border: `1px solid ${borderColor}` }}
            />
          </div>

          <div className="mb-2">
            <div className="text-[6px] mb-0.5" style={{ color: textSecondary }}>
              {t("login.password")}
            </div>
            <div
              className="h-4 w-full"
              style={{ background: inputBg, borderRadius: radius, border: `1px solid ${borderColor}` }}
            />
          </div>

          <div
            className="h-[18px] w-full flex items-center justify-center"
            style={{
              background: vars["--accent"],
              borderRadius: radius,
            }}
          >
            <span className="text-[7px] font-semibold text-white">{t("login.submit")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
