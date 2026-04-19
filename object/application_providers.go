package object

// ResolvedProvider is the pre-baked provider info the auth UI needs.
// No secrets leak here — only display-safe values.
type ResolvedProvider struct {
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
	Type        string `json:"type"`
	LogoURL     string `json:"logoUrl"`
	LogoURLDark string `json:"logoUrlDark"`
	ClientID    string `json:"clientId"`
	Prompted    bool   `json:"prompted"`
	CanSignUp   bool   `json:"canSignUp"`
	Rule        string `json:"rule"`
}

// providerLogoMap is the canonical mapping of built-in provider types to
// static logo URLs. The frontend ships the actual SVGs in web-new/public/
// and the backend just returns the path so responses stay cache-friendly.
var providerLogoMap = map[string]string{
	"GitHub":    "/providers/github.svg",
	"Google":    "/providers/google.svg",
	"WeChat":    "/providers/wechat.svg",
	"DingTalk":  "/providers/dingtalk.svg",
	"Lark":      "/providers/lark.svg",
	"Gitee":     "/providers/gitee.svg",
	"Gitlab":    "/providers/gitlab.svg",
	"Apple":     "/providers/apple.svg",
	"Microsoft": "/providers/microsoft.svg",
	"LinkedIn":  "/providers/linkedin.svg",
	"SAML":      "/providers/saml.svg",
	"OIDC":      "/providers/oidc.svg",
}

const fallbackProviderLogo = "/providers/generic.svg"

// ResolveProviders filters an application's Providers down to sign-in-enabled
// entries and pre-attaches the logo URL + display-safe metadata.
// Returns an empty (non-nil) slice when app is nil or has no providers.
func ResolveProviders(app *Application) []ResolvedProvider {
	if app == nil || len(app.Providers) == 0 {
		return []ResolvedProvider{}
	}
	out := make([]ResolvedProvider, 0, len(app.Providers))
	for _, pi := range app.Providers {
		if pi == nil || pi.Provider == nil || !pi.CanSignIn {
			continue
		}
		p := pi.Provider
		// Prefer admin-set custom logo over the built-in type map. When only
		// one of light/dark is set, reuse it for both modes so a single upload
		// still works everywhere.
		light := p.CustomLogo
		if light == "" {
			if builtIn, ok := providerLogoMap[p.Type]; ok {
				light = builtIn
			} else {
				light = fallbackProviderLogo
			}
		}
		dark := p.CustomLogoDark
		if dark == "" {
			dark = light
		}
		out = append(out, ResolvedProvider{
			Name:        pi.Name,
			DisplayName: p.DisplayName,
			Type:        p.Type,
			LogoURL:     light,
			LogoURLDark: dark,
			ClientID:    p.ClientId,
			Prompted:    pi.Prompted,
			CanSignUp:   pi.CanSignUp,
			Rule:        pi.Rule,
		})
	}
	return out
}
