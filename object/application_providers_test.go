package object

import "testing"

func TestResolveProviders_IncludesCoreFields(t *testing.T) {
	app := &Application{
		Providers: []*ProviderItem{
			{
				Name:      "github_1",
				CanSignIn: true,
				Provider: &Provider{
					Name:        "github_1",
					DisplayName: "GitHub",
					Type:        "GitHub",
					ClientId:    "fake_client_id",
				},
			},
			{
				// Should be excluded: CanSignIn=false.
				Name:      "internal_scim",
				CanSignIn: false,
				Provider:  &Provider{Name: "internal_scim", Type: "SCIM"},
			},
		},
	}
	got := ResolveProviders(app)
	if len(got) != 1 {
		t.Fatalf("expected 1 resolved provider, got %d", len(got))
	}
	p := got[0]
	if p.Name != "github_1" || p.DisplayName != "GitHub" || p.Type != "GitHub" {
		t.Errorf("core fields wrong: %+v", p)
	}
	if p.LogoURL == "" {
		t.Errorf("LogoURL should be populated for known type 'GitHub'")
	}
	if p.ClientID != "fake_client_id" {
		t.Errorf("ClientID should pass through")
	}
}

func TestResolveProviders_UnknownTypeFallsBackToNeutralLogo(t *testing.T) {
	app := &Application{
		Providers: []*ProviderItem{
			{Name: "x", CanSignIn: true, Provider: &Provider{Name: "x", Type: "CustomThing", DisplayName: "X"}},
		},
	}
	got := ResolveProviders(app)
	if len(got) != 1 {
		t.Fatalf("want 1, got %d", len(got))
	}
	if got[0].LogoURL != fallbackProviderLogo {
		t.Errorf("unknown provider type should get fallback logo %q; got %q", fallbackProviderLogo, got[0].LogoURL)
	}
}

func TestResolveProviders_NilAppReturnsEmpty(t *testing.T) {
	got := ResolveProviders(nil)
	if got == nil {
		t.Errorf("ResolveProviders(nil) should return empty slice, not nil")
	}
	if len(got) != 0 {
		t.Errorf("ResolveProviders(nil) should return empty slice; got %d", len(got))
	}
}

func TestResolveProviders_SkipsNilProviderItem(t *testing.T) {
	app := &Application{
		Providers: []*ProviderItem{
			nil,
			{Name: "gh", CanSignIn: true, Provider: &Provider{Name: "gh", Type: "GitHub"}},
			{Name: "nope", CanSignIn: true, Provider: nil},
		},
	}
	got := ResolveProviders(app)
	if len(got) != 1 {
		t.Fatalf("nil entries should be skipped; got %d", len(got))
	}
	if got[0].Name != "gh" {
		t.Errorf("wrong entry survived: %+v", got[0])
	}
}
