export interface ThemeData {
  themeType: string;
  colorPrimary: string;
  borderRadius: number;
  isCompact: boolean;
  isEnabled: boolean;
}

export interface ThemePreset {
  key: string;
  nameKey: string; // i18n key
  themeData: Omit<ThemeData, "isEnabled">;
  palette: {
    accentLight: string;
    accentDark: string;
    gradientFrom: string;
    gradientTo: string;
  };
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    key: "aurora",
    nameKey: "theme.preset.aurora",
    themeData: {
      themeType: "light",
      colorPrimary: "#0891b2",
      borderRadius: 8,
      isCompact: false,
    },
    palette: {
      accentLight: "#0891b2",
      accentDark: "#06b6d4",
      gradientFrom: "#0891b2",
      gradientTo: "#14b8a6",
    },
  },
  {
    key: "volcano",
    nameKey: "theme.preset.volcano",
    themeData: {
      themeType: "light",
      colorPrimary: "#ea580c",
      borderRadius: 12,
      isCompact: false,
    },
    palette: {
      accentLight: "#ea580c",
      accentDark: "#f97316",
      gradientFrom: "#ea580c",
      gradientTo: "#f59e0b",
    },
  },
  {
    key: "forest",
    nameKey: "theme.preset.forest",
    themeData: {
      themeType: "light",
      colorPrimary: "#059669",
      borderRadius: 6,
      isCompact: false,
    },
    palette: {
      accentLight: "#059669",
      accentDark: "#34d399",
      gradientFrom: "#059669",
      gradientTo: "#14b8a6",
    },
  },
  {
    key: "cosmos",
    nameKey: "theme.preset.cosmos",
    themeData: {
      themeType: "dark",
      colorPrimary: "#7c3aed",
      borderRadius: 10,
      isCompact: false,
    },
    palette: {
      accentLight: "#7c3aed",
      accentDark: "#a78bfa",
      gradientFrom: "#7c3aed",
      gradientTo: "#4f46e5",
    },
  },
  {
    key: "coral",
    nameKey: "theme.preset.coral",
    themeData: {
      themeType: "light",
      colorPrimary: "#e11d48",
      borderRadius: 14,
      isCompact: false,
    },
    palette: {
      accentLight: "#e11d48",
      accentDark: "#fb7185",
      gradientFrom: "#e11d48",
      gradientTo: "#ec4899",
    },
  },
];

export function matchPreset(themeData: Omit<ThemeData, "isEnabled">): string | null {
  for (const preset of THEME_PRESETS) {
    if (
      preset.themeData.themeType === themeData.themeType &&
      preset.themeData.colorPrimary === themeData.colorPrimary &&
      preset.themeData.borderRadius === themeData.borderRadius &&
      preset.themeData.isCompact === themeData.isCompact
    ) {
      return preset.key;
    }
  }
  return null;
}
