package controllers

import (
	"fmt"

	"github.com/deluxebear/jetauth/object"
)

// ResolvedThemePayload is the inner "data" of the resolved theme response.
type ResolvedThemePayload struct {
	Theme object.ThemeData `json:"theme"`
	CSS   string           `json:"css"`
}

// ResolvedThemeResponse is the outer envelope.
type ResolvedThemeResponse struct {
	Status string               `json:"status" example:"ok"`
	Msg    string               `json:"msg" example:""`
	Data   ResolvedThemePayload `json:"data"`
}

// GetResolvedTheme merges system/org/app theme layers and returns the result
// plus a pre-formatted CSS :root variable block.
// @Summary GetResolvedTheme
// @Tags Theme API
// @Description Return the merged theme for an application (system → org → app cascade).
// @Param   app   query   string  true   "application id (e.g. admin/app-foo)"
// @Param   mode  query   string  false  "light | dark (default: light)"
// @Success 200 {object} ResolvedThemeResponse "The Response object"
// @Router /get-resolved-theme [get]
func (c *ApiController) GetResolvedTheme() {
	appID := c.Ctx.Input.Query("app")
	orgParam := c.Ctx.Input.Query("organization")
	if appID == "" && orgParam == "" {
		c.ResponseError("missing required query param: provide 'app' or 'organization'")
		return
	}

	var app *object.Application
	var err error
	if appID != "" {
		app, err = object.GetApplication(appID)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}
		if app == nil {
			c.ResponseError(fmt.Sprintf("application %s does not exist", appID))
			return
		}
	} else {
		app, err = resolveOrgDefaultApplication(orgParam)
		if err != nil {
			c.ResponseError(err.Error())
			return
		}
	}

	var orgTheme *object.ThemeData
	if app.OrganizationObj != nil {
		orgTheme = app.OrganizationObj.ThemeData
	}
	resolved := object.ResolveTheme(orgTheme, app.ThemeData, nil)
	css := buildCSSVariables(resolved)

	c.Data["json"] = ResolvedThemeResponse{
		Status: "ok",
		Data:   ResolvedThemePayload{Theme: resolved, CSS: css},
	}
	c.ServeJSON()
}

// buildCSSVariables serializes a ThemeData into a :root CSS-variable string
// that the frontend can inject directly into a <style> tag.
//
// We emit two flavors of tokens:
//   - New semantic names (--color-primary, --color-cta, …) for future components
//   - Legacy names (--accent, --accent-hover, --accent-subtle) to override the
//     defaults baked into web/src/index.css so existing Tailwind classes
//     (bg-accent, text-accent) pick up the org theme without refactoring.
//
// Any empty optional color falls back to ColorPrimary so a minimal org config
// (just colorPrimary set) paints every surface consistently.
func buildCSSVariables(t object.ThemeData) string {
	primary := t.ColorPrimary
	cta := nonEmpty(t.ColorCTA, primary)
	accentHover := darkenHex(primary, 0.12) // ~12% darker for hover
	accentSubtle := hexToRGBA(primary, 0.10)

	lines := []string{
		// Semantic tokens (new API).
		fmt.Sprintf("--color-primary: %s;", primary),
		fmt.Sprintf("--color-cta: %s;", cta),
		fmt.Sprintf("--color-success: %s;", t.ColorSuccess),
		fmt.Sprintf("--color-danger: %s;", t.ColorDanger),
		fmt.Sprintf("--color-warning: %s;", t.ColorWarning),
		fmt.Sprintf("--color-primary-dark: %s;", t.DarkColorPrimary),
		fmt.Sprintf("--color-background-dark: %s;", t.DarkBackground),
		fmt.Sprintf("--radius-md: %dpx;", t.BorderRadius),
		fmt.Sprintf("--radius-lg: %dpx;", t.BorderRadius+4),
		fmt.Sprintf("--font-sans: %s;", t.FontFamily),
		fmt.Sprintf("--font-mono: %s;", t.FontFamilyMono),
		fmt.Sprintf("--spacing-scale: %g;", t.SpacingScale),
		// Legacy overrides so existing Tailwind `bg-accent`, `text-accent`,
		// `hover:bg-accent-hover`, etc. reflect the resolved theme.
		fmt.Sprintf("--accent: %s;", primary),
		fmt.Sprintf("--accent-hover: %s;", accentHover),
		fmt.Sprintf("--accent-subtle: %s;", accentSubtle),
		fmt.Sprintf("--color-accent: %s;", primary),
		fmt.Sprintf("--color-accent-hover: %s;", accentHover),
		fmt.Sprintf("--color-accent-subtle: %s;", accentSubtle),
	}
	out := ":root {\n"
	for _, l := range lines {
		out += "  " + l + "\n"
	}
	out += "}\n"
	return out
}

// darkenHex darkens a #RRGGBB color by pulling each channel toward 0 by the
// given fraction (0.0 = no change, 1.0 = pure black). Used to derive a hover
// state color from the primary. Invalid input returns the original string.
func darkenHex(hex string, fraction float64) string {
	if len(hex) != 7 || hex[0] != '#' {
		return hex
	}
	parse := func(s string) int {
		v, ok := parseHexByte(s)
		if !ok {
			return -1
		}
		return v
	}
	r, g, b := parse(hex[1:3]), parse(hex[3:5]), parse(hex[5:7])
	if r < 0 || g < 0 || b < 0 {
		return hex
	}
	darken := func(v int) int {
		out := int(float64(v) * (1.0 - fraction))
		if out < 0 {
			out = 0
		}
		return out
	}
	return fmt.Sprintf("#%02X%02X%02X", darken(r), darken(g), darken(b))
}

// hexToRGBA converts #RRGGBB to "rgba(r, g, b, alpha)" with the given alpha.
// Invalid input returns a transparent fallback.
func hexToRGBA(hex string, alpha float64) string {
	if len(hex) != 7 || hex[0] != '#' {
		return "rgba(0, 0, 0, 0)"
	}
	r, rOK := parseHexByte(hex[1:3])
	g, gOK := parseHexByte(hex[3:5])
	b, bOK := parseHexByte(hex[5:7])
	if !rOK || !gOK || !bOK {
		return "rgba(0, 0, 0, 0)"
	}
	return fmt.Sprintf("rgba(%d, %d, %d, %g)", r, g, b, alpha)
}

func parseHexByte(s string) (int, bool) {
	if len(s) != 2 {
		return 0, false
	}
	n := 0
	for i := 0; i < 2; i++ {
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
			return 0, false
		}
	}
	return n, true
}

func nonEmpty(a, b string) string {
	if a != "" {
		return a
	}
	return b
}
