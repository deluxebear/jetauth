// Copyright 2026 The Casdoor Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package rule

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/deluxebear/jetauth/object"
)

// TestWafRule_BodyInspection guards the fix for the bug where Coraza never
// saw the request body because WriteRequestBody was missing — phase:2 rules
// referencing ARGS_POST / REQUEST_BODY silently no-op'd in that state. The
// rule below matches on a body parameter; it must fire, and req.Body must
// remain readable for the downstream proxy.
func TestWafRule_BodyInspection(t *testing.T) {
	body := "name=alice&payload=<script>alert(1)</script>"
	req, err := http.NewRequest(http.MethodPost, "http://site.local/submit", strings.NewReader(body))
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.ContentLength = int64(len(body))

	rule := &WafRule{}
	expressions := []*object.Expression{
		{
			Name:     "block-script-tag-in-args",
			Operator: "match",
			Value:    `SecRule ARGS "@contains <script>" "id:'900100',phase:2,deny,status:403,msg:'inline script in body'"`,
		},
	}

	result, err := rule.checkRule(expressions, req)
	if err != nil {
		t.Fatalf("checkRule returned error: %v", err)
	}
	if result == nil {
		t.Fatalf("expected WAF to match body content; got nil result (body bytes likely never reached Coraza)")
	}
	if result.Action != "Block" {
		t.Fatalf("expected Action=Block, got %q", result.Action)
	}

	// The downstream reverse proxy will read req.Body next — it must still
	// contain the original bytes despite Coraza having drained them.
	got, err := io.ReadAll(req.Body)
	if err != nil {
		t.Fatalf("ReadAll(req.Body) after WAF: %v", err)
	}
	if string(got) != body {
		t.Fatalf("req.Body was not restored\n  want: %q\n  got:  %q", body, string(got))
	}
}

// TestWafSession_ResponsePhaseBlocksAndRestoresBody covers phase:3/4 — a
// rule that matches the response body must trigger Block, and the response
// body must remain readable for the downstream client after WAF buffers it.
func TestWafSession_ResponsePhaseBlocksAndRestoresBody(t *testing.T) {
	// Request side: trivial GET with no body and a phase:1 rule that doesn't
	// match. We just need a tx to live in the session so InspectResponse has
	// something to evaluate.
	ctx, session := WithWafSession(context.Background())
	t.Cleanup(session.Close)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://site.local/", nil)
	if err != nil {
		t.Fatalf("NewRequestWithContext: %v", err)
	}

	rule := &WafRule{}
	expressions := []*object.Expression{
		// Phase:1 placeholder — never matches; we don't want a request-side block.
		{
			Name:     "noop-phase1",
			Operator: "match",
			Value:    `SecRule REQUEST_HEADERS:User-Agent "@contains __never__" "id:'910001',phase:1,pass,nolog"`,
		},
		// Phase:4 — fires when the response body contains the secret marker.
		{
			Name:     "block-leaked-secret",
			Operator: "match",
			Value:    `SecRule RESPONSE_BODY "@contains TOP_SECRET_TOKEN" "id:'910002',phase:4,deny,status:403,msg:'response leaked secret'"`,
		},
	}

	if _, err := rule.checkRule(expressions, req); err != nil {
		t.Fatalf("checkRule (request phase): %v", err)
	}

	// Simulated upstream response carrying the marker in JSON body.
	respBody := `{"user":"alice","token":"TOP_SECRET_TOKEN"}`
	resp := &http.Response{
		StatusCode: 200,
		Proto:      "HTTP/1.1",
		Header: http.Header{
			"Content-Type": []string{"application/json"},
		},
		Body: io.NopCloser(strings.NewReader(respBody)),
	}

	result, err := session.InspectResponse(resp)
	if err != nil {
		t.Fatalf("InspectResponse: %v", err)
	}
	if result == nil {
		t.Fatalf("expected response-phase block; got nil (phase:4 rule did not fire)")
	}
	if result.Action != "Block" {
		t.Fatalf("expected Action=Block, got %q (reason=%q)", result.Action, result.Reason)
	}

	// The reverse proxy will read resp.Body next — must still contain the
	// original bytes after Coraza drained them for inspection.
	got, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("ReadAll(resp.Body) after InspectResponse: %v", err)
	}
	if string(got) != respBody {
		t.Fatalf("resp.Body was not restored\n  want: %q\n  got:  %q", respBody, string(got))
	}
}

// TestWafSession_ResponsePhasePassesCleanResponse confirms the response
// passes through (nil result) when no phase:3/4 rule matches.
func TestWafSession_ResponsePhasePassesCleanResponse(t *testing.T) {
	ctx, session := WithWafSession(context.Background())
	t.Cleanup(session.Close)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://site.local/", nil)
	if err != nil {
		t.Fatalf("NewRequestWithContext: %v", err)
	}

	rule := &WafRule{}
	expressions := []*object.Expression{
		{
			Name:     "block-leaked-secret",
			Operator: "match",
			Value:    `SecRule RESPONSE_BODY "@contains TOP_SECRET_TOKEN" "id:'910003',phase:4,deny,status:403,msg:'response leaked secret'"`,
		},
	}

	if _, err := rule.checkRule(expressions, req); err != nil {
		t.Fatalf("checkRule: %v", err)
	}

	resp := &http.Response{
		StatusCode: 200,
		Proto:      "HTTP/1.1",
		Header:     http.Header{"Content-Type": []string{"application/json"}},
		Body:       io.NopCloser(strings.NewReader(`{"hello":"world"}`)),
	}

	result, err := session.InspectResponse(resp)
	if err != nil {
		t.Fatalf("InspectResponse: %v", err)
	}
	if result != nil {
		t.Fatalf("expected nil (clean response); got %+v", result)
	}
}

// TestInvalidateWafCache verifies the cache clears so updated rules don't
// keep their predecessors' compiled Coraza engines pinned in memory.
func TestInvalidateWafCache(t *testing.T) {
	// Compile a rule once — cache should now hold one entry.
	expr := []*object.Expression{
		{
			Name:     "noop",
			Operator: "match",
			Value:    `SecRule REQUEST_URI "@beginsWith /never-matches" "id:'910100',phase:1,pass,nolog"`,
		},
	}
	req, err := http.NewRequest(http.MethodGet, "http://site.local/", nil)
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}

	rule := &WafRule{}
	if _, err := rule.checkRule(expr, req); err != nil {
		t.Fatalf("checkRule: %v", err)
	}

	wafCacheMu.RLock()
	before := len(wafCache)
	wafCacheMu.RUnlock()
	if before == 0 {
		t.Fatalf("expected cache to hold the compiled engine after first use; got 0 entries")
	}

	InvalidateWafCache()

	wafCacheMu.RLock()
	after := len(wafCache)
	wafCacheMu.RUnlock()
	if after != 0 {
		t.Fatalf("expected cache to be empty after InvalidateWafCache; got %d entries", after)
	}
}

// TestWafRule_NilBody confirms the body-read path is safe for requests with
// no body (GET / HEAD). The phase:1 header rule must still fire, proving
// readAndRestoreBody returns cleanly when req.Body is absent.
func TestWafRule_NilBody(t *testing.T) {
	req, err := http.NewRequest(http.MethodGet, "http://site.local/", nil)
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}
	req.Header.Set("User-Agent", "sqlmap/1.0")

	rule := &WafRule{}
	expressions := []*object.Expression{
		{
			Name:     "block-bad-ua",
			Operator: "match",
			Value:    `SecRule REQUEST_HEADERS:User-Agent "@contains sqlmap" "id:'900200',phase:1,deny,status:403,msg:'bad scanner UA'"`,
		},
	}

	result, err := rule.checkRule(expressions, req)
	if err != nil {
		t.Fatalf("checkRule returned error: %v", err)
	}
	if result == nil || result.Action != "Block" {
		t.Fatalf("expected Block for sqlmap UA; got %+v", result)
	}
}
