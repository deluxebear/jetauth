package controllers

import (
	"testing"

	"github.com/deluxebear/jetauth/object"
)

func TestFilterMethodsForUser_FiltersByAppConfig(t *testing.T) {
	app := &object.Application{
		EnablePassword:   true,
		EnableCodeSignin: false,
		EnableWebAuthn:   false,
		SigninMethods: []*object.SigninMethod{
			{Name: "Password", DisplayName: "Password", Rule: "All"},
			{Name: "Verification code", DisplayName: "Code", Rule: "All"},
			{Name: "WebAuthn", DisplayName: "WebAuthn", Rule: ""},
		},
	}
	user := &object.User{Password: "hashed"}
	methods := filterMethodsForUser(app, user)

	if !containsMethod(methods, "Password") {
		t.Errorf("Password should be included; got %v", methodNames(methods))
	}
	if containsMethod(methods, "Verification code") {
		t.Errorf("Code should be filtered out when EnableCodeSignin=false")
	}
	if containsMethod(methods, "WebAuthn") {
		t.Errorf("WebAuthn should be filtered out when EnableWebAuthn=false")
	}
}

func TestFilterMethodsForUser_CodeRequiresContactInfo(t *testing.T) {
	app := &object.Application{
		EnableCodeSignin: true,
		SigninMethods: []*object.SigninMethod{
			{Name: "Verification code", DisplayName: "Code", Rule: "All"},
		},
	}
	userNoContact := &object.User{Name: "alice"}
	userWithEmail := &object.User{Name: "bob", Email: "bob@example.com"}

	methods := filterMethodsForUser(app, userNoContact)
	if containsMethod(methods, "Verification code") {
		t.Errorf("Code should be hidden when user has no email/phone; got %v", methodNames(methods))
	}

	methods = filterMethodsForUser(app, userWithEmail)
	if !containsMethod(methods, "Verification code") {
		t.Errorf("Code should be offered when user has email; got %v", methodNames(methods))
	}
}

func TestFilterMethodsForUser_NilUserReturnsBasicMethodsOnly(t *testing.T) {
	app := &object.Application{
		EnablePassword:   true,
		EnableCodeSignin: true,
		EnableWebAuthn:   true,
		SigninMethods: []*object.SigninMethod{
			{Name: "Password", Rule: "All"},
			{Name: "Verification code", Rule: "All"},
			{Name: "WebAuthn", Rule: ""},
		},
	}
	methods := filterMethodsForUser(app, nil)
	if !containsMethod(methods, "Password") {
		t.Errorf("Password should always be returned for unknown identifier")
	}
	if containsMethod(methods, "WebAuthn") {
		t.Errorf("WebAuthn needs a registered user; should be excluded for nil user")
	}
}

func TestPickRecommendedMethod_PreferWebAuthnThenCodeThenPassword(t *testing.T) {
	tests := []struct {
		methods []SigninMethodInfo
		want    string
	}{
		{[]SigninMethodInfo{{Name: "Password"}}, "Password"},
		{[]SigninMethodInfo{{Name: "Password"}, {Name: "Verification code"}}, "Verification code"},
		{[]SigninMethodInfo{{Name: "Password"}, {Name: "WebAuthn"}}, "WebAuthn"},
		{[]SigninMethodInfo{{Name: "Password"}, {Name: "Verification code"}, {Name: "WebAuthn"}}, "WebAuthn"},
		{[]SigninMethodInfo{}, ""},
	}
	for _, tc := range tests {
		got := pickRecommendedMethod(tc.methods)
		if got != tc.want {
			t.Errorf("pickRecommendedMethod(%v) = %q, want %q", methodNames(tc.methods), got, tc.want)
		}
	}
}

func TestMaskEmail(t *testing.T) {
	tests := []struct {
		in, want string
	}{
		{"alice@example.com", "a***@example.com"},
		{"a@b.c", "a***@b.c"},
		{"", ""},
	}
	for _, tc := range tests {
		got := maskEmail(tc.in)
		if got != tc.want {
			t.Errorf("maskEmail(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestMaskPhone(t *testing.T) {
	if got := maskPhone("+15551234567"); got != "***-***-4567" {
		t.Errorf("maskPhone too-long: got %q", got)
	}
	if got := maskPhone("123"); got != "123" {
		t.Errorf("maskPhone too-short: got %q", got)
	}
}

func containsMethod(methods []SigninMethodInfo, name string) bool {
	for _, m := range methods {
		if m.Name == name {
			return true
		}
	}
	return false
}

func methodNames(methods []SigninMethodInfo) []string {
	out := make([]string, len(methods))
	for i, m := range methods {
		out[i] = m.Name
	}
	return out
}
