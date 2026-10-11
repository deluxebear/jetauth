package object

import "github.com/microcosm-cc/bluemonday"

// htmlSanitizer is the shared policy used to scrub the admin-editable HTML
// on Application (headerHtml / footerHtml / signinHtml / signupHtml /
// forgetHtml / formSideHtml, plus the labels of custom signin / forget items)
// before it's persisted. Paired with the
// frontend DOMPurify policy in web/src/auth/shell/SafeHtml.tsx —
// defense in depth: admins may paste raw HTML, we strip dangerous
// constructs both on save and on render.
var htmlSanitizer = func() *bluemonday.Policy {
	p := bluemonday.UGCPolicy()
	p.AllowStyling()
	p.AllowAttrs("class", "id", "style").Globally()
	p.AllowStandardURLs()
	return p
}()

// sanitizeApplicationHtml scrubs the HTML fields in place. Safe to
// call on a nil Application (no-op).
func sanitizeApplicationHtml(a *Application) {
	if a == nil {
		return
	}
	a.HeaderHtml = htmlSanitizer.Sanitize(a.HeaderHtml)
	a.FooterHtml = htmlSanitizer.Sanitize(a.FooterHtml)
	a.SigninHtml = htmlSanitizer.Sanitize(a.SigninHtml)
	a.SignupHtml = htmlSanitizer.Sanitize(a.SignupHtml)
	a.ForgetHtml = htmlSanitizer.Sanitize(a.ForgetHtml)
	a.FormSideHtml = htmlSanitizer.Sanitize(a.FormSideHtml)
	sanitizeCustomItemLabels(a.SigninItems)
	sanitizeCustomItemLabels(a.ForgetItems)
}

// sanitizeCustomItemLabels scrubs the labels of custom items, which the auth
// pages render as HTML. Built-in items keep their label untouched: those are
// plain-text overrides, and sanitizing would escape characters like "&".
func sanitizeCustomItemLabels(items []*SigninItem) {
	for _, item := range items {
		if item != nil && item.IsCustom {
			item.Label = htmlSanitizer.Sanitize(item.Label)
		}
	}
}
