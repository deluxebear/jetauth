import { Check } from "lucide-react";
import type { ThemePreset } from "../theme-presets";
import { useTranslation } from "../i18n";

interface ThemePresetCardProps {
  preset: ThemePreset;
  selected: boolean;
  onClick: () => void;
}

export default function ThemePresetCard({ preset, selected, onClick }: ThemePresetCardProps) {
  const { t } = useTranslation();
  const { palette, themeData } = preset;
  const isDark = themeData.themeType === "dark";
  const radius = `${themeData.borderRadius}px`;

  const bgColor = isDark ? "#0f1117" : "#ffffff";
  const surfaceColor = isDark ? "#1e2231" : "#f0f2f5";
  const borderColor = isDark ? "#2a3040" : "#dfe2ea";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col items-center gap-2 p-2 rounded-xl border-2 transition-all duration-200 hover:scale-[1.03] hover:shadow-lg cursor-pointer ${
        selected
          ? "border-accent shadow-md bg-accent-subtle"
          : "border-border-subtle hover:border-border bg-surface-1"
      }`}
      style={{ width: 130 }}
    >
      {/* Mini login page thumbnail */}
      <div
        className="w-full aspect-[4/3] rounded-lg overflow-hidden flex"
        style={{ border: `1px solid ${borderColor}` }}
      >
        {/* Left gradient panel */}
        <div
          className="w-[40%] h-full"
          style={{
            background: `linear-gradient(135deg, ${palette.gradientFrom}, ${palette.gradientTo})`,
          }}
        />
        {/* Right form panel */}
        <div className="flex-1 flex flex-col justify-center gap-1.5 px-2 py-2" style={{ background: bgColor }}>
          <div className="h-2 w-full" style={{ background: surfaceColor, borderRadius: radius }} />
          <div className="h-2 w-full" style={{ background: surfaceColor, borderRadius: radius }} />
          <div
            className="h-2.5 w-full mt-0.5"
            style={{
              background: isDark ? palette.accentDark : palette.accentLight,
              borderRadius: radius,
            }}
          />
        </div>
      </div>

      {/* Label */}
      <span className={`text-[12px] font-medium ${selected ? "text-accent" : "text-text-secondary"}`}>
        {t(preset.nameKey as any)}
      </span>

      {/* Checkmark badge */}
      {selected && (
        <div className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-accent flex items-center justify-center shadow-sm">
          <Check size={12} className="text-white" strokeWidth={3} />
        </div>
      )}
    </button>
  );
}
