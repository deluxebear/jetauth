package object

// boolPtr returns a pointer to the given bool value.
func boolPtr(b bool) *bool { return &b }

// systemDefaultTheme is the baseline every resolved theme starts from.
// Chosen for WCAG AA contrast and professional SaaS aesthetic.
var systemDefaultTheme = ThemeData{
	ThemeType:      "default",
	ColorPrimary:   "#2563EB",
	ColorCTA:       "#F97316",
	ColorSuccess:   "#16A34A",
	ColorDanger:    "#DC2626",
	ColorWarning:   "#D97706",
	DarkBackground: "#0F1117",
	BorderRadius:   8,
	IsCompact:      boolPtr(false),
	IsEnabled:      true,
	FontFamily:     "Inter, system-ui, sans-serif",
	FontFamilyMono: "JetBrains Mono, ui-monospace, monospace",
	SpacingScale:   1.0,
}

// ResolveTheme merges (system → org → app → preview) layers, with each layer's
// non-zero fields overriding the one beneath. A layer whose IsEnabled == false
// is skipped entirely (legacy Casdoor semantics). Preview is always applied
// when non-nil — it is ephemeral admin input, not a persisted layer with
// lifecycle semantics. DarkColorPrimary is auto-derived from ColorPrimary when unset.
func ResolveTheme(org, app, preview *ThemeData) ThemeData {
	out := systemDefaultTheme
	for _, layer := range []*ThemeData{org, app} {
		if layer == nil || !layer.IsEnabled {
			continue
		}
		out = mergeThemeLayer(out, *layer)
	}
	// Preview is always applied when present — it is ephemeral admin input,
	// not a persisted layer with lifecycle semantics.
	if preview != nil {
		out = mergeThemeLayer(out, *preview)
	}
	if out.DarkColorPrimary == "" {
		out.DarkColorPrimary = deriveDarkColor(out.ColorPrimary)
	}
	return out
}

// mergeThemeLayer overlays `over` on `base`, keeping `base` values wherever
// `over` has a zero value. IsEnabled is always taken from `over` (callers are
// expected to have already checked it before calling this).
func mergeThemeLayer(base, over ThemeData) ThemeData {
	out := base
	if over.ThemeType != "" {
		out.ThemeType = over.ThemeType
	}
	if over.ColorPrimary != "" {
		out.ColorPrimary = over.ColorPrimary
	}
	if over.ColorCTA != "" {
		out.ColorCTA = over.ColorCTA
	}
	if over.ColorSuccess != "" {
		out.ColorSuccess = over.ColorSuccess
	}
	if over.ColorDanger != "" {
		out.ColorDanger = over.ColorDanger
	}
	if over.ColorWarning != "" {
		out.ColorWarning = over.ColorWarning
	}
	if over.DarkColorPrimary != "" {
		out.DarkColorPrimary = over.DarkColorPrimary
	}
	if over.DarkBackground != "" {
		out.DarkBackground = over.DarkBackground
	}
	if over.FontFamily != "" {
		out.FontFamily = over.FontFamily
	}
	if over.FontFamilyMono != "" {
		out.FontFamilyMono = over.FontFamilyMono
	}
	if over.BorderRadius != 0 {
		out.BorderRadius = over.BorderRadius
	}
	if over.SpacingScale != 0 {
		out.SpacingScale = over.SpacingScale
	}
	// IsCompact is *bool — nil means "inherit from lower layer"; non-nil means
	// the caller explicitly set a value (including false).
	if over.IsCompact != nil {
		out.IsCompact = over.IsCompact
	}
	out.IsEnabled = true
	return out
}

// deriveDarkColor shifts a hex color toward the typical dark-mode pairing:
// slightly lighter + lower saturation. Rough HSL transform done in hex.
// This is intentionally approximate — admins can override explicitly via
// DarkColorPrimary when they need exact brand consistency.
func deriveDarkColor(hex string) string {
	if len(hex) != 7 || hex[0] != '#' {
		return "#60A5FA" // safe default (Tailwind blue-400)
	}
	parse := func(s string) int {
		n := 0
		for i := 0; i < len(s); i++ {
			c := s[i]
			n *= 16
			switch {
			case c >= '0' && c <= '9':
				n += int(c - '0')
			case c >= 'a' && c <= 'f':
				n += int(c-'a') + 10
			case c >= 'A' && c <= 'F':
				n += int(c-'A') + 10
			default:
				return -1
			}
		}
		return n
	}
	r := parse(hex[1:3])
	g := parse(hex[3:5])
	b := parse(hex[5:7])
	if r < 0 || g < 0 || b < 0 {
		return "#60A5FA"
	}
	// Lighten by pulling each channel 40% of the way toward 255.
	lighten := func(v int) int { return v + (255-v)*2/5 }
	r, g, b = lighten(r), lighten(g), lighten(b)
	return "#" + toHex(r) + toHex(g) + toHex(b)
}

func toHex(n int) string {
	const d = "0123456789ABCDEF"
	return string([]byte{d[n>>4&0xF], d[n&0xF]})
}
