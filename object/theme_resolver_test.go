package object

import (
	"encoding/json"
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
		if !testContains(out, want) {
			t.Errorf("serialized output missing %s: %s", want, out)
		}
	}
}

func testContains(s, sub string) bool { return len(s) >= len(sub) && testIndexOf(s, sub) >= 0 }
func testIndexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
