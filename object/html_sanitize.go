package object

import "github.com/microcosm-cc/bluemonday"

// htmlSanitizer is the shared policy used to scrub the five admin-editable
// HTML fields on Application (headerHtml / footerHtml / signinHtml /
// signupHtml / forgetHtml) before they're persisted. Paired with the
// frontend DOMPurify policy in web-new/src/auth/shell/SafeHtml.tsx —
// defense in depth: admins may paste raw HTML, we strip dangerous
// constructs both on save and on render.
var htmlSanitizer = func() *bluemonday.Policy {
	p := bluemonday.UGCPolicy()
	p.AllowStyling()
	p.AllowAttrs("class", "id", "style").Globally()
	p.AllowStandardURLs()
	return p
}()

// sanitizeApplicationHtml scrubs the five HTML fields in place. Safe to
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
}
