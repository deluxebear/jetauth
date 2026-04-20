package object

// ResolvedProvider is the pre-baked provider info the auth UI needs.
// No secrets leak here — only display-safe values.
//
// Domain / Scopes / CustomAuthURL / AppID / SubType / DisableSSL are read by
// the frontend getAuthUrl builder for provider types whose authorize endpoint
// is admin-configured (Auth0 per-tenant, Okta, ADFS, Casdoor-as-IdP, Custom,
// AzureAD, AzureADB2C, Nextcloud, WeChat/WeCom/Infoflow multi-mode, Lark
// international-vs-China toggle).
type ResolvedProvider struct {
	Name          string `json:"name"`
	DisplayName   string `json:"displayName"`
	Type          string `json:"type"`
	LogoURL       string `json:"logoUrl"`
	LogoURLDark   string `json:"logoUrlDark"`
	ClientID      string `json:"clientId"`
	ClientID2     string `json:"clientId2"`
	Domain        string `json:"domain"`
	Scopes        string `json:"scopes"`
	CustomAuthURL string `json:"customAuthUrl"`
	AppID         string `json:"appId"`
	SubType       string `json:"subType"`
	Method        string `json:"method"`
	DisableSSL    bool   `json:"disableSsl"`
	Prompted      bool   `json:"prompted"`
	CanSignUp     bool   `json:"canSignUp"`
	Rule          string `json:"rule"`
}

// providerLogoMap is the canonical mapping of built-in provider types to
// static logo URLs. The frontend ships the actual SVGs in web-new/public/
// and the backend just returns the path so responses stay cache-friendly.
//
// Keys match the Type values in the admin "类型" dropdown exactly
// (case-sensitive). When a type isn't mapped, ResolveProviders falls back
// to fallbackProviderLogo.
var providerLogoMap = map[string]string{
	// Git hosts
	"GitHub":    "/providers/github.svg",
	"GitLab":    "/providers/gitlab.svg",
	"Gitee":     "/providers/gitee.svg",
	"Bitbucket": "/providers/bitbucket.svg",
	// Big-tech identity
	"Google":     "/providers/google.svg",
	"Apple":      "/providers/apple.svg",
	"AzureAD":    "/providers/microsoft.svg",
	"AzureADB2C": "/providers/microsoft.svg",
	"Okta":       "/providers/okta.svg",
	"Auth0":      "/providers/auth0.svg",
	"Facebook":   "/providers/facebook.svg",
	"Twitter":    "/providers/twitter.svg",
	"LinkedIn":   "/providers/linkedin.svg",
	"Dropbox":    "/providers/dropbox.svg",
	// Chat / misc
	"Discord": "/providers/discord.svg",
	"Slack":   "/providers/slack.svg",
	// Chinese ecosystem
	"WeChat":   "/providers/wechat.svg",
	"DingTalk": "/providers/dingtalk.svg",
	"Lark":     "/providers/lark.svg",
	"Alipay":   "/providers/alipay.svg",
	"Baidu":    "/providers/baidu.svg",
	// Federation
	"SAML": "/providers/saml.svg",
	"OIDC": "/providers/oidc.svg",
}

// providerLogoDarkMap lists dark-mode overrides for types whose light logo
// is transparent-background monochrome (pure-black paths) and would vanish
// on a dark button. Types NOT listed here reuse their light logo for both
// modes — that's the right answer for self-contained badge-style logos
// that carry their own colored background (Auth0, Facebook, Slack, etc).
var providerLogoDarkMap = map[string]string{
	"GitHub":     "/providers/github-dark.svg",
	"Apple":      "/providers/apple-dark.svg",
	"GitLab":     "/providers/gitlab-dark.svg",
	"Gitee":      "/providers/gitee-dark.svg",
	"Google":     "/providers/google-dark.svg",
	"AzureAD":    "/providers/microsoft-dark.svg",
	"AzureADB2C": "/providers/microsoft-dark.svg",
	"LinkedIn":   "/providers/linkedin-dark.svg",
	"WeChat":     "/providers/wechat-dark.svg",
	"DingTalk":   "/providers/dingtalk-dark.svg",
	"Lark":       "/providers/lark-dark.svg",
	"SAML":       "/providers/saml-dark.svg",
	"OIDC":       "/providers/oidc-dark.svg",
}

const (
	fallbackProviderLogo     = "/providers/generic.svg"
	fallbackProviderLogoDark = "/providers/generic-dark.svg"
)

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
			// Only fall back to a dedicated dark file when:
			//  (a) there's no admin override AND
			//  (b) there's no admin-set custom light logo (because a custom
			//      light upload should be mirrored, not replaced by a random
			//      built-in dark icon).
			if p.CustomLogo == "" {
				if builtInDark, ok := providerLogoDarkMap[p.Type]; ok {
					dark = builtInDark
				} else if light == fallbackProviderLogo {
					dark = fallbackProviderLogoDark
				}
			}
			if dark == "" {
				dark = light
			}
		}
		out = append(out, ResolvedProvider{
			Name:          pi.Name,
			DisplayName:   p.DisplayName,
			Type:          p.Type,
			LogoURL:       light,
			LogoURLDark:   dark,
			ClientID:      p.ClientId,
			ClientID2:     p.ClientId2,
			Domain:        p.Domain,
			Scopes:        p.Scopes,
			CustomAuthURL: p.CustomAuthUrl,
			AppID:         p.AppId,
			SubType:       p.SubType,
			Method:        p.Method,
			DisableSSL:    p.DisableSsl,
			Prompted:      pi.Prompted,
			CanSignUp:     pi.CanSignUp,
			Rule:          pi.Rule,
		})
	}
	return out
}
