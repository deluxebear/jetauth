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
	if appID == "" {
		c.ResponseError("missing required query param: app")
		return
	}

	app, err := object.GetApplication(appID)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	if app == nil {
		c.ResponseError(fmt.Sprintf("application %s does not exist", appID))
		return
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
func buildCSSVariables(t object.ThemeData) string {
	lines := []string{
		fmt.Sprintf("--color-primary: %s;", t.ColorPrimary),
		fmt.Sprintf("--color-cta: %s;", nonEmpty(t.ColorCTA, t.ColorPrimary)),
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
	}
	out := ":root {\n"
	for _, l := range lines {
		out += "  " + l + "\n"
	}
	out += "}\n"
	return out
}

func nonEmpty(a, b string) string {
	if a != "" {
		return a
	}
	return b
}
