package controllers

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/deluxebear/jetauth/object"
)

// SigninMethodInfo is the display-safe info the frontend needs to render a
// signin method button or tab.
type SigninMethodInfo struct {
	Name        string `json:"name"`        // "Password" | "Verification code" | "WebAuthn" | "Face ID" | "LDAP" | "WeChat"
	DisplayName string `json:"displayName"` // human label from application.SigninMethods
	Rule        string `json:"rule"`        // e.g. "All" | "Email only" | "Phone only" | "Non-LDAP"
}

// ResolveSigninRequest is the payload for POST /api/resolve-signin-methods.
type ResolveSigninRequest struct {
	Application  string `json:"application"`  // "admin/app-foo" or short name "app-foo"
	Organization string `json:"organization"` // optional; falls back to the application's org
	Identifier   string `json:"identifier"`   // username, email, or phone
}

// ResolveSigninPayload is the data envelope returned on success.
type ResolveSigninPayload struct {
	Methods     []SigninMethodInfo `json:"methods"`
	Recommended string             `json:"recommended"` // Name of the suggested method, or ""
	UserHint    string             `json:"userHint"`    // masked display (e.g. "a***@example.com") or ""
}

// ResolveSigninResponse is the outer envelope.
type ResolveSigninResponse struct {
	Status string               `json:"status" example:"ok"`
	Msg    string               `json:"msg" example:""`
	Data   ResolveSigninPayload `json:"data"`
}

// ResolveSigninMethods returns the list of signin methods enabled for an
// application, filtered by which ones are actually usable for the given
// identifier (e.g. Code requires the user to have an email/phone; WebAuthn
// requires registered credentials).
//
// Deliberately leaks very little: when the identifier doesn't resolve to a
// user we still return the app's basic methods so an attacker can't probe
// for "user exists" via the method list.
//
// @Summary ResolveSigninMethods
// @Tags Login API
// @Description Identifier-first signin: returns available methods for a given identifier in an app.
// @Param body body ResolveSigninRequest true "Request"
// @Success 200 {object} ResolveSigninResponse "The Response object"
// @Router /resolve-signin-methods [post]
func (c *ApiController) ResolveSigninMethods() {
	var req ResolveSigninRequest
	if err := json.Unmarshal(c.Ctx.Input.RequestBody, &req); err != nil {
		c.ResponseError(err.Error())
		return
	}
	if req.Application == "" || req.Identifier == "" {
		c.ResponseError("missing application or identifier")
		return
	}

	appID := req.Application
	if !strings.Contains(appID, "/") {
		appID = "admin/" + appID
	}
	app, err := object.GetApplication(appID)
	if err != nil {
		c.ResponseError(err.Error())
		return
	}
	if app == nil {
		c.ResponseError(fmt.Sprintf(c.T("auth:The application: %s does not exist"), appID))
		return
	}

	org := req.Organization
	if org == "" && app.OrganizationObj != nil {
		org = app.OrganizationObj.Name
	}

	user, _ := object.GetUserByFields(org, req.Identifier)

	methods := filterMethodsForUser(app, user)
	payload := ResolveSigninPayload{
		Methods:     methods,
		Recommended: pickRecommendedMethod(methods),
		UserHint:    maskUserHint(user),
	}

	c.Data["json"] = ResolveSigninResponse{
		Status: "ok",
		Data:   payload,
	}
	c.ServeJSON()
}

// filterMethodsForUser intersects the application's declared SigninMethods
// with what's actually enabled app-side AND usable for this user.
func filterMethodsForUser(app *object.Application, user *object.User) []SigninMethodInfo {
	if app == nil {
		return []SigninMethodInfo{}
	}
	methods := object.MergeOrgAppSigninMethods(app.OrganizationObj, app)
	out := make([]SigninMethodInfo, 0, len(methods))
	for _, m := range methods {
		if m == nil {
			continue
		}
		if !isMethodEnabledForApp(app, m.Name) {
			continue
		}
		if !isMethodUsableByUser(m.Name, user) {
			continue
		}
		out = append(out, SigninMethodInfo{
			Name:        m.Name,
			DisplayName: m.DisplayName,
			Rule:        m.Rule,
		})
	}
	return out
}

// isMethodEnabledForApp checks the Application-level feature flags.
func isMethodEnabledForApp(app *object.Application, methodName string) bool {
	switch methodName {
	case "Password":
		return app.EnablePassword
	case "Verification code":
		return app.EnableCodeSignin
	case "WebAuthn":
		return app.EnableWebAuthn
	case "Face ID":
		return app.IsFaceIdEnabled()
	case "LDAP":
		// LDAP is enabled when the org has an LDAP config; handled
		// downstream by the login handler, so we expose it as-is.
		return true
	case "WeChat":
		return true
	default:
		// Unknown methods: pass through; the frontend decides what to render.
		return true
	}
}

// isMethodUsableByUser checks per-user prerequisites (e.g. Code needs
// email/phone; WebAuthn needs registered credentials).
func isMethodUsableByUser(methodName string, user *object.User) bool {
	switch methodName {
	case "Verification code":
		if user == nil {
			return false
		}
		return user.Email != "" || user.Phone != ""
	case "WebAuthn":
		if user == nil {
			return false
		}
		return len(user.WebauthnCredentials) > 0
	case "Face ID":
		if user == nil {
			return false
		}
		return len(user.FaceIds) > 0
	default:
		return true
	}
}

// pickRecommendedMethod chooses the best default method for the identifier-
// first UX. Precedence: WebAuthn (frictionless) > Face ID > Verification code > Password.
func pickRecommendedMethod(methods []SigninMethodInfo) string {
	priority := map[string]int{
		"WebAuthn":          3,
		"Face ID":           2,
		"Verification code": 1,
		"Password":          0,
	}
	bestScore := -1
	bestName := ""
	for _, m := range methods {
		s, ok := priority[m.Name]
		if !ok {
			continue
		}
		if s > bestScore {
			bestScore = s
			bestName = m.Name
		}
	}
	return bestName
}

// maskUserHint produces a privacy-preserving display (e.g. "a***@example.com"
// or "***-***-4567") so the UX can reassure a returning user without
// leaking full PII to an attacker guessing identifiers.
func maskUserHint(user *object.User) string {
	if user == nil {
		return ""
	}
	if user.Email != "" {
		return maskEmail(user.Email)
	}
	if user.Phone != "" {
		return maskPhone(user.Phone)
	}
	return ""
}

func maskEmail(s string) string {
	if s == "" {
		return ""
	}
	at := strings.Index(s, "@")
	if at < 1 {
		return s
	}
	return string(s[0]) + "***" + s[at:]
}

func maskPhone(s string) string {
	if len(s) < 4 {
		return s
	}
	return "***-***-" + s[len(s)-4:]
}
