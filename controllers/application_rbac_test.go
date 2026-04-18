package controllers

import (
	"testing"

	"github.com/deluxebear/jetauth/object"
)

func TestSanitizeApplicationForNonGlobalAdmin_StripsHTML(t *testing.T) {
	incoming := &object.Application{
		Name:         "app-test",
		HeaderHtml:   "<script>evil()</script>",
		FooterHtml:   "<p>footer</p>",
		SignupHtml:   "<div>signup</div>",
		SigninHtml:   "<div>signin</div>",
		FormSideHtml: "<div>side</div>",
		DisplayName:  "Test App",
	}
	existing := &object.Application{
		Name:         "app-test",
		HeaderHtml:   "<p>existing header</p>",
		FooterHtml:   "<p>existing footer</p>",
		SignupHtml:   "",
		SigninHtml:   "<span>existing signin</span>",
		FormSideHtml: "",
		DisplayName:  "Old Name",
	}
	sanitizeApplicationForNonGlobalAdmin(incoming, existing)

	if incoming.HeaderHtml != existing.HeaderHtml {
		t.Errorf("HeaderHtml should be restored from existing; got %q", incoming.HeaderHtml)
	}
	if incoming.FooterHtml != existing.FooterHtml {
		t.Errorf("FooterHtml should be restored; got %q", incoming.FooterHtml)
	}
	if incoming.SignupHtml != existing.SignupHtml {
		t.Errorf("SignupHtml should be restored; got %q", incoming.SignupHtml)
	}
	if incoming.SigninHtml != existing.SigninHtml {
		t.Errorf("SigninHtml should be restored; got %q", incoming.SigninHtml)
	}
	if incoming.FormSideHtml != existing.FormSideHtml {
		t.Errorf("FormSideHtml should be restored; got %q", incoming.FormSideHtml)
	}
	if incoming.DisplayName != "Test App" {
		t.Errorf("DisplayName must NOT be touched; got %q", incoming.DisplayName)
	}
}

func TestSanitizeApplicationForNonGlobalAdmin_AllowsSameValue(t *testing.T) {
	incoming := &object.Application{HeaderHtml: "<p>same</p>"}
	existing := &object.Application{HeaderHtml: "<p>same</p>"}
	sanitizeApplicationForNonGlobalAdmin(incoming, existing)
	if incoming.HeaderHtml != "<p>same</p>" {
		t.Errorf("no-op mutation should pass through; got %q", incoming.HeaderHtml)
	}
}

func TestSanitizeApplicationForNonGlobalAdmin_HandlesNilSafely(t *testing.T) {
	// Should not panic on nil inputs
	sanitizeApplicationForNonGlobalAdmin(nil, nil)
	sanitizeApplicationForNonGlobalAdmin(&object.Application{}, nil)
	sanitizeApplicationForNonGlobalAdmin(nil, &object.Application{})
}

func TestSanitizeApplicationForNonGlobalAdmin_NilExistingIsNoop(t *testing.T) {
	// When the existing application is nil (not found in DB), the sanitizer
	// is a no-op — by design. The handler's job is to catch nil and return
	// an error BEFORE calling this function; see UpdateApplication in
	// application.go. If the handler ever bypasses that guard, attacker-
	// controlled HTML would flow through unchecked.
	incoming := &object.Application{
		HeaderHtml: "<script>attacker()</script>",
	}
	sanitizeApplicationForNonGlobalAdmin(incoming, nil)
	if incoming.HeaderHtml != "<script>attacker()</script>" {
		t.Errorf("sanitizer must be a no-op when existing is nil; got %q", incoming.HeaderHtml)
	}
}
