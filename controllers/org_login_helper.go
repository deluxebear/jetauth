package controllers

import (
	"fmt"

	"github.com/deluxebear/jetauth/object"
)

// resolveOrgDefaultApplication takes a bare organization name (e.g. "jetems")
// and returns the Application that the identifier-first login surface should
// use. Order of preference:
//
//  1. The organization's configured DefaultApplication
//  2. "admin/app-built-in" — the IAM control-plane app, whose job is to let
//     users authenticate into the jetauth admin panel
//
// The returned Application carries the org via OrganizationObj, which gives
// downstream callers (GetResolvedTheme, GetApplicationLogin, ResolveProviders)
// access to the org's theme, logo, and signin policy without additional
// lookups. Used by /login/<org>-style URLs that don't point at a specific
// OAuth flow.
func resolveOrgDefaultApplication(orgName string) (*object.Application, error) {
	if orgName == "" {
		return nil, fmt.Errorf("organization is required")
	}

	orgID := "admin/" + orgName
	org, err := object.GetOrganization(orgID)
	if err != nil {
		return nil, err
	}
	if org == nil {
		return nil, fmt.Errorf("The organization: %s does not exist", orgName)
	}

	// Preference order for the app that backs /login/<org>:
	//   1. org.DefaultApplication (admin's explicit choice)
	//   2. ANY application owned by the org (lets at least one org-member
	//      log in; their per-app permissions still gate the actual login)
	//   3. admin/app-built-in as a last resort
	//
	// Falling back to app-built-in for a non-built-in org usually denies
	// the login at CheckLoginPermission time because built-in's default
	// permission only grants built-in users. Picking an org-owned app
	// first avoids that trap for the common case.
	var app *object.Application
	if org.DefaultApplication != "" {
		appID := org.DefaultApplication
		if len(appID) < 6 || appID[:6] != "admin/" {
			appID = "admin/" + appID
		}
		app, err = object.GetApplication(appID)
		if err != nil {
			return nil, err
		}
	}
	if app == nil {
		orgApps, listErr := object.GetOrganizationApplications("admin", orgName)
		if listErr != nil {
			return nil, listErr
		}
		for _, candidate := range orgApps {
			if candidate == nil || candidate.Organization != orgName {
				// GetOrganizationApplications also returns shared apps; we
				// want specifically an app owned by the org to keep the
				// login gated correctly.
				continue
			}
			app = candidate
			break
		}
	}
	if app == nil {
		app, err = object.GetApplication("admin/app-built-in")
		if err != nil {
			return nil, err
		}
	}
	if app == nil {
		return nil, fmt.Errorf("no application found for organization %s", orgName)
	}

	// Make sure the org we resolved drives the branding — even when the
	// fallback app is app-built-in whose own OrganizationObj points to
	// built-in. The user came in via /login/jetems and should see jetems.
	app.OrganizationObj = org
	return app, nil
}
