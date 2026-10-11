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

func TestSanitizeApplicationHtml_FormSideHtmlAndCustomItems(t *testing.T) {
	app := &Application{
		FormSideHtml: `<p>side</p><img src=x onerror=alert(1)><svg/onload=alert(1)>`,
		SigninItems: []*SigninItem{
			{Name: "Username", Label: "Name & email"},
			{Name: "Promo", IsCustom: true, Label: `<b>hi</b><a href="java&#115;cript:alert(1)">x</a>`},
			nil,
		},
		ForgetItems: []*SigninItem{
			{Name: "Notice", IsCustom: true, Label: `<script>alert(1)</script>ok`},
		},
	}
	sanitizeApplicationHtml(app)

	for _, bad := range []string{"onerror", "onload", "<svg"} {
		if strings.Contains(strings.ToLower(app.FormSideHtml), bad) {
			t.Errorf("FormSideHtml should strip %q, got %q", bad, app.FormSideHtml)
		}
	}
	if !strings.Contains(app.FormSideHtml, "<p>side</p>") {
		t.Errorf("FormSideHtml should keep safe markup, got %q", app.FormSideHtml)
	}
	if got := app.SigninItems[0].Label; got != "Name & email" {
		t.Errorf("built-in item label must stay plain text, got %q", got)
	}
	promo := app.SigninItems[1].Label
	if strings.Contains(strings.ToLower(promo), "javascript") || strings.Contains(promo, "&#115;") {
		t.Errorf("custom signin label should drop the javascript: link, got %q", promo)
	}
	if !strings.Contains(promo, "<b>hi</b>") {
		t.Errorf("custom signin label should keep safe markup, got %q", promo)
	}
	if got := app.ForgetItems[0].Label; strings.Contains(got, "<script") {
		t.Errorf("custom forget label should strip <script>, got %q", got)
	}
}
