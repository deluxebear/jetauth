package object

import (
	"strings"
	"testing"
)

func TestSanitizeApplicationHtml_StripsScript(t *testing.T) {
	app := &Application{
		HeaderHtml: `<p>ok</p><script>alert(1)</script>`,
		FooterHtml: `<span onclick="bad()">x</span>`,
		SigninHtml: `<iframe src="https://evil"></iframe><b>keep</b>`,
		SignupHtml: `<a href="javascript:alert(1)">click</a>`,
	}
	sanitizeApplicationHtml(app)

	if strings.Contains(app.HeaderHtml, "<script") || strings.Contains(app.HeaderHtml, "alert") {
		t.Errorf("HeaderHtml should strip <script>, got %q", app.HeaderHtml)
	}
	if strings.Contains(app.FooterHtml, "onclick") {
		t.Errorf("FooterHtml should strip onclick, got %q", app.FooterHtml)
	}
	if strings.Contains(app.SigninHtml, "<iframe") {
		t.Errorf("SigninHtml should strip <iframe>, got %q", app.SigninHtml)
	}
	if !strings.Contains(app.SigninHtml, "<b>keep</b>") {
		t.Errorf("SigninHtml should preserve safe <b>, got %q", app.SigninHtml)
	}
	if strings.Contains(strings.ToLower(app.SignupHtml), "javascript:") {
		t.Errorf("SignupHtml should strip javascript: URLs, got %q", app.SignupHtml)
	}
}

func TestSanitizeApplicationHtml_PreservesSafeAnchors(t *testing.T) {
	app := &Application{
		HeaderHtml: `<a href="https://example.com">ok</a>`,
	}
	sanitizeApplicationHtml(app)
	if !strings.Contains(app.HeaderHtml, `href="https://example.com"`) {
		t.Errorf("expected safe anchor href preserved, got %q", app.HeaderHtml)
	}
	if !strings.Contains(app.HeaderHtml, `>ok</a>`) {
		t.Errorf("expected anchor body preserved, got %q", app.HeaderHtml)
	}
}

func TestSanitizeApplicationHtml_NilSafe(t *testing.T) {
	// must not panic
	sanitizeApplicationHtml(nil)
}
