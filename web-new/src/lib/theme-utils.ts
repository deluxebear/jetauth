export interface ThemeVars {
  "--accent": string;
  "--accent-hover": string;
  "--accent-subtle": string;
  "--shadow-glow": string;
  "--gradient-from": string;
  "--gradient-to": string;
  "--gradient-blob": string;
  "--radius": string;
}

/**
 * Convert a hex color string (#rrggbb or #rgb) to HSL.
 * Returns [h: 0-360, s: 0-100, l: 0-100].
 */
export function hexToHsl(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;

  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));

    if (max === r) {
      h = ((g - b) / delta) % 6;
    } else if (max === g) {
      h = (b - r) / delta + 2;
    } else {
      h = (r - g) / delta + 4;
    }

    h = h * 60;
    if (h < 0) h += 360;
  }

  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}

/**
 * Convert HSL [h: 0-360, s: 0-100, l: 0-100] to a hex color string.
 */
export function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100;
  const ln = l / 100;

  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;

  let r = 0,
    g = 0,
    b = 0;

  if (h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }

  const toHex = (v: number) => {
    const byte = Math.round((v + m) * 255);
    return Math.max(0, Math.min(255, byte)).toString(16).padStart(2, "0");
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Darken a hex color by `amount` percentage points (0-100).
 */
export function darken(hex: string, amount: number): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, s, Math.max(0, l - amount));
}

/**
 * Lighten a hex color by `amount` percentage points (0-100).
 */
export function lighten(hex: string, amount: number): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, s, Math.min(100, l + amount));
}

/**
 * Shift the hue of a hex color by `degrees`.
 */
export function hueShift(hex: string, degrees: number): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(((h + degrees) % 360 + 360) % 360, s, l);
}

/**
 * Desaturate a hex color by `amount` percentage points (0-100).
 */
export function desaturate(hex: string, amount: number): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, Math.max(0, s - amount), l);
}

/**
 * Return an `rgba()` CSS string for the given hex color and alpha (0-1).
 */
export function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;

  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Derive a full set of CSS theme variables from a primary color, theme type, and border radius.
 */
export function deriveThemeVars(
  colorPrimary: string,
  themeType: "dark" | "light",
  borderRadius: number
): ThemeVars {
  const isDark = themeType === "dark";

  // Compute accent
  const accent = isDark
    ? desaturate(lighten(colorPrimary, 15), 5)
    : colorPrimary;

  // Compute accent-hover
  const accentHover = isDark ? lighten(accent, 8) : darken(accent, 12);

  // Compute accent-subtle: accent at 8% opacity
  const accentSubtle = withAlpha(accent, 0.08);

  // Compute shadow-glow
  const glowAlpha = isDark ? 0.15 : 0.08;
  const shadowGlow = `0 0 20px ${withAlpha(accent, glowAlpha)}`;

  // Gradient values
  const gradientFrom = colorPrimary;
  const gradientTo = hueShift(colorPrimary, 30);
  const gradientBlob = hueShift(colorPrimary, -20);

  return {
    "--accent": accent,
    "--accent-hover": accentHover,
    "--accent-subtle": accentSubtle,
    "--shadow-glow": shadowGlow,
    "--gradient-from": gradientFrom,
    "--gradient-to": gradientTo,
    "--gradient-blob": gradientBlob,
    "--radius": `${borderRadius}px`,
  };
}
