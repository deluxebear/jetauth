// Copyright 2026 The JetAuth Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

package service

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/deluxebear/jetauth/object"
)

// TestIsBypassed locks down the bypass list semantics. The motivation: admins
// will type these patterns by hand; getting the matcher "wrong" in a subtle
// way (e.g. "/health" matching "/healthz") silently weakens authz without
// any error. The table pins down every supported shape.
func TestIsBypassed(t *testing.T) {
	cases := []struct {
		name     string
		path     string
		patterns []string
		want     bool
	}{
		{"empty list does not bypass", "/api/users", nil, false},
		{"exact match hits", "/health", []string{"/health"}, true},
		{"exact non-match", "/healthz", []string{"/health"}, false},
		{"wildcard star", "/api/public/foo/bar", []string{"/api/public/*"}, true},
		{"wildcard does not cross tree", "/api/private", []string{"/api/public/*"}, false},
		{"param single segment", "/api/users/123", []string{"/api/users/{id}"}, true},
		{"param does not match deeper", "/api/users/123/edit", []string{"/api/users/{id}"}, false},
		{"query string is stripped before matching", "/health?probe=1", []string{"/health"}, true},
		{"first-match wins", "/health", []string{"/unrelated", "/health"}, true},
		{"empty and whitespace entries skipped", "/anything", []string{"", "   "}, false},
		{"multiple patterns — any hits", "/ws", []string{"/api/*", "/ws"}, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := isBypassed(tc.path, tc.patterns)
			if got != tc.want {
				t.Fatalf("isBypassed(%q, %v) = %v, want %v", tc.path, tc.patterns, got, tc.want)
			}
		})
	}
}

// TestWriteAuthzDeny covers the verbose/non-verbose body split — important
// because production sites should set DisableVerbose to avoid leaking policy
// reasoning to would-be attackers probing for permissions they don't have.
func TestWriteAuthzDeny(t *testing.T) {
	cases := []struct {
		name           string
		disableVerbose bool
		reason         string
		wantStatus     int
		wantHasReason  bool
	}{
		{"verbose includes reason", false, "no policy matched", 403, true},
		{"non-verbose omits reason", true, "no policy matched", 403, false},
		{"verbose but empty reason still omits key", false, "", 403, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			site := &object.Site{DisableVerbose: tc.disableVerbose}
			writeAuthzDeny(rec, site, tc.reason)

			if rec.Code != tc.wantStatus {
				t.Fatalf("status = %d, want %d", rec.Code, tc.wantStatus)
			}
			if ct := rec.Header().Get("Content-Type"); !strings.Contains(ct, "application/json") {
				t.Fatalf("Content-Type = %q, want application/json", ct)
			}

			var body map[string]string
			if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
				t.Fatalf("response is not JSON: %v — raw: %s", err, rec.Body.String())
			}
			if body["error"] != "forbidden" {
				t.Errorf(`body["error"] = %q, want "forbidden"`, body["error"])
			}
			if _, hasReason := body["reason"]; hasReason != tc.wantHasReason {
				t.Errorf("has reason key = %v, want %v; body = %v", hasReason, tc.wantHasReason, body)
			}
		})
	}
}

// TestWriteAuthzUnavailable mirrors TestWriteAuthzDeny but for the 503 path.
// Keeping the two surfaces visually distinct in tests so a future refactor
// that accidentally merges them produces an obvious diff.
func TestWriteAuthzUnavailable(t *testing.T) {
	rec := httptest.NewRecorder()
	site := &object.Site{DisableVerbose: false}
	writeAuthzUnavailable(rec, site, "not configured")

	if rec.Code != 503 {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("response is not JSON: %v", err)
	}
	if body["error"] != "authz unavailable" {
		t.Errorf(`body["error"] = %q, want "authz unavailable"`, body["error"])
	}
	if body["reason"] != "not configured" {
		t.Errorf(`body["reason"] = %q, want "not configured"`, body["reason"])
	}
}

// TestGetClaimsEmpty — defend against callers that construct a request
// outside the normal gateway pipeline (where withClaims was never called).
// getClaims must return nil gracefully so forwardHandler can skip setting
// X-Forwarded-* headers without panicking.
func TestGetClaimsEmpty(t *testing.T) {
	if got := getClaims(context.Background()); got != nil {
		t.Fatalf("getClaims(empty) = %v, want nil", got)
	}
}
