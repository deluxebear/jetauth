// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

// Package service — biz authz integration helpers for the WAF gateway.
package service

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/beego/beego/v2/core/logs"
	"github.com/casbin/casbin/v3/util"
	"github.com/casdoor/casdoor-go-sdk/casdoorsdk"
	"github.com/deluxebear/jetauth/object"
	jetutil "github.com/deluxebear/jetauth/util"
)

// contextKey is a private type for request-scoped values so we don't collide
// with keys set by middleware outside this package.
type contextKey int

const (
	ctxClaimsKey contextKey = iota
)

func withClaims(ctx context.Context, claims *casdoorsdk.Claims) context.Context {
	return context.WithValue(ctx, ctxClaimsKey, claims)
}

// getClaims returns the claims stashed by withClaims, or nil when the request
// bypassed SSO (no CasdoorApplication on the site) so forwardHandler can
// simply skip the X-Forwarded-* identity headers instead of crashing.
func getClaims(ctx context.Context) *casdoorsdk.Claims {
	if ctx == nil {
		return nil
	}
	c, _ := ctx.Value(ctxClaimsKey).(*casdoorsdk.Claims)
	return c
}

// isBypassed returns true when the request path matches any entry in
// site.BizAuthzBypass. Matching uses Casbin's KeyMatch5 so admins have one
// syntax across bypass lists and permission obj patterns ("/health",
// "/api/public/*", "/api/users/{id}"). KeyMatch5 strips query strings
// before matching, so authz never depends on arbitrary parameters.
//
// Bypass entries are trimmed/filtered at save time in validateBizAuthz, so
// this loop can walk the slice raw without per-request string work.
func isBypassed(path string, bypass []string) bool {
	for _, pat := range bypass {
		if util.KeyMatch5(path, pat) {
			return true
		}
	}
	return false
}

// bizAuthzDecision bundles the enforce outcome with the (sub, obj, act)
// triple so audit logging can report what was evaluated without re-deriving.
type bizAuthzDecision struct {
	Allowed bool
	Kind    object.BizAuthzKind
	Sub     string
	Obj     string
	Act     string
	Err     error
}

// evaluateBizAuthz runs the biz enforce call and classifies the outcome. It
// intentionally does not touch the http.ResponseWriter — the caller decides
// how to translate (allowed, kind, err) into an HTTP response based on the
// site's FailMode.
func evaluateBizAuthz(site *object.Site, userId string, r *http.Request) bizAuthzDecision {
	// r.Method is already canonical per net/http; admins' regex patterns
	// should be uppercase. We ToUpper defensively because upstream servers
	// sometimes forward lowercased methods and regexMatch is case-sensitive.
	act := strings.ToUpper(r.Method)
	if act == "" {
		act = "GET"
	}

	allowed, kind, err := object.BizEnforceWithKind(
		site.Owner,
		site.CasdoorApplication,
		[]interface{}{userId, r.URL.Path, act},
	)
	return bizAuthzDecision{
		Allowed: allowed,
		Kind:    kind,
		Sub:     userId,
		Obj:     r.URL.Path,
		Act:     act,
		Err:     err,
	}
}

// writeAuthzDeny returns a 403 with a machine-readable JSON body. In
// DisableVerbose mode (production default) the body omits the reason so
// policy details are not leaked to clients probing for what they lack.
func writeAuthzDeny(w http.ResponseWriter, site *object.Site, reason string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusForbidden)

	body := map[string]string{"error": "forbidden"}
	if !site.DisableVerbose && reason != "" {
		body["reason"] = reason
	}
	raw, _ := json.Marshal(body)
	_, _ = w.Write(raw)
}

// writeAuthzUnavailable returns 503 when the authz stack is misconfigured
// or the engine itself failed. Distinct from 403 so ops can tell "auth
// broken" from "user denied" at a glance in access logs.
func writeAuthzUnavailable(w http.ResponseWriter, site *object.Site, reason string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusServiceUnavailable)

	body := map[string]string{"error": "authz unavailable"}
	if !site.DisableVerbose && reason != "" {
		body["reason"] = reason
	}
	raw, _ := json.Marshal(body)
	_, _ = w.Write(raw)
}

// recordAuthzEvent writes a single access-log row for admins to reconstruct
// deny / fail-open events. object.AddRecord does a DB insert and fires
// webhooks inline and panics on DB error, so we dispatch it off the hot
// path — a deny burst (scanner hitting /admin/*) must never block the
// gateway or take it down via a DB hiccup.
func recordAuthzEvent(clientIp string, r *http.Request, site *object.Site, d bizAuthzDecision, action string) {
	record := object.Record{
		Owner:       "admin",
		CreatedTime: jetutil.GetCurrentTime(),
		Method:      r.Method,
		RequestUri:  r.RequestURI,
		ClientIp:    clientIp,
		Action:      action,
		User:        d.Sub,
		Object:      site.GetId(),
	}
	go func() {
		defer func() {
			if rec := recover(); rec != nil {
				logs.Error("recordAuthzEvent: AddRecord panicked: %v", rec)
			}
		}()
		object.AddRecord(&record)
	}()
}

// handleBizAuthz is the top-level gate called from handleRequest. Bypass,
// enforce, and fail-mode translation live here so proxy.go stays readable.
// Returns true if the request should continue down the chain; returns false
// if this function wrote the response and proxy.go should stop.
func handleBizAuthz(w http.ResponseWriter, r *http.Request, site *object.Site, claims *casdoorsdk.Claims, clientIp string) (continueChain bool) {
	if !site.EnableBizAuthz {
		return true
	}
	if isBypassed(r.URL.Path, site.BizAuthzBypass) {
		return true
	}
	if site.CasdoorApplication == "" {
		// validateBizAuthz prevents this at save time; defend in depth in
		// case a DB row is edited out-of-band — fail closed over panic.
		logs.Error("biz authz enabled without CasdoorApplication on site %s — fail closed", site.GetId())
		writeAuthzUnavailable(w, site, "site misconfigured: no application bound")
		return false
	}

	userId := jetutil.GetId(claims.User.Owner, claims.User.Name)
	d := evaluateBizAuthz(site, userId, r)

	switch d.Kind {
	case object.BizAuthzKindAllowed:
		return true

	case object.BizAuthzKindDenied:
		recordAuthzEvent(clientIp, r, site, d, "authz_deny")
		writeAuthzDeny(w, site, "no policy allows "+d.Act+" "+d.Obj+" for "+d.Sub)
		return false

	case object.BizAuthzKindNotFound, object.BizAuthzKindDisabled:
		// Misconfiguration, not an engine fault. Always 503 regardless of
		// fail mode — fail-open should not silently broadcast private data
		// when the admin simply hasn't finished setup.
		reason := "authz not configured for this application"
		if d.Kind == object.BizAuthzKindDisabled {
			reason = "authz is disabled for this application"
		}
		recordAuthzEvent(clientIp, r, site, d, "authz_misconfigured")
		writeAuthzUnavailable(w, site, reason)
		return false

	case object.BizAuthzKindEngineError:
		if site.BizAuthzFailMode == object.BizAuthzFailOpen {
			logs.Warning("biz authz engine failed, allowing request (fail-open mode): site=%s sub=%s %s %s err=%v",
				site.GetId(), d.Sub, d.Act, d.Obj, d.Err)
			recordAuthzEvent(clientIp, r, site, d, "authz_bypass_failopen")
			return true
		}
		logs.Error("biz authz engine failed, denying request (fail-closed mode): site=%s sub=%s %s %s err=%v",
			site.GetId(), d.Sub, d.Act, d.Obj, d.Err)
		recordAuthzEvent(clientIp, r, site, d, "authz_engine_error")
		writeAuthzUnavailable(w, site, "authz engine error")
		return false
	}

	// Unreachable today, but guard against an SDK upgrade that adds a new
	// kind — fail closed so new code doesn't silently allow traffic.
	logs.Error("biz authz returned unknown kind %q — treating as engine error", d.Kind)
	writeAuthzUnavailable(w, site, "authz engine error (unknown kind)")
	return false
}
