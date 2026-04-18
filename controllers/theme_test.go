package controllers

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/deluxebear/jetauth/object"
)

func TestBuildCSSVariables_ContainsCoreTokens(t *testing.T) {
	theme := object.ThemeData{
		ColorPrimary: "#2563EB",
		ColorCTA:     "#F97316",
		BorderRadius: 12,
		FontFamily:   "Inter",
	}
	css := buildCSSVariables(theme)
	for _, want := range []string{
		"--color-primary: #2563EB",
		"--color-cta: #F97316",
		"--radius-md: 12px",
		"--font-sans: Inter",
	} {
		if !strings.Contains(css, want) {
			t.Errorf("css output missing %q:\n%s", want, css)
		}
	}
}

func TestBuildCSSVariables_CTAFallsBackToPrimary(t *testing.T) {
	theme := object.ThemeData{ColorPrimary: "#ABC"} // ColorCTA empty
	css := buildCSSVariables(theme)
	if !strings.Contains(css, "--color-cta: #ABC") {
		t.Errorf("CTA should fall back to primary when empty; got:\n%s", css)
	}
}

func TestResolvedThemeResponse_Serialization(t *testing.T) {
	resp := ResolvedThemeResponse{
		Status: "ok",
		Data: ResolvedThemePayload{
			Theme: object.ThemeData{ColorPrimary: "#000"},
			CSS:   "--color-primary: #000;",
		},
	}
	b, err := json.Marshal(resp)
	if err != nil {
		t.Fatal(err)
	}
	s := string(b)
	if !strings.Contains(s, `"theme":`) || !strings.Contains(s, `"css":`) {
		t.Errorf("response shape wrong: %s", s)
	}
}
