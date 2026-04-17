// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package object

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/casbin/casbin/v3/util"
)

// BizPermissionMatchRequest is the body for biz-test-permission-match. The
// admin supplies a concrete request tuple and the engine explains whether
// the permission would apply. Matching mirrors Casbin's built-in functions
// so the answer tracks enforce-time behavior.
type BizPermissionMatchRequest struct {
	PermissionId int64  `json:"permissionId"`
	TestMethod   string `json:"testMethod"`
	TestUrl      string `json:"testUrl"`
}

// BizPermissionMatchResult reports the outcome and which rule elements
// contributed. The UI renders the hit rows for transparency.
type BizPermissionMatchResult struct {
	Match          bool     `json:"match"`
	Effect         string   `json:"effect"`
	ResourceHit    string   `json:"resourceHit,omitempty"`
	ActionHit      string   `json:"actionHit,omitempty"`
	ResourceChecks []string `json:"resourceChecks"`
	ActionChecks   []string `json:"actionChecks"`
	Reason         string   `json:"reason"`
	Enabled        bool     `json:"enabled"`
	State          string   `json:"state"`
}

// TestBizPermissionMatch returns a structured explanation of whether the
// given permission would apply to the (method, url) pair. No Casbin model
// is required — we walk the permission's own Resources × Actions arrays
// using the same matchers the runtime uses.
func TestBizPermissionMatch(req *BizPermissionMatchRequest) (*BizPermissionMatchResult, error) {
	perm, err := getBizPermissionById(req.PermissionId)
	if err != nil {
		return nil, err
	}
	if perm == nil {
		return nil, fmt.Errorf("permission not found: id=%d", req.PermissionId)
	}

	result := &BizPermissionMatchResult{
		Effect:  perm.Effect,
		Enabled: perm.IsEnabled,
		State:   perm.State,
	}

	// Resource: pattern may use keyMatch / keyMatch2 / regex. We don't
	// record which pattern style was declared (the BizPermission doesn't
	// carry it), so try keyMatch2 first (most specific), then keyMatch,
	// then a regex — first match wins.
	for _, r := range perm.Resources {
		hit, matcher := resourceMatches(r, req.TestUrl)
		result.ResourceChecks = append(result.ResourceChecks,
			fmt.Sprintf("%s (%s) %s %s", r, matcher, tick(hit), req.TestUrl))
		if hit && result.ResourceHit == "" {
			result.ResourceHit = r
		}
	}

	// Action: regex semantics per Casbin's standard RBAC model for this
	// project (action regex against request.act).
	for _, a := range perm.Actions {
		hit := actionMatches(a, req.TestMethod)
		result.ActionChecks = append(result.ActionChecks,
			fmt.Sprintf("%s %s %s", a, tick(hit), strings.ToUpper(req.TestMethod)))
		if hit && result.ActionHit == "" {
			result.ActionHit = a
		}
	}

	resourceOK := result.ResourceHit != ""
	actionOK := result.ActionHit != ""
	switch {
	case !perm.IsEnabled:
		result.Match = false
		result.Reason = "permission is disabled — skipped at enforce time"
	case perm.State != "" && perm.State != "Approved":
		result.Match = false
		result.Reason = fmt.Sprintf("permission state %q — not active", perm.State)
	case len(perm.Resources) == 0 || len(perm.Actions) == 0:
		result.Match = false
		result.Reason = "permission has no resources or actions configured"
	case !resourceOK && !actionOK:
		result.Match = false
		result.Reason = "neither resource nor action matched"
	case !resourceOK:
		result.Match = false
		result.Reason = "no resource pattern matched"
	case !actionOK:
		result.Match = false
		result.Reason = "no action matched"
	default:
		result.Match = true
		if perm.Effect == "Deny" {
			result.Reason = "DENY rule applies to this request"
		} else {
			result.Reason = "ALLOW rule applies to this request"
		}
	}
	return result, nil
}

func tick(ok bool) string {
	if ok {
		return "✓"
	}
	return "✗"
}

// resourceMatches tries keyMatch2, keyMatch, and finally regex. Returns
// (hit, matcher_name) so the UI can explain which path matched.
func resourceMatches(pattern, url string) (bool, string) {
	if util.KeyMatch2(url, pattern) {
		return true, "keyMatch2"
	}
	if util.KeyMatch(url, pattern) {
		return true, "keyMatch"
	}
	if re, err := regexp.Compile(pattern); err == nil && re.MatchString(url) {
		return true, "regex"
	}
	return false, "no"
}

func actionMatches(pattern, method string) bool {
	if pattern == "" {
		return false
	}
	// Fast path: exact case-insensitive equality covers 90% of admin cases.
	if strings.EqualFold(pattern, method) {
		return true
	}
	// Wildcard literal.
	if pattern == "*" || pattern == ".*" {
		return true
	}
	// Regex.
	if re, err := regexp.Compile("(?i)^" + pattern + "$"); err == nil && re.MatchString(method) {
		return true
	}
	return false
}
