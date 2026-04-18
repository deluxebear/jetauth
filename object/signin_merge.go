package object

// MergeOrgAppSigninMethods returns the effective signin methods for an app:
//   - If the app has a non-empty SigninMethods slice, use it (app wins)
//   - Else fall through to the org's SigninMethods
//   - Else return nil (caller should treat as "no methods configured")
//
// The empty-slice semantics matches how Casdoor-era configs work: admins
// leave the field empty to mean "inherit" rather than "nothing allowed."
func MergeOrgAppSigninMethods(org *Organization, app *Application) []*SigninMethod {
	if app != nil && len(app.SigninMethods) > 0 {
		return app.SigninMethods
	}
	if org != nil && len(org.SigninMethods) > 0 {
		return org.SigninMethods
	}
	return nil
}

// MergeOrgAppSignupItems returns the effective signup items for an app with
// the same app-wins-else-inherit-org semantics as MergeOrgAppSigninMethods.
func MergeOrgAppSignupItems(org *Organization, app *Application) []*SignupItem {
	if app != nil && len(app.SignupItems) > 0 {
		return app.SignupItems
	}
	if org != nil && len(org.SignupItems) > 0 {
		return org.SignupItems
	}
	return nil
}
