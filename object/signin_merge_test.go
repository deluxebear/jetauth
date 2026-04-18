package object

import "testing"

func TestMergeOrgAppSigninMethods_AppWinsWhenNonEmpty(t *testing.T) {
	org := &Organization{SigninMethods: []*SigninMethod{{Name: "Password"}, {Name: "WebAuthn"}}}
	app := &Application{SigninMethods: []*SigninMethod{{Name: "Password"}}}
	got := MergeOrgAppSigninMethods(org, app)
	if len(got) != 1 || got[0].Name != "Password" {
		t.Errorf("app should win when non-empty; got %+v", got)
	}
}

func TestMergeOrgAppSigninMethods_InheritsOrgWhenAppEmpty(t *testing.T) {
	org := &Organization{SigninMethods: []*SigninMethod{{Name: "Password"}, {Name: "WebAuthn"}}}
	app := &Application{SigninMethods: nil}
	got := MergeOrgAppSigninMethods(org, app)
	if len(got) != 2 {
		t.Errorf("should inherit org methods; got %+v", got)
	}
}

func TestMergeOrgAppSigninMethods_NilWhenBothEmpty(t *testing.T) {
	got := MergeOrgAppSigninMethods(nil, nil)
	if got != nil {
		t.Errorf("nil inputs should yield nil result; got %+v", got)
	}
	got = MergeOrgAppSigninMethods(&Organization{}, &Application{})
	if got != nil {
		t.Errorf("both empty should yield nil; got %+v", got)
	}
}

func TestMergeOrgAppSignupItems_Pattern(t *testing.T) {
	org := &Organization{SignupItems: []*SignupItem{{Name: "username"}, {Name: "email"}}}
	app := &Application{SignupItems: []*SignupItem{{Name: "username"}}}

	got := MergeOrgAppSignupItems(org, app)
	if len(got) != 1 {
		t.Errorf("app should win; got %+v", got)
	}

	got = MergeOrgAppSignupItems(org, &Application{})
	if len(got) != 2 {
		t.Errorf("empty app should inherit; got %+v", got)
	}

	if got := MergeOrgAppSignupItems(nil, nil); got != nil {
		t.Errorf("both nil should yield nil; got %+v", got)
	}
}
