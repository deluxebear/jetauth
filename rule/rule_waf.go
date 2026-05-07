// Copyright 2024 The casbin Authors. All Rights Reserved.
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
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"sync"

	"github.com/corazawaf/coraza/v3"
	"github.com/corazawaf/coraza/v3/types"
	"github.com/deluxebear/jetauth/conf"
	"github.com/deluxebear/jetauth/object"
	"github.com/hsluoyz/modsecurity-go/seclang/parser"
)

type WafRule struct{}

// Cache WAF engines by rule text to avoid recompiling on every request
var (
	wafCacheMu sync.RWMutex
	wafCache   = map[string]coraza.WAF{}
)

// InvalidateWafCache drops every cached compiled Coraza engine. Call this
// from rule mutation paths so a freshly-updated rule's old expressions
// stop occupying memory once nothing references them. We don't try to
// invalidate by key because the cache is keyed on rule *content* (joined
// expressions), not rule ID — clearing the whole map is cheap (rule writes
// are rare; next requests recompile lazily) and avoids stale-key bookkeeping.
func InvalidateWafCache() {
	wafCacheMu.Lock()
	wafCache = map[string]coraza.WAF{}
	wafCacheMu.Unlock()
}

// --- WafSession: thread Coraza transactions across the request/response
// --- boundary so phase:3 (response headers) and phase:4 (response body)
// --- rules can run. Without this, the WAF only sees the request side.

type wafSessionKey struct{}

type wafSessionEntry struct {
	tx           types.Transaction
	reqPhaseHits int // len(MatchedRules()) right after request-phase processing
}

// WafSession owns every Coraza transaction created while serving one HTTP
// request. WafRule.checkRule registers its tx here instead of closing it
// directly, so the transactions can be reused for response-phase inspection.
type WafSession struct {
	mu      sync.Mutex
	entries []*wafSessionEntry
}

// WithWafSession attaches a fresh WafSession to ctx. The returned session
// must have Close() invoked once the response is fully delivered (defer it
// from the request handler) — that runs phase:5 logging and releases tx.
func WithWafSession(ctx context.Context) (context.Context, *WafSession) {
	s := &WafSession{}
	return context.WithValue(ctx, wafSessionKey{}, s), s
}

// GetWafSession returns the session attached to ctx, or nil.
func GetWafSession(ctx context.Context) *WafSession {
	if v, ok := ctx.Value(wafSessionKey{}).(*WafSession); ok {
		return v
	}
	return nil
}

func (s *WafSession) addTx(tx types.Transaction) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.entries = append(s.entries, &wafSessionEntry{
		tx:           tx,
		reqPhaseHits: len(tx.MatchedRules()),
	})
}

// InspectResponse runs phase:3 and phase:4 evaluation on every transaction
// owned by this session. Returns the first Block/Drop produced by a
// response-phase rule, or nil if the response should pass through.
//
// resp.Body is fully buffered and replaced with a fresh reader so the
// downstream client still receives the original bytes.
func (s *WafSession) InspectResponse(resp *http.Response) (*RuleResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.entries) == 0 {
		return nil, nil
	}

	// Buffer body once; restore even on read error so the reverse proxy
	// doesn't try to read from a closed body afterwards.
	var bodyBytes []byte
	if resp.Body != nil {
		var err error
		bodyBytes, err = io.ReadAll(resp.Body)
		_ = resp.Body.Close()
		resp.Body = io.NopCloser(bytes.NewReader(bodyBytes))
		if err != nil {
			fmt.Printf("[WAF] read response body failed: %v\n", err)
		}
	}

	for _, e := range s.entries {
		// Phase 3: response headers
		for k, vs := range resp.Header {
			for _, v := range vs {
				e.tx.AddResponseHeader(k, v)
			}
		}
		e.tx.ProcessResponseHeaders(resp.StatusCode, resp.Proto)

		// Phase 4: response body — only if Coraza considers the
		// content type processable (default: text/plain, text/html,
		// application/json). Binary / streaming bodies are skipped.
		if len(bodyBytes) > 0 && e.tx.IsResponseBodyAccessible() && e.tx.IsResponseBodyProcessable() {
			if _, _, err := e.tx.WriteResponseBody(bodyBytes); err != nil {
				fmt.Printf("[WAF] WriteResponseBody error: %v\n", err)
			}
			if _, err := e.tx.ProcessResponseBody(); err != nil {
				fmt.Printf("[WAF] ProcessResponseBody error: %v\n", err)
			}
		}

		// Only inspect rules matched after the request phase ended —
		// earlier hits were already adjudicated by checkRule().
		all := e.tx.MatchedRules()
		for _, mr := range all[e.reqPhaseHits:] {
			r := mr.Rule()
			if r.Phase() < types.PhaseResponseHeaders {
				continue
			}
			directives, err := parser.NewSecLangScannerFromString(r.Raw()).AllDirective()
			if err != nil {
				continue
			}
			for _, d := range directives {
				ruleDirective, ok := d.(*parser.RuleDirective)
				if !ok {
					continue
				}
				for _, action := range ruleDirective.Actions.Action {
					switch action.Tk {
					case parser.TkActionBlock, parser.TkActionDeny:
						return &RuleResult{
							Action:     "Block",
							StatusCode: 403,
							Reason:     fmt.Sprintf("blocked by WAF rule: %d (response phase)", r.ID()),
						}, nil
					case parser.TkActionDrop:
						return &RuleResult{
							Action:     "Drop",
							StatusCode: 400,
							Reason:     fmt.Sprintf("dropped by WAF rule: %d (response phase)", r.ID()),
						}, nil
					}
				}
			}
		}
	}
	return nil, nil
}

// Close runs phase:5 logging on every transaction and releases them.
// Idempotent — safe to defer from the request handler.
func (s *WafSession) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, e := range s.entries {
		e.tx.ProcessLogging()
		if err := e.tx.Close(); err != nil {
			fmt.Printf("[WAF] tx close error: %v\n", err)
		}
	}
	s.entries = nil
}

func getOrCreateWAF(ruleStr string) (coraza.WAF, error) {
	wafCacheMu.RLock()
	if waf, ok := wafCache[ruleStr]; ok {
		wafCacheMu.RUnlock()
		return waf, nil
	}
	wafCacheMu.RUnlock()

	waf, err := coraza.NewWAF(
		coraza.NewWAFConfig().
			WithErrorCallback(logError).
			WithDirectives(conf.WafConf).
			WithDirectives(ruleStr),
	)
	if err != nil {
		return nil, fmt.Errorf("create WAF failed: %w", err)
	}

	wafCacheMu.Lock()
	wafCache[ruleStr] = waf
	wafCacheMu.Unlock()

	return waf, nil
}

func (r *WafRule) checkRule(expressions []*object.Expression, req *http.Request) (*RuleResult, error) {
	var ruleStr string
	for i, expression := range expressions {
		if i > 0 {
			ruleStr += "\n"
		}
		ruleStr += expression.Value
	}

	waf, err := getOrCreateWAF(ruleStr)
	if err != nil {
		return nil, err
	}

	tx := waf.NewTransaction()
	// If a session is attached to the request, hand the tx off so it can
	// also run phase:3/4 in ModifyResponse and phase:5 logging at the very
	// end. Otherwise (tests, ad-hoc callers), close it locally.
	session := GetWafSession(req.Context())
	if session != nil {
		// Register *after* request-phase processing returns so the
		// session captures the matched-count baseline correctly.
		defer session.addTx(tx)
	} else {
		defer func() {
			if err := tx.Close(); err != nil {
				fmt.Printf("[WAF] transaction close error: %v\n", err)
			}
		}()
	}

	processRequest(tx, req)
	matchedRules := tx.MatchedRules()
	for _, matchedRule := range matchedRules {
		rule := matchedRule.Rule()
		directive, err := parser.NewSecLangScannerFromString(rule.Raw()).AllDirective()
		if err != nil {
			return nil, err
		}
		for _, d := range directive {
			ruleDirective := d.(*parser.RuleDirective)
			for _, action := range ruleDirective.Actions.Action {
				switch action.Tk {
				case parser.TkActionBlock, parser.TkActionDeny:
					return &RuleResult{
						Action: "Block",
						Reason: fmt.Sprintf("blocked by WAF rule: %d", rule.ID()),
					}, nil
				case parser.TkActionAllow:
					return &RuleResult{
						Action: "Allow",
					}, nil
				case parser.TkActionDrop:
					return &RuleResult{
						Action: "Drop",
						Reason: fmt.Sprintf("dropped by WAF rule: %d", rule.ID()),
					}, nil
				default:
					continue
				}
			}
		}
	}
	return nil, nil
}

func processRequest(tx types.Transaction, req *http.Request) {
	tx.ProcessURI(req.URL.String(), req.Method, req.Proto)

	for key, values := range req.Header {
		for _, value := range values {
			tx.AddRequestHeader(key, value)
		}
	}
	tx.ProcessRequestHeaders()

	// Feed the body bytes into Coraza. Without WriteRequestBody, ProcessRequestBody
	// runs against an empty buffer, so phase:2 rules referencing REQUEST_BODY,
	// ARGS_POST, or json-decoded body args see no data and never fire. We also
	// restore req.Body afterwards so the downstream reverse proxy and any
	// later rule in CheckRules can still read the same bytes.
	bodyBytes, err := readAndRestoreBody(req)
	if err != nil {
		fmt.Printf("[WAF] read body failed: %v\n", err)
		return
	}
	if len(bodyBytes) > 0 {
		// Coraza v3: WriteRequestBody returns (interruption, n, err). We don't
		// surface the interruption directly here — MatchedRules() picked up by
		// the caller will reflect any phase:2 hit triggered during the write.
		if _, _, err := tx.WriteRequestBody(bodyBytes); err != nil {
			// Most often: SecRequestBodyLimit exceeded. Log and continue —
			// oversize bodies just won't be inspected; we shouldn't abort
			// the request from the WAF layer here.
			fmt.Printf("[WAF] WriteRequestBody error: %v\n", err)
		}
	}
	if _, err := tx.ProcessRequestBody(); err != nil {
		fmt.Printf("[WAF] ProcessRequestBody error: %v\n", err)
	}
}

// readAndRestoreBody fully buffers req.Body and replaces it with a fresh
// reader over the same bytes so callers further down the pipeline (the
// next WAF rule, the reverse proxy) can still read it. Returns nil bytes
// without error when the body is absent.
func readAndRestoreBody(req *http.Request) ([]byte, error) {
	if req.Body == nil || req.Body == http.NoBody {
		return nil, nil
	}
	bodyBytes, err := io.ReadAll(req.Body)
	if err != nil {
		return nil, err
	}
	_ = req.Body.Close()
	req.Body = io.NopCloser(bytes.NewReader(bodyBytes))
	return bodyBytes, nil
}

func logError(error types.MatchedRule) {
	msg := error.ErrorLog()
	fmt.Printf("[WAFlogError][%s] %s\n", error.Rule().Severity(), msg)
}
