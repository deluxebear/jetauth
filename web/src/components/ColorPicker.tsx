import { useEffect, useState } from "react";
import { useTranslation } from "../i18n";

interface ColorPickerProps {
  value: string;                 // "#RRGGBB"
  onChange: (hex: string) => void;
  /** Optional: 8 curated palette colors. Sensible default if omitted. */
  palette?: string[];
}

const DEFAULT_PALETTE = [
  "#2563EB", // blue
  "#4F46E5", // indigo
  "#7C3AED", // purple
  "#E11D48", // rose
  "#F97316", // orange
  "#D97706", // amber
  "#059669", // emerald
  "#0891B2", // teal
];

const HEX_RE = /^#?[0-9a-f]{6}$/i;

/** Parse "#RRGGBB" or "RRGGBB" into [r,g,b]. Returns null on bad input. */
function parseHex(hex: string): [number, number, number] | null {
  const clean = hex.replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(clean)) return null;
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => v.toString(16).padStart(2, "0").toUpperCase();
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** HSL ↔ RGB conversion (values 0-360, 0-100, 0-100 ↔ 0-255 x3). */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const val = l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return Math.round(val * 255);
  };
  return [f(0), f(8), f(4)];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(l * 100)];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
    case g: h = ((b - r) / d + 2); break;
    default: h = ((r - g) / d + 4);
  }
  return [Math.round(h * 60), Math.round(s * 100), Math.round(l * 100)];
}

/** WCAG relative luminance (0-1). */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two sRGB colors. */
export function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * ColorPicker with:
 *   - Row of 8 curated palette presets (click to set)
 *   - HSL sliders for fine control
 *   - Hex input with live validation
 *   - WCAG contrast badge vs #FFFFFF and #000000 (AA ≥ 4.5, AAA ≥ 7)
 *
 * Controlled component. Parent supplies `value` + `onChange`.
 */
export default function ColorPicker({ value, onChange, palette }: ColorPickerProps) {
  const { t } = useTranslation();
  const [hexInput, setHexInput] = useState(value);
  const [hexError, setHexError] = useState(false);

  useEffect(() => {
    setHexInput(value);
    setHexError(false);
  }, [value]);

  const rgb = parseHex(value) ?? ([37, 99, 235] as [number, number, number]);
  const [h, s, l] = rgbToHsl(...rgb);
  const whiteContrast = contrastRatio(rgb, [255, 255, 255]);
  const blackContrast = contrastRatio(rgb, [0, 0, 0]);

  const commitHex = (raw: string) => {
    setHexInput(raw);
    if (HEX_RE.test(raw)) {
      setHexError(false);
      const normalized = raw.startsWith("#") ? raw.toUpperCase() : `#${raw.toUpperCase()}`;
      if (normalized !== value) onChange(normalized);
    } else {
      setHexError(true);
    }
  };

  const commitHsl = (newH: number, newS: number, newL: number) => {
    const [r, g, b] = hslToRgb(newH, newS, newL);
    onChange(rgbToHex(r, g, b));
  };

  const badge = (ratio: number) => {
    const level = ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : "Fail";
    const color = level === "Fail" ? "text-danger" : "text-success";
    return <span className={`text-[10px] font-mono ${color}`}>{ratio.toFixed(1)} {level}</span>;
  };

  return (
    <div className="space-y-3">
      {/* Palette row */}
      <div>
        <label className="block text-[12px] font-medium text-text-secondary mb-1.5">
          {t("colorPicker.paletteLabel")}
        </label>
        <div className="flex gap-1.5 flex-wrap">
          {(palette ?? DEFAULT_PALETTE).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange(c)}
              aria-label={c}
              style={{ backgroundColor: c }}
              className={`h-7 w-7 rounded-md border-2 transition-transform hover:scale-110 ${
                value.toLowerCase() === c.toLowerCase() ? "border-text-primary" : "border-border"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Hex + Preview */}
      <div className="flex items-center gap-2">
        <div
          style={{ backgroundColor: value }}
          className="h-10 w-10 rounded-lg border border-border flex-shrink-0"
        />
        <div className="flex-1">
          <label className="block text-[12px] font-medium text-text-secondary mb-1.5">
            {t("colorPicker.hexLabel")}
          </label>
          <input
            type="text"
            value={hexInput}
            onChange={(e) => commitHex(e.target.value)}
            className={`w-full rounded-lg border ${
              hexError ? "border-danger" : "border-border"
            } bg-surface-1 px-3 py-2 text-[13px] font-mono text-text-primary focus:ring-1 focus:ring-accent/30 outline-none`}
            placeholder="#2563EB"
          />
        </div>
      </div>

      {/* HSL sliders */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-[11px] text-text-muted mb-1">{t("colorPicker.hueLabel")}</label>
          <input
            type="range" min={0} max={360} value={h}
            onChange={(e) => commitHsl(Number(e.target.value), s, l)}
            className="w-full accent-accent"
          />
          <div className="text-[10px] font-mono text-text-muted text-center">{h}°</div>
        </div>
        <div>
          <label className="block text-[11px] text-text-muted mb-1">{t("colorPicker.saturationLabel")}</label>
          <input
            type="range" min={0} max={100} value={s}
            onChange={(e) => commitHsl(h, Number(e.target.value), l)}
            className="w-full accent-accent"
          />
          <div className="text-[10px] font-mono text-text-muted text-center">{s}%</div>
        </div>
        <div>
          <label className="block text-[11px] text-text-muted mb-1">{t("colorPicker.lightnessLabel")}</label>
          <input
            type="range" min={0} max={100} value={l}
            onChange={(e) => commitHsl(h, s, Number(e.target.value))}
            className="w-full accent-accent"
          />
          <div className="text-[10px] font-mono text-text-muted text-center">{l}%</div>
        </div>
      </div>

      {/* Contrast badges */}
      <div className="flex items-center justify-between text-[11px] text-text-muted pt-1">
        <span>{t("colorPicker.contrastLabel")}</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-sm bg-white border border-border" />
            {badge(whiteContrast)}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-sm bg-black" />
            {badge(blackContrast)}
          </span>
        </div>
      </div>
    </div>
  );
}
