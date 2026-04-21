package object

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestThemeData_BackwardCompatibleJSON(t *testing.T) {
	oldJSON := `{"themeType":"default","colorPrimary":"#2563EB","borderRadius":8,"isCompact":false,"isEnabled":true}`
	var td ThemeData
	if err := json.Unmarshal([]byte(oldJSON), &td); err != nil {
		t.Fatalf("unmarshal old JSON: %v", err)
	}
	if td.ColorPrimary != "#2563EB" || td.BorderRadius != 8 {
		t.Fatalf("old fields not preserved: %+v", td)
	}
	if td.ColorCTA != "" || td.FontFamily != "" || td.SpacingScale != 0 {
		t.Fatalf("new fields should zero-default: %+v", td)
	}
	if td.IsCompact == nil || *td.IsCompact != false {
		t.Fatalf("isCompact=false in JSON should unmarshal to &false: %+v", td)
	}
}

func TestThemeData_NewFieldsSerialize(t *testing.T) {
	td := ThemeData{
		ColorPrimary:     "#000",
		ColorCTA:         "#F97316",
		DarkColorPrimary: "#60A5FA",
		FontFamily:       "Inter",
		SpacingScale:     0.875,
		IsEnabled:        true,
	}
	b, err := json.Marshal(td)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	out := string(b)
	for _, want := range []string{`"colorCTA":"#F97316"`, `"darkColorPrimary":"#60A5FA"`, `"fontFamily":"Inter"`, `"spacingScale":0.875`} {
		if !strings.Contains(out, want) {
			t.Errorf("serialized output missing %s: %s", want, out)
		}
	}
}

func TestApplication_SigninMethodMode_BackwardCompatibleJSON(t *testing.T) {
	oldJSON := `{"owner":"admin","name":"app-test","orgChoiceMode":"None"}`
	var app Application
	if err := json.Unmarshal([]byte(oldJSON), &app); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if app.SigninMethodMode != "" {
		t.Errorf("SigninMethodMode should zero-default to empty, got %q", app.SigninMethodMode)
	}
}

func TestResolveTheme_SystemOnly(t *testing.T) {
	got := ResolveTheme(nil, nil, nil)
	if got.ColorPrimary == "" || got.FontFamily == "" {
		t.Fatalf("system defaults should always populate core tokens: %+v", got)
	}
}

func TestResolveTheme_OrgOverridesSystem(t *testing.T) {
	org := &ThemeData{ColorPrimary: "#FF0000", IsEnabled: true}
	got := ResolveTheme(org, nil, nil)
	if got.ColorPrimary != "#FF0000" {
		t.Errorf("org ColorPrimary should win; got %s", got.ColorPrimary)
	}
}

func TestResolveTheme_OrgNotEnabledIsIgnored(t *testing.T) {
	org := &ThemeData{ColorPrimary: "#FF0000", IsEnabled: false}
	got := ResolveTheme(org, nil, nil)
	if got.ColorPrimary == "#FF0000" {
		t.Errorf("org with IsEnabled=false should be ignored")
	}
}

func TestResolveTheme_AppOverridesOrg(t *testing.T) {
	org := &ThemeData{ColorPrimary: "#FF0000", FontFamily: "Roboto", IsEnabled: true}
	app := &ThemeData{ColorPrimary: "#00FF00", IsEnabled: true}
	got := ResolveTheme(org, app, nil)
	if got.ColorPrimary != "#00FF00" {
		t.Errorf("app ColorPrimary should win; got %s", got.ColorPrimary)
	}
	if got.FontFamily != "Roboto" {
		t.Errorf("org FontFamily should fall through when app didn't set it; got %s", got.FontFamily)
	}
}

func TestResolveTheme_PreviewOverridesAll(t *testing.T) {
	org := &ThemeData{ColorPrimary: "#FF0000", IsEnabled: true}
	app := &ThemeData{ColorPrimary: "#00FF00", IsEnabled: true}
	preview := &ThemeData{ColorPrimary: "#0000FF", IsEnabled: true}
	got := ResolveTheme(org, app, preview)
	if got.ColorPrimary != "#0000FF" {
		t.Errorf("preview ColorPrimary should win; got %s", got.ColorPrimary)
	}
}

func TestResolveTheme_DarkDerivedWhenUnset(t *testing.T) {
	org := &ThemeData{ColorPrimary: "#2563EB", IsEnabled: true}
	got := ResolveTheme(org, nil, nil)
	if got.DarkColorPrimary == "" {
		t.Errorf("DarkColorPrimary should be auto-derived when unset")
	}
	if got.DarkColorPrimary == got.ColorPrimary {
		t.Errorf("DarkColorPrimary should differ from light ColorPrimary")
	}
}

func TestResolveTheme_PreviewAppliesEvenWithIsEnabledUnset(t *testing.T) {
	// Admin live-preview typically constructs a partial ThemeData from form state
	// and doesn't bother to set IsEnabled. Preview must still override.
	org := &ThemeData{ColorPrimary: "#FF0000", IsEnabled: true}
	app := &ThemeData{ColorPrimary: "#00FF00", IsEnabled: true}
	preview := &ThemeData{ColorPrimary: "#0000FF"} // note: IsEnabled=false (zero value)
	got := ResolveTheme(org, app, preview)
	if got.ColorPrimary != "#0000FF" {
		t.Errorf("preview ColorPrimary must win even when IsEnabled=false; got %s", got.ColorPrimary)
	}
}

func TestSignupItem_BackwardCompatibleJSON(t *testing.T) {
	oldJSON := `{"name":"Email","visible":true,"required":true,"type":"text","label":"Email","placeholder":"email@example.com","regex":"^\\S+@\\S+$","rule":"All"}`
	var si SignupItem
	if err := json.Unmarshal([]byte(oldJSON), &si); err != nil {
		t.Fatalf("unmarshal old JSON: %v", err)
	}
	if si.Name != "Email" || !si.Visible || !si.Required {
		t.Fatalf("old fields not preserved: %+v", si)
	}
	if si.Helper != "" || si.Group != "" || si.Step != 0 || si.ValidationMessage != nil {
		t.Fatalf("new fields should zero-default: %+v", si)
	}
}

func TestSignupItem_NewFieldsSerialize(t *testing.T) {
	si := SignupItem{
		Name:              "EmployeeId",
		Helper:            "Your assigned employee number",
		Group:             "work",
		Step:              2,
		ValidationMessage: map[string]string{"en": "Invalid format", "zh": "格式错误"},
	}
	b, err := json.Marshal(si)
	if err != nil {
		t.Fatal(err)
	}
	out := string(b)
	for _, want := range []string{`"helper":"Your assigned employee number"`, `"group":"work"`, `"step":2`, `"validationMessage":`, `"en":"Invalid format"`} {
		if !strings.Contains(out, want) {
			t.Errorf("serialized output missing %s: %s", want, out)
		}
	}
}
