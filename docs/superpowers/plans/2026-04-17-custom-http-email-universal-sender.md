# Custom HTTP Email — Universal HTTP Email Sender Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken `Custom HTTP Email` provider with a universal HTTP sender that works out-of-the-box with Cloudflare / Mailgun / SendGrid / Postmark / Resend / Mailjet / AWS SES and any REST email API, via user-editable request templates with context-aware escaping and SSRF protection.

**Architecture:** Add dedicated Provider fields (`BodyMapping`, `ContentType`, `BodyTemplate`) that stop reusing `UserMapping` / `IssuerUrl`; introduce a `${var}` placeholder engine that escapes values based on content-type; gate all outbound HTTP through an SSRF-safe `http.RoundTripper`; ship built-in presets so users pick a provider name and only fill credentials.

**Tech Stack:** Go 1.22 (stdlib `net/http`, `net`, `encoding/json`, `net/url`, `mime/multipart`), xorm v1 migrations, React 18 + TypeScript (web-new frontend), i18next.

**Scope notes:**
- In-scope: Email category only. SMS Custom HTTP (`object/sms_custom_http.go`) stays; any shared helpers are extracted carefully.
- In-scope: Backwards-compatible data migration of existing mis-wired `Custom HTTP Email` rows.
- Out-of-scope: MIME / raw RFC 5322 mode (future phase); retry/backoff; bounce/webhook ingestion.

**Security summary:**
1. SSRF: DNS → IP resolve before dial, reject RFC1918 / loopback / link-local / metadata IPs unless an explicit admin allowlist entry matches.
2. Escaping: values are escaped based on declared `ContentType` before substitution (JSON, form, URL, raw).
3. Secrets: `Authorization` / `*-Key` / `*-Token` header values are **never** logged; error responses are truncated to 4 KB and stripped of known header echoes.
4. Header injection: rely on `net/http`'s built-in `\r\n` rejection (already hardens value-side).
5. Body size: response body read via `io.LimitReader(resp.Body, 64 * 1024)` to avoid OOM on malicious endpoints.
6. Timeouts: 20 s dial, 30 s overall per request.

---

## File Structure

**Backend — new files:**
- `email/template.go` — placeholder engine, escapers, `Context` struct
- `email/template_test.go` — table-driven unit tests
- `email/ssrf_guard.go` — IP-level SSRF protection
- `email/ssrf_guard_test.go` — unit tests for blocked/allowed IPs
- `email/http_sender.go` — new sender (will supersede `custom_http.go`)
- `email/http_sender_test.go` — unit + integration tests via `httptest`
- `email/presets.go` — built-in provider presets (Cloudflare, Mailgun, etc.)
- `email/presets_test.go` — ensures each preset renders valid body
- `object/provider_migrate_http_email.go` — one-shot migration helper

**Backend — modified files:**
- `object/provider.go` — add `BodyMapping`, `ContentType`, `BodyTemplate` columns
- `object/email.go` — fix `SendEmail` wiring, pass correct fields
- `email/provider.go` — change `GetEmailProvider` signature; dispatch to `http_sender`
- `email/custom_http.go` — delete (replaced by `http_sender.go`)
- `conf/app.conf.example` — add `ssrfAllowedHosts=` config key
- `object/init.go` — invoke migration helper on startup (once)

**Frontend — new files:**
- `web-new/src/components/BodyTemplateEditor.tsx` — template textarea + live preview + variable chips
- `web-new/src/components/PresetPicker.tsx` — picker dropdown + autofill
- `web-new/src/data/emailPresets.ts` — preset definitions (parallel to backend presets for instant apply)

**Frontend — modified files:**
- `web-new/src/pages/ProviderEditPage.tsx` — replace old `emailMapping` section around lines 990–1024
- `web-new/src/locales/en.ts` — add `providers.httpEmail.*` keys
- `web-new/src/locales/zh.ts` — same

**Docs — new files:**
- `docs/http-email-presets.md` — authoring guide for new presets
- `docs/http-email-migration.md` — runbook for admins upgrading

---

## Phase 1 — Foundation (new fields, template engine, SSRF guard)

### Task 1: Add new Provider fields + xorm migration

**Files:**
- Modify: `object/provider.go` (struct around lines 35–89)

- [ ] **Step 1: Add fields to `Provider` struct**

Open `object/provider.go`, locate the `Provider` struct, and insert after the existing `HttpHeaders` line (line 57):

```go
	HttpHeaders  map[string]string `xorm:"varchar(500)" json:"httpHeaders"`
	BodyMapping  map[string]string `xorm:"varchar(1000)" json:"bodyMapping"`  // NEW
	ContentType  string            `xorm:"varchar(100)"  json:"contentType"`  // NEW
	BodyTemplate string            `xorm:"text"          json:"bodyTemplate"` // NEW
```

- [ ] **Step 2: Verify xorm auto-migrates the columns**

xorm `Sync2` in `object/adapter.go` auto-adds columns on startup. Run:

```bash
go build ./...
```

Expected: builds cleanly.

- [ ] **Step 3: Run server locally once to let xorm sync schema**

```bash
go run main.go & sleep 5 && kill %1
```

Expected: startup log shows Provider table sync; no errors.

- [ ] **Step 4: Confirm columns exist (SQLite example)**

```bash
sqlite3 jetauth.db '.schema provider' | grep -E 'body_mapping|content_type|body_template'
```

Expected: three lines printed.

- [ ] **Step 5: Commit**

```bash
git add object/provider.go
git commit -m "feat(provider): add BodyMapping/ContentType/BodyTemplate columns"
```

---

### Task 2: Placeholder template engine with content-type-aware escaping

**Files:**
- Create: `email/template.go`
- Create: `email/template_test.go`

- [ ] **Step 1: Write failing test for JSON escaping**

Create `email/template_test.go`:

```go
package email

import "testing"

func TestRender_JSONEscapesQuotes(t *testing.T) {
	ctx := Context{FromAddress: "a@b.c", Subject: `He said "hi"`, Content: "line1\nline2"}
	out, err := Render(`{"from":"${fromAddress}","subject":"${subject}","html":"${content}"}`, "application/json", ctx)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"from":"a@b.c","subject":"He said \"hi\"","html":"line1\nline2"}`
	if out != want {
		t.Fatalf("got %q\nwant %q", out, want)
	}
}

func TestRender_FormURLEncodes(t *testing.T) {
	ctx := Context{Subject: "a b&c", Content: "hello world"}
	out, err := Render(`subject=${subject}&body=${content}`, "application/x-www-form-urlencoded", Context{Subject: ctx.Subject, Content: ctx.Content})
	if err != nil {
		t.Fatal(err)
	}
	want := `subject=a+b%26c&body=hello+world`
	if out != want {
		t.Fatalf("got %q\nwant %q", out, want)
	}
}

func TestRender_ToAddressesArrayInJSON(t *testing.T) {
	ctx := Context{ToAddresses: []string{"x@y.com", "z@y.com"}}
	out, err := Render(`{"to":${toAddresses}}`, "application/json", ctx)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"to":["x@y.com","z@y.com"]}`
	if out != want {
		t.Fatalf("got %q want %q", out, want)
	}
}

func TestRender_RejectsUnknownPlaceholder(t *testing.T) {
	_, err := Render(`${mystery}`, "application/json", Context{})
	if err == nil {
		t.Fatal("expected error for unknown placeholder")
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
go test ./email -run TestRender -v
```

Expected: `FAIL` — `Render` / `Context` undefined.

- [ ] **Step 3: Implement `email/template.go`**

```go
// Copyright 2026 JetAuth Authors. All Rights Reserved.
package email

import (
	"encoding/json"
	"fmt"
	"net/url"
	"regexp"
	"strings"
)

// Context holds every variable a template may reference.
// Consumers fill it before calling Render.
type Context struct {
	FromAddress string
	FromName    string
	ToAddress   string   // first recipient (string placeholder)
	ToAddresses []string // all recipients (array placeholder)
	Subject     string
	Content     string   // HTML body
	ContentText string   // plain text body (optional)
}

var placeholderRe = regexp.MustCompile(`\$\{([a-zA-Z][a-zA-Z0-9_]*)\}`)

// Render substitutes ${var} placeholders in tmpl using ctx, escaping each
// value appropriately for contentType. ${toAddresses} is a structural
// placeholder that expands to a native array/multi-value — not a string.
func Render(tmpl, contentType string, ctx Context) (string, error) {
	var firstErr error
	out := placeholderRe.ReplaceAllStringFunc(tmpl, func(m string) string {
		name := placeholderRe.FindStringSubmatch(m)[1]
		v, err := lookup(name, ctx, contentType)
		if err != nil && firstErr == nil {
			firstErr = err
		}
		return v
	})
	if firstErr != nil {
		return "", firstErr
	}
	return out, nil
}

func lookup(name string, ctx Context, contentType string) (string, error) {
	switch name {
	case "fromAddress":
		return escape(ctx.FromAddress, contentType), nil
	case "fromName":
		return escape(ctx.FromName, contentType), nil
	case "toAddress":
		return escape(ctx.ToAddress, contentType), nil
	case "toAddresses":
		return encodeArray(ctx.ToAddresses, contentType), nil
	case "subject":
		return escape(ctx.Subject, contentType), nil
	case "content":
		return escape(ctx.Content, contentType), nil
	case "contentText":
		return escape(ctx.ContentText, contentType), nil
	default:
		return "", fmt.Errorf("unknown placeholder ${%s}", name)
	}
}

func escape(v, contentType string) string {
	switch normalizeContentType(contentType) {
	case "application/json":
		b, _ := json.Marshal(v) // always succeeds for string
		s := string(b)
		return s[1 : len(s)-1] // strip surrounding quotes (template supplies them)
	case "application/x-www-form-urlencoded":
		return url.QueryEscape(v)
	case "text/plain", "":
		return v
	default:
		return v
	}
}

func encodeArray(vs []string, contentType string) string {
	switch normalizeContentType(contentType) {
	case "application/json":
		b, _ := json.Marshal(vs)
		return string(b)
	case "application/x-www-form-urlencoded":
		parts := make([]string, 0, len(vs))
		for _, v := range vs {
			parts = append(parts, url.QueryEscape(v))
		}
		return strings.Join(parts, ",")
	default:
		return strings.Join(vs, ",")
	}
}

func normalizeContentType(ct string) string {
	// strip parameters like "; charset=utf-8"
	if i := strings.Index(ct, ";"); i >= 0 {
		ct = ct[:i]
	}
	return strings.ToLower(strings.TrimSpace(ct))
}
```

- [ ] **Step 4: Run tests**

```bash
go test ./email -run TestRender -v
```

Expected: all four tests PASS.

- [ ] **Step 5: Commit**

```bash
git add email/template.go email/template_test.go
git commit -m "feat(email): add ${var} template engine with content-type escaping"
```

---

### Task 3: SSRF-protected HTTP transport

**Files:**
- Create: `email/ssrf_guard.go`
- Create: `email/ssrf_guard_test.go`

- [ ] **Step 1: Write failing test**

Create `email/ssrf_guard_test.go`:

```go
package email

import (
	"net"
	"testing"
)

func TestIsBlockedIP_LoopbackBlocked(t *testing.T) {
	if !isBlockedIP(net.ParseIP("127.0.0.1"), nil) {
		t.Error("127.0.0.1 must be blocked")
	}
}

func TestIsBlockedIP_PrivateBlocked(t *testing.T) {
	for _, ip := range []string{"10.0.0.1", "192.168.1.1", "172.16.0.1", "169.254.169.254"} {
		if !isBlockedIP(net.ParseIP(ip), nil) {
			t.Errorf("%s must be blocked", ip)
		}
	}
}

func TestIsBlockedIP_PublicAllowed(t *testing.T) {
	if isBlockedIP(net.ParseIP("8.8.8.8"), nil) {
		t.Error("8.8.8.8 must be allowed")
	}
}

func TestIsBlockedIP_AllowlistOverrides(t *testing.T) {
	allow := []string{"10.0.0.0/8"}
	if isBlockedIP(net.ParseIP("10.1.2.3"), allow) {
		t.Error("allowlisted 10.1.2.3 must pass")
	}
}
```

- [ ] **Step 2: Run tests to verify failure**

```bash
go test ./email -run TestIsBlockedIP -v
```

Expected: FAIL — `isBlockedIP` undefined.

- [ ] **Step 3: Implement `email/ssrf_guard.go`**

```go
// Copyright 2026 JetAuth Authors. All Rights Reserved.
package email

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"syscall"
	"time"
)

var blockedCIDRs = mustParseCIDRs([]string{
	"0.0.0.0/8",          // current network
	"10.0.0.0/8",         // RFC1918
	"100.64.0.0/10",      // CGNAT
	"127.0.0.0/8",        // loopback
	"169.254.0.0/16",     // link-local + metadata
	"172.16.0.0/12",      // RFC1918
	"192.0.0.0/24",       // IETF
	"192.168.0.0/16",     // RFC1918
	"198.18.0.0/15",      // benchmark
	"224.0.0.0/4",        // multicast
	"240.0.0.0/4",        // reserved
	"::1/128",            // IPv6 loopback
	"fc00::/7",           // IPv6 ULA
	"fe80::/10",          // IPv6 link-local
})

// isBlockedIP returns true when ip is in a dangerous private/metadata range,
// unless any allowlist CIDR contains it.
func isBlockedIP(ip net.IP, allowlist []string) bool {
	if ip == nil {
		return true
	}
	allowed := mustParseCIDRs(allowlist)
	for _, c := range allowed {
		if c.Contains(ip) {
			return false
		}
	}
	for _, c := range blockedCIDRs {
		if c.Contains(ip) {
			return true
		}
	}
	return false
}

func mustParseCIDRs(strs []string) []*net.IPNet {
	out := make([]*net.IPNet, 0, len(strs))
	for _, s := range strs {
		_, n, err := net.ParseCIDR(s)
		if err != nil {
			continue
		}
		out = append(out, n)
	}
	return out
}

// NewSafeTransport returns an http.RoundTripper that refuses to connect to
// any IP returned in blockedCIDRs, unless allowlist contains the IP.
func NewSafeTransport(allowlist []string) *http.Transport {
	dialer := &net.Dialer{Timeout: 20 * time.Second, KeepAlive: 30 * time.Second}
	return &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, err
			}
			ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
			if err != nil {
				return nil, err
			}
			if len(ips) == 0 {
				return nil, fmt.Errorf("no IPs resolved for %s", host)
			}
			for _, ip := range ips {
				if isBlockedIP(ip.IP, allowlist) {
					return nil, &SSRFError{Host: host, IP: ip.IP}
				}
			}
			return dialer.DialContext(ctx, network, net.JoinHostPort(ips[0].IP.String(), port))
		},
		MaxIdleConns:          20,
		IdleConnTimeout:       60 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}
}

// SSRFError is returned when an outbound request targets a disallowed IP.
type SSRFError struct {
	Host string
	IP   net.IP
}

func (e *SSRFError) Error() string {
	return fmt.Sprintf("SSRF blocked: host %s resolved to disallowed IP %s", e.Host, e.IP)
}

// IsConnRefused is used by tests to assert dial failure, not SSRF.
func IsConnRefused(err error) bool {
	var se *SSRFError
	if errors.As(err, &se) {
		return false
	}
	var syse syscall.Errno
	if errors.As(err, &syse) {
		return syse == syscall.ECONNREFUSED
	}
	return false
}
```

- [ ] **Step 4: Run tests**

```bash
go test ./email -run TestIsBlockedIP -v
```

Expected: all four tests PASS.

- [ ] **Step 5: Commit**

```bash
git add email/ssrf_guard.go email/ssrf_guard_test.go
git commit -m "feat(email): add SSRF-safe http transport for outbound API calls"
```

---

### Task 4: One-shot migration for existing providers

**Files:**
- Create: `object/provider_migrate_http_email.go`
- Modify: `object/init.go` (append migration call to `InitFromFile` or equivalent)

- [ ] **Step 1: Write the migration helper**

Create `object/provider_migrate_http_email.go`:

```go
// Copyright 2026 JetAuth Authors. All Rights Reserved.
package object

// migrateCustomHttpEmailProviders moves legacy data written into UserMapping /
// IssuerUrl (which the old Custom HTTP Email code reused as bodyMapping /
// contentType) into the new dedicated BodyMapping / ContentType fields,
// then clears UserMapping so it stops masquerading as OAuth user mapping.
//
// Safe to run multiple times: it is a no-op once BodyMapping is populated
// or for non-Email providers.
func migrateCustomHttpEmailProviders() (int, error) {
	providers := []*Provider{}
	if err := ormer.Engine.Where("category = ? and type = ?", "Email", "Custom HTTP Email").Find(&providers); err != nil {
		return 0, err
	}
	count := 0
	for _, p := range providers {
		touched := false
		if len(p.BodyMapping) == 0 && len(p.UserMapping) > 0 {
			p.BodyMapping = p.UserMapping
			p.UserMapping = map[string]string{}
			touched = true
		}
		if p.ContentType == "" && p.IssuerUrl != "" {
			p.ContentType = p.IssuerUrl
			p.IssuerUrl = ""
			touched = true
		}
		if touched {
			if _, err := ormer.Engine.ID(core.PK{p.Owner, p.Name}).
				Cols("body_mapping", "content_type", "user_mapping", "issuer_url").
				Update(p); err != nil {
				return count, err
			}
			count++
		}
	}
	return count, nil
}
```

- [ ] **Step 2: Add missing import at top of that file**

Prepend imports block to the file:

```go
import "github.com/xorm-io/core"
```

- [ ] **Step 3: Call it once at startup**

Open `object/init.go`, find the function called during server boot (search for `InitDb` / `initBuiltInOrganization`). Append a new function:

```go
func InitCustomHttpEmailMigration() {
	n, err := migrateCustomHttpEmailProviders()
	if err != nil {
		panic(err)
	}
	if n > 0 {
		fmt.Printf("[migration] upgraded %d Custom HTTP Email providers\n", n)
	}
}
```

Wire it from `main.go` **after** `object.InitAdapter()` / database init runs. Open `main.go`, locate the init block, append:

```go
object.InitCustomHttpEmailMigration()
```

- [ ] **Step 4: Smoke test**

```bash
go build ./... && go run main.go & sleep 5 && kill %1
```

Expected: startup prints `[migration] upgraded N Custom HTTP Email providers` if any existed; no crash.

- [ ] **Step 5: Commit**

```bash
git add object/provider_migrate_http_email.go object/init.go main.go
git commit -m "feat(provider): migrate legacy Custom HTTP Email config to new fields"
```

---

## Phase 2 — Core Sender

### Task 5: New `HttpEmailSender`

**Files:**
- Create: `email/http_sender.go`
- Create: `email/http_sender_test.go`

- [ ] **Step 1: Write failing integration test with httptest server**

Create `email/http_sender_test.go`:

```go
package email

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHttpSender_JSONBody(t *testing.T) {
	var gotBody map[string]any
	var gotAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		if ct := r.Header.Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
			t.Fatalf("unexpected Content-Type: %s", ct)
		}
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.WriteHeader(200)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	s := &HttpEmailSender{
		Endpoint:     srv.URL,
		Method:       "POST",
		ContentType:  "application/json",
		HttpHeaders:  map[string]string{"Authorization": "Bearer T"},
		BodyTemplate: `{"from":"${fromAddress}","to":"${toAddress}","subject":"${subject}","html":"${content}"}`,
	}
	if err := s.Send("a@b.c", "Alice", []string{"rcpt@example.com"}, "Hi", "<p>Hello</p>"); err != nil {
		t.Fatal(err)
	}
	if gotAuth != "Bearer T" {
		t.Errorf("header missing: %q", gotAuth)
	}
	if gotBody["from"] != "a@b.c" || gotBody["to"] != "rcpt@example.com" || gotBody["html"] != "<p>Hello</p>" {
		t.Errorf("body mismatch: %+v", gotBody)
	}
}

func TestHttpSender_ErrorPropagatesBody(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(400)
		_, _ = w.Write([]byte(`{"errors":[{"code":10001,"message":"bad"}]}`))
	}))
	defer srv.Close()

	s := &HttpEmailSender{
		Endpoint: srv.URL, Method: "POST", ContentType: "application/json",
		BodyTemplate: `{"x":1}`,
	}
	err := s.Send("a@b.c", "A", []string{"r@e.com"}, "s", "c")
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "10001") {
		t.Errorf("error body not included: %v", err)
	}
}
```

- [ ] **Step 2: Run tests to verify failure**

```bash
go test ./email -run TestHttpSender -v
```

Expected: FAIL — `HttpEmailSender` undefined.

- [ ] **Step 3: Implement `email/http_sender.go`**

```go
// Copyright 2026 JetAuth Authors. All Rights Reserved.
package email

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// HttpEmailSender is the universal provider: endpoint + method + headers +
// body template. See email/template.go for placeholder semantics.
type HttpEmailSender struct {
	Endpoint     string
	Method       string
	ContentType  string
	HttpHeaders  map[string]string
	BodyTemplate string
	BodyMapping  map[string]string // optional: reserved for future nested mappings
	EnableProxy  bool
	Allowlist    []string // private-IP CIDRs admin allows
}

func (s *HttpEmailSender) Send(fromAddress, fromName string, toAddress []string, subject, content string) error {
	if s.Endpoint == "" {
		return fmt.Errorf("HttpEmailSender: endpoint is required")
	}
	if s.BodyTemplate == "" {
		return fmt.Errorf("HttpEmailSender: bodyTemplate is required")
	}
	method := strings.ToUpper(strings.TrimSpace(s.Method))
	if method == "" {
		method = "POST"
	}

	ctx := Context{
		FromAddress: fromAddress,
		FromName:    fromName,
		ToAddress:   firstOrEmpty(toAddress),
		ToAddresses: toAddress,
		Subject:     subject,
		Content:     content,
	}
	body, err := Render(s.BodyTemplate, s.ContentType, ctx)
	if err != nil {
		return fmt.Errorf("HttpEmailSender: render template: %w", err)
	}

	var reqBody io.Reader
	if method == "GET" || method == "HEAD" || method == "DELETE" {
		reqBody = nil
	} else {
		reqBody = strings.NewReader(body)
	}

	reqCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, method, s.Endpoint, reqBody)
	if err != nil {
		return err
	}
	if s.ContentType != "" && reqBody != nil {
		req.Header.Set("Content-Type", s.ContentType)
	}
	for k, v := range s.HttpHeaders {
		req.Header.Set(k, v)
	}

	client := &http.Client{Transport: NewSafeTransport(s.Allowlist), Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("HttpEmailSender: request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		excerpt, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("HttpEmailSender: status %s body=%s", resp.Status, string(excerpt))
	}
	// drain rest so connection can be reused
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 64*1024))
	return nil
}

func firstOrEmpty(ss []string) string {
	if len(ss) == 0 {
		return ""
	}
	return ss[0]
}
```

- [ ] **Step 4: Run tests**

```bash
go test ./email -run TestHttpSender -v
```

Expected: both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add email/http_sender.go email/http_sender_test.go
git commit -m "feat(email): add HttpEmailSender with SSRF guard and error-body surfacing"
```

---

### Task 6: Replace old `HttpEmailProvider`, update `GetEmailProvider` signature

**Files:**
- Delete: `email/custom_http.go`
- Modify: `email/provider.go`

- [ ] **Step 1: Delete the old file**

```bash
git rm email/custom_http.go
```

- [ ] **Step 2: Rewrite `email/provider.go`**

```go
// Copyright 2023 The Casdoor Authors. All Rights Reserved.
package email

type EmailProvider interface {
	Send(fromAddress string, fromName string, toAddress []string, subject string, content string) error
}

// HttpEmailOptions collects every custom-http-email-specific config so the
// top-level GetEmailProvider signature stays maintainable.
type HttpEmailOptions struct {
	Endpoint     string
	Method       string
	ContentType  string
	HttpHeaders  map[string]string
	BodyMapping  map[string]string
	BodyTemplate string
	EnableProxy  bool
	Allowlist    []string
}

type EmailOptions struct {
	ClientId     string
	ClientSecret string
	Host         string
	Port         int
	SslMode      string
	EnableProxy  bool
	// Used only by SendGrid to set the REST endpoint override.
	Endpoint string
	// Populated only when Type == "Custom HTTP Email".
	Http *HttpEmailOptions
}

func GetEmailProvider(typ string, o EmailOptions) EmailProvider {
	switch typ {
	case "Azure ACS":
		return NewAzureACSEmailProvider(o.ClientSecret, o.Host)
	case "Custom HTTP Email":
		if o.Http == nil {
			return nil
		}
		return &HttpEmailSender{
			Endpoint:     o.Http.Endpoint,
			Method:       o.Http.Method,
			ContentType:  o.Http.ContentType,
			HttpHeaders:  o.Http.HttpHeaders,
			BodyMapping:  o.Http.BodyMapping,
			BodyTemplate: o.Http.BodyTemplate,
			EnableProxy:  o.Http.EnableProxy,
			Allowlist:    o.Http.Allowlist,
		}
	case "SendGrid":
		return NewSendgridEmailProvider(o.ClientSecret, o.Host, o.Endpoint)
	case "Resend":
		return NewResendEmailProvider(o.ClientSecret)
	default:
		return NewSmtpEmailProvider(o.ClientId, o.ClientSecret, o.Host, o.Port, typ, o.SslMode, o.EnableProxy)
	}
}
```

- [ ] **Step 3: Verify build breaks at call sites**

```bash
go build ./...
```

Expected: compile errors at `object/email.go:36` referencing the old 12-arg signature. That's the target of Task 7.

- [ ] **Step 4: Run package tests**

```bash
go test ./email/... -v
```

Expected: `TestHttpSender*` still passes; no compile error inside the `email` package itself.

- [ ] **Step 5: Commit**

```bash
git add email/provider.go
git rm email/custom_http.go
git commit -m "refactor(email): replace HttpEmailProvider with HttpEmailSender, typed options"
```

---

### Task 7: Fix `SendEmail` wiring (the root bug)

**Files:**
- Modify: `object/email.go`

- [ ] **Step 1: Rewrite the function**

Open `object/email.go`, replace the entire `SendEmail` function body (lines 34–49):

```go
func SendEmail(provider *Provider, title string, content string, dest []string, sender string) error {
	sslMode := getSslMode(provider)

	opts := email.EmailOptions{
		ClientId:     provider.ClientId,
		ClientSecret: provider.ClientSecret,
		Host:         provider.Host,
		Port:         provider.Port,
		SslMode:      sslMode,
		EnableProxy:  provider.EnableProxy,
		Endpoint:     provider.Endpoint,
	}

	if provider.Type == "Custom HTTP Email" {
		opts.Http = &email.HttpEmailOptions{
			Endpoint:     provider.Endpoint,
			Method:       provider.Method,
			ContentType:  provider.ContentType,
			HttpHeaders:  provider.HttpHeaders,
			BodyMapping:  provider.BodyMapping,
			BodyTemplate: provider.BodyTemplate,
			EnableProxy:  provider.EnableProxy,
			Allowlist:    getSsrfAllowlist(),
		}
	}

	emailProvider := email.GetEmailProvider(provider.Type, opts)
	if emailProvider == nil {
		return fmt.Errorf("SendEmail: provider %q is not configured", provider.Name)
	}

	fromAddress := provider.ClientId2
	if fromAddress == "" {
		fromAddress = provider.ClientId
	}
	fromName := provider.ClientSecret2
	if fromName == "" {
		fromName = sender
	}
	return emailProvider.Send(fromAddress, fromName, dest, title, content)
}

// getSsrfAllowlist reads comma-separated CIDRs from `ssrfAllowedHosts` conf key.
func getSsrfAllowlist() []string {
	raw := conf.GetConfigString("ssrfAllowedHosts")
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if s := strings.TrimSpace(p); s != "" {
			out = append(out, s)
		}
	}
	return out
}
```

- [ ] **Step 2: Add imports**

Top of file, replace imports block:

```go
import (
	"fmt"
	"strings"

	"github.com/beego/beego/v2/server/web"
	"github.com/deluxebear/jetauth/conf"
	"github.com/deluxebear/jetauth/email"
)
```

(Drop `web` if unused after edit — verify with `goimports`.)

- [ ] **Step 3: Build + vet**

```bash
go build ./... && go vet ./...
```

Expected: clean build.

- [ ] **Step 4: Run tests that touch SendEmail**

```bash
go test ./object/... -run Email -v
```

Expected: existing tests (if any) still pass.

- [ ] **Step 5: Commit**

```bash
git add object/email.go
git commit -m "fix(email): route provider fields correctly, wire SSRF allowlist"
```

---

### Task 8: End-to-end test — Cloudflare preset against mock server

**Files:**
- Modify: `email/http_sender_test.go` (append)

- [ ] **Step 1: Append new test**

```go
func TestHttpSender_CloudflarePreset(t *testing.T) {
	var got map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" { t.Fatalf("method=%s", r.Method) }
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &got)
		w.WriteHeader(200)
		_, _ = w.Write([]byte(`{"success":true}`))
	}))
	defer srv.Close()

	tmpl := `{"from":{"address":"${fromAddress}","name":"${fromName}"},"to":"${toAddress}","subject":"${subject}","html":"${content}"}`
	s := &HttpEmailSender{
		Endpoint: srv.URL, Method: "POST", ContentType: "application/json",
		HttpHeaders:  map[string]string{"Authorization": "Bearer cf-token"},
		BodyTemplate: tmpl,
	}
	if err := s.Send("eric@judgeany.com", "Eric", []string{"deluxebear@gmail.com"}, "hi", `<p>"Hello"</p>`); err != nil {
		t.Fatal(err)
	}
	from := got["from"].(map[string]any)
	if from["address"] != "eric@judgeany.com" || from["name"] != "Eric" {
		t.Errorf("from mismatch: %v", from)
	}
	if got["html"] != `<p>"Hello"</p>` {
		t.Errorf("html not preserved (escaping broken): %v", got["html"])
	}
}
```

- [ ] **Step 2: Run**

```bash
go test ./email -run TestHttpSender_CloudflarePreset -v
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add email/http_sender_test.go
git commit -m "test(email): verify Cloudflare-shaped template round-trips"
```

---

## Phase 3 — Presets

### Task 9: Backend preset catalog

**Files:**
- Create: `email/presets.go`
- Create: `email/presets_test.go`

- [ ] **Step 1: Write failing test**

Create `email/presets_test.go`:

```go
package email

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestPresets_CloudflareRendersValidJSON(t *testing.T) {
	p, ok := FindPreset("cloudflare")
	if !ok { t.Fatal("cloudflare preset missing") }
	out, err := Render(p.BodyTemplate, p.ContentType, Context{
		FromAddress: "a@b.c", FromName: "A",
		ToAddress: "r@e.com", Subject: "s", Content: "<p>x</p>",
	})
	if err != nil { t.Fatal(err) }
	var v any
	if err := json.Unmarshal([]byte(out), &v); err != nil {
		t.Errorf("invalid JSON from cloudflare preset: %v\n%s", err, out)
	}
}

func TestPresets_AllKeysUnique(t *testing.T) {
	seen := map[string]bool{}
	for _, p := range AllPresets() {
		if seen[p.Key] { t.Errorf("dup preset key %s", p.Key) }
		seen[p.Key] = true
		if !strings.Contains(p.EndpointExample, "://") {
			t.Errorf("preset %s endpoint must include scheme", p.Key)
		}
	}
}
```

- [ ] **Step 2: Implement `email/presets.go`**

```go
// Copyright 2026 JetAuth Authors. All Rights Reserved.
package email

// Preset is a shippable default that fills endpoint/method/headers/body so
// admins only supply credentials and account ids.
type Preset struct {
	Key             string            // stable id
	Name            string            // human-readable
	EndpointExample string            // interpolatable URL hint (may contain {account_id} etc.)
	Method          string
	ContentType     string
	HttpHeaders     map[string]string // Authorization value is a hint — admin fills secret
	BodyTemplate    string
	Docs            string // URL to upstream docs
}

var presets = []Preset{
	{
		Key:             "cloudflare",
		Name:            "Cloudflare Email Sending",
		EndpointExample: "https://api.cloudflare.com/client/v4/accounts/{account_id}/email/sending/send",
		Method:          "POST",
		ContentType:     "application/json",
		HttpHeaders:     map[string]string{"Authorization": "Bearer {api_token}", "Content-Type": "application/json"},
		BodyTemplate:    `{"from":{"address":"${fromAddress}","name":"${fromName}"},"to":"${toAddress}","subject":"${subject}","html":"${content}"}`,
		Docs:            "https://developers.cloudflare.com/email-service/api/send-emails/rest-api/",
	},
	{
		Key:             "mailgun",
		Name:            "Mailgun",
		EndpointExample: "https://api.mailgun.net/v3/{domain}/messages",
		Method:          "POST",
		ContentType:     "application/x-www-form-urlencoded",
		HttpHeaders:     map[string]string{"Authorization": "Basic {base64(api:API_KEY)}"},
		BodyTemplate:    `from=${fromName} <${fromAddress}>&to=${toAddress}&subject=${subject}&html=${content}`,
		Docs:            "https://documentation.mailgun.com/en/latest/api-sending.html",
	},
	{
		Key:             "sendgrid",
		Name:            "SendGrid v3",
		EndpointExample: "https://api.sendgrid.com/v3/mail/send",
		Method:          "POST",
		ContentType:     "application/json",
		HttpHeaders:     map[string]string{"Authorization": "Bearer {api_key}", "Content-Type": "application/json"},
		BodyTemplate:    `{"personalizations":[{"to":[{"email":"${toAddress}"}],"subject":"${subject}"}],"from":{"email":"${fromAddress}","name":"${fromName}"},"content":[{"type":"text/html","value":"${content}"}]}`,
		Docs:            "https://docs.sendgrid.com/api-reference/mail-send/mail-send",
	},
	{
		Key:             "postmark",
		Name:            "Postmark",
		EndpointExample: "https://api.postmarkapp.com/email",
		Method:          "POST",
		ContentType:     "application/json",
		HttpHeaders:     map[string]string{"X-Postmark-Server-Token": "{server_token}", "Content-Type": "application/json", "Accept": "application/json"},
		BodyTemplate:    `{"From":"${fromName} <${fromAddress}>","To":"${toAddress}","Subject":"${subject}","HtmlBody":"${content}","MessageStream":"outbound"}`,
		Docs:            "https://postmarkapp.com/developer/api/email-api",
	},
	{
		Key:             "resend",
		Name:            "Resend",
		EndpointExample: "https://api.resend.com/emails",
		Method:          "POST",
		ContentType:     "application/json",
		HttpHeaders:     map[string]string{"Authorization": "Bearer {api_key}", "Content-Type": "application/json"},
		BodyTemplate:    `{"from":"${fromName} <${fromAddress}>","to":["${toAddress}"],"subject":"${subject}","html":"${content}"}`,
		Docs:            "https://resend.com/docs/api-reference/emails/send-email",
	},
	{
		Key:             "mailjet",
		Name:            "Mailjet v3.1",
		EndpointExample: "https://api.mailjet.com/v3.1/send",
		Method:          "POST",
		ContentType:     "application/json",
		HttpHeaders:     map[string]string{"Authorization": "Basic {base64(API_KEY:SECRET)}", "Content-Type": "application/json"},
		BodyTemplate:    `{"Messages":[{"From":{"Email":"${fromAddress}","Name":"${fromName}"},"To":[{"Email":"${toAddress}"}],"Subject":"${subject}","HTMLPart":"${content}"}]}`,
		Docs:            "https://dev.mailjet.com/email/reference/send-emails/",
	},
	{
		Key:             "brevo",
		Name:            "Brevo (Sendinblue) v3",
		EndpointExample: "https://api.brevo.com/v3/smtp/email",
		Method:          "POST",
		ContentType:     "application/json",
		HttpHeaders:     map[string]string{"api-key": "{api_key}", "Content-Type": "application/json", "Accept": "application/json"},
		BodyTemplate:    `{"sender":{"email":"${fromAddress}","name":"${fromName}"},"to":[{"email":"${toAddress}"}],"subject":"${subject}","htmlContent":"${content}"}`,
		Docs:            "https://developers.brevo.com/reference/sendtransacemail",
	},
	{
		Key:             "generic-json",
		Name:            "Generic JSON",
		EndpointExample: "https://example.com/send-email",
		Method:          "POST",
		ContentType:     "application/json",
		HttpHeaders:     map[string]string{"Content-Type": "application/json"},
		BodyTemplate:    `{"from":"${fromAddress}","fromName":"${fromName}","to":"${toAddress}","subject":"${subject}","html":"${content}"}`,
		Docs:            "",
	},
	{
		Key:             "generic-form",
		Name:            "Generic Form",
		EndpointExample: "https://example.com/send-email",
		Method:          "POST",
		ContentType:     "application/x-www-form-urlencoded",
		HttpHeaders:     map[string]string{},
		BodyTemplate:    `from=${fromAddress}&from_name=${fromName}&to=${toAddress}&subject=${subject}&html=${content}`,
		Docs:            "",
	},
}

// FindPreset returns the preset with the given key.
func FindPreset(key string) (Preset, bool) {
	for _, p := range presets {
		if p.Key == key {
			return p, true
		}
	}
	return Preset{}, false
}

// AllPresets returns a copy of the preset list.
func AllPresets() []Preset {
	cp := make([]Preset, len(presets))
	copy(cp, presets)
	return cp
}
```

- [ ] **Step 3: Run tests**

```bash
go test ./email -run TestPresets -v
```

Expected: both tests PASS.

- [ ] **Step 4: Expose HTTP endpoint so frontend can list presets**

Open `controllers/service.go`, add after `SendEmail`:

```go
// @Title GetHttpEmailPresets
// @router /get-http-email-presets [get]
func (c *ApiController) GetHttpEmailPresets() {
	c.ResponseOk(email.AllPresets())
}
```

Register route in `routers/router.go` (search for `SendEmail` registration and append):

```go
beego.Router("/api/get-http-email-presets", &controllers.ApiController{}, "get:GetHttpEmailPresets")
```

Run:

```bash
go build ./... && go run main.go & sleep 5 && curl -s localhost:8000/api/get-http-email-presets | head -c 200 && kill %1
```

Expected: JSON array containing `"key":"cloudflare"`.

- [ ] **Step 5: Commit**

```bash
git add email/presets.go email/presets_test.go controllers/service.go routers/router.go
git commit -m "feat(email): ship built-in presets for 7 mainstream email APIs + generic"
```

---

## Phase 4 — Frontend

### Task 10: `BodyTemplateEditor` component

**Files:**
- Create: `web-new/src/components/BodyTemplateEditor.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

type Props = {
  value: string;
  onChange: (v: string) => void;
  contentType: string;
  className?: string;
};

const VARIABLES = [
  "fromAddress", "fromName",
  "toAddress", "toAddresses",
  "subject", "content", "contentText",
];

export function BodyTemplateEditor({ value, onChange, contentType, className }: Props) {
  const { t } = useTranslation();

  const preview = useMemo(() => {
    const sample: Record<string, string> = {
      fromAddress: "noreply@yourdomain.com",
      fromName: "JetAuth",
      toAddress: "user@example.com",
      toAddresses: JSON.stringify(["user@example.com"]),
      subject: "Your code is 123456",
      content: "<p>Welcome</p>",
      contentText: "Welcome",
    };
    return value.replace(/\$\{(\w+)\}/g, (_, k) => sample[k] ?? `\${${k}}`);
  }, [value]);

  return (
    <div className={className}>
      <div className="mb-2 flex flex-wrap gap-1">
        {VARIABLES.map((v) => (
          <button
            key={v}
            type="button"
            className="rounded bg-surface-2 px-2 py-0.5 text-[11px] text-text-secondary hover:bg-surface-3"
            onClick={() => onChange(value + `\${${v}}`)}
          >
            {"${" + v + "}"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={12}
          spellCheck={false}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-[11px]"
          placeholder={t("providers.httpEmail.bodyTemplatePlaceholder" as any)}
        />
        <pre className="max-h-[300px] overflow-auto rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-[11px] whitespace-pre-wrap">
          {preview}
        </pre>
      </div>
      <p className="mt-1 text-[11px] text-text-tertiary">
        {t("providers.httpEmail.contentTypeNote" as any)}: <code>{contentType || "(none)"}</code>
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Quick smoke in-browser**

```bash
cd web-new && npm run dev &
```

Navigate to any page — component not yet used. Expected: no compile errors in dev console.

- [ ] **Step 3: Kill dev server**

```bash
kill %1
```

- [ ] **Step 4: Type-check**

```bash
cd web-new && npm run build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add web-new/src/components/BodyTemplateEditor.tsx
git commit -m "feat(web): BodyTemplateEditor component with variable chips and live preview"
```

---

### Task 11: `PresetPicker` component + data

**Files:**
- Create: `web-new/src/data/emailPresets.ts`
- Create: `web-new/src/components/PresetPicker.tsx`

- [ ] **Step 1: Create preset data (mirror backend)**

`web-new/src/data/emailPresets.ts`:

```ts
export type EmailPreset = {
  key: string;
  name: string;
  endpointExample: string;
  method: string;
  contentType: string;
  httpHeaders: Record<string, string>;
  bodyTemplate: string;
  docs: string;
};

export async function fetchEmailPresets(): Promise<EmailPreset[]> {
  const resp = await fetch("/api/get-http-email-presets", { credentials: "include" });
  if (!resp.ok) throw new Error(`presets fetch failed: ${resp.status}`);
  const json = await resp.json();
  return (json.data ?? json) as EmailPreset[];
}
```

- [ ] **Step 2: Create the picker**

`web-new/src/components/PresetPicker.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchEmailPresets, type EmailPreset } from "../data/emailPresets";

type Props = { onPick: (p: EmailPreset) => void };

export function PresetPicker({ onPick }: Props) {
  const { t } = useTranslation();
  const [presets, setPresets] = useState<EmailPreset[]>([]);
  useEffect(() => { fetchEmailPresets().then(setPresets).catch(() => setPresets([])); }, []);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[12px] text-text-secondary">{t("providers.httpEmail.preset" as any)}:</span>
      {presets.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => onPick(p)}
          className="rounded-lg border border-border px-2.5 py-1 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors"
          title={p.docs || p.name}
        >
          {p.name}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
cd web-new && npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Smoke in dev**

```bash
cd web-new && npm run dev &
```

No new render path uses it yet — just verify no errors.

```bash
kill %1
```

- [ ] **Step 5: Commit**

```bash
git add web-new/src/data/emailPresets.ts web-new/src/components/PresetPicker.tsx
git commit -m "feat(web): PresetPicker + preset fetcher"
```

---

### Task 12: Wire new UI into `ProviderEditPage`, remove old broken section

**Files:**
- Modify: `web-new/src/pages/ProviderEditPage.tsx` (lines 990–1024)

- [ ] **Step 1: Replace the Custom HTTP Email branch**

Find the block starting at `{type === "Custom HTTP Email" ? (` (around line 990). Replace the entire `<>...</>` subtree up through `) : (` with:

```tsx
{type === "Custom HTTP Email" ? (
  <>
    <FormSection title={t("providers.section.emailConfig" as any)}>
      {renderGuide()}
      <FormField label="" span="full">
        <PresetPicker onPick={(p) => {
          set("endpoint", p.endpointExample);
          set("method", p.method);
          set("contentType", p.contentType);
          set("httpHeaders", p.httpHeaders);
          set("bodyTemplate", p.bodyTemplate);
        }} />
      </FormField>
      <FormField label={t("providers.field.endpoint")} span="full">
        <input value={String(prov.endpoint ?? "")} onChange={(e) => set("endpoint", e.target.value)} className={inputClass} placeholder="https://api.example.com/send" />
      </FormField>
      <FormField label={t("providers.field.method" as any)}>
        <SimpleSelect value={String(prov.method ?? "POST")} options={[
          { value: "GET", label: "GET" },
          { value: "POST", label: "POST" },
          { value: "PUT", label: "PUT" },
          { value: "PATCH", label: "PATCH" },
          { value: "DELETE", label: "DELETE" },
        ]} onChange={(v) => set("method", v)} />
      </FormField>
      <FormField label={t("providers.httpEmail.contentType" as any)}>
        <SimpleSelect value={String(prov.contentType ?? "application/json")} options={[
          { value: "application/json", label: "application/json" },
          { value: "application/x-www-form-urlencoded", label: "application/x-www-form-urlencoded" },
          { value: "text/plain", label: "text/plain" },
        ]} onChange={(v) => set("contentType", v)} />
      </FormField>
      <FormField label={t("providers.field.enableProxy" as any)}>
        <Switch checked={!!prov.enableProxy} onChange={(v) => set("enableProxy", v)} />
      </FormField>
    </FormSection>

    <FormSection title={t("providers.section.httpHeaders" as any)}>
      <FormField label="" span="full">
        <HttpHeadersEditor
          headers={(prov.httpHeaders as Record<string, string>) ?? {}}
          onChange={(h) => set("httpHeaders", h)}
        />
      </FormField>
    </FormSection>

    <FormSection title={t("providers.httpEmail.bodyTemplate" as any)}>
      <FormField label="" span="full">
        <BodyTemplateEditor
          value={String(prov.bodyTemplate ?? "")}
          onChange={(v) => set("bodyTemplate", v)}
          contentType={String(prov.contentType ?? "application/json")}
        />
      </FormField>
    </FormSection>

    <FormSection title={t("providers.httpEmail.senderIdentity" as any)}>
      <FormField label={t("providers.field.fromAddress" as any)}>
        <input value={String(prov.clientId2 ?? "")} onChange={(e) => set("clientId2", e.target.value)} className={inputClass} placeholder="noreply@yourdomain.com" />
      </FormField>
      <FormField label={t("providers.field.fromName" as any)}>
        <input value={String(prov.clientSecret2 ?? "")} onChange={(e) => set("clientSecret2", e.target.value)} className={inputClass} placeholder="JetAuth" />
      </FormField>
    </FormSection>
  </>
) : (
```

- [ ] **Step 2: Add imports at top of file**

Find existing imports; insert:

```tsx
import { BodyTemplateEditor } from "../components/BodyTemplateEditor";
import { PresetPicker } from "../components/PresetPicker";
```

- [ ] **Step 3: Build**

```bash
cd web-new && npm run build
```

Expected: no TS errors.

- [ ] **Step 4: Manual QA**

```bash
cd web-new && npm run dev &
```

- Open a provider edit page, set Category=Email, Type=Custom HTTP Email.
- Click `Cloudflare` preset → endpoint/method/headers/bodyTemplate autofill.
- Edit body template → preview updates live.
- Send test mail to a whitelisted address → (if Cloudflare token is valid) mail arrives.
- Check browser devtools Network tab: request body is valid JSON, Content-Type matches.

Kill dev: `kill %1`

- [ ] **Step 5: Commit**

```bash
git add web-new/src/pages/ProviderEditPage.tsx
git commit -m "feat(web): new Custom HTTP Email editor with presets + body template"
```

---

### Task 13: i18n keys

**Files:**
- Modify: `web-new/src/locales/en.ts`
- Modify: `web-new/src/locales/zh.ts`

- [ ] **Step 1: Add English keys**

Locate the `providers:` block in `en.ts`. Append under a new `httpEmail:` sub-object (sibling of `emailMapping`):

```ts
httpEmail: {
  preset: "Preset",
  contentType: "Content-Type",
  bodyTemplate: "Body Template",
  bodyTemplatePlaceholder: 'Example: {"from":"${fromAddress}","to":"${toAddress}","subject":"${subject}","html":"${content}"}',
  contentTypeNote: "Values are escaped according to",
  senderIdentity: "Sender Identity",
},
```

Also add sibling keys that the form now references:

```ts
// under providers.field:
fromAddress: "From Address",
fromName: "From Name",
```

- [ ] **Step 2: Add Chinese keys (`zh.ts`)**

```ts
httpEmail: {
  preset: "预设",
  contentType: "Content-Type",
  bodyTemplate: "请求体模板",
  bodyTemplatePlaceholder: '示例：{"from":"${fromAddress}","to":"${toAddress}","subject":"${subject}","html":"${content}"}',
  contentTypeNote: "占位符按此 Content-Type 自动转义",
  senderIdentity: "发件人身份",
},
```

```ts
fromAddress: "发件人地址",
fromName: "发件人名称",
```

- [ ] **Step 3: Build**

```bash
cd web-new && npm run build
```

Expected: no errors.

- [ ] **Step 4: Verify in dev**

```bash
cd web-new && npm run dev &
```

Toggle language; both locales render the new labels. Kill dev: `kill %1`.

- [ ] **Step 5: Commit**

```bash
git add web-new/src/locales/en.ts web-new/src/locales/zh.ts
git commit -m "feat(i18n): add httpEmail keys for new editor UI"
```

---

## Phase 5 — Hardening + Docs

### Task 14: Config key for admin SSRF allowlist

**Files:**
- Modify: `conf/app.conf.example`

- [ ] **Step 1: Add documented key**

Append to `conf/app.conf.example`:

```ini
# Comma-separated CIDRs an operator permits the HTTP Email sender to reach
# despite private-IP SSRF protections. Leave empty to keep all private ranges blocked.
# Example: 10.0.0.0/8,172.20.0.0/16
ssrfAllowedHosts =
```

- [ ] **Step 2: Confirm `getSsrfAllowlist()` reads it**

Re-read `object/email.go` (from Task 7). Confirm `conf.GetConfigString("ssrfAllowedHosts")` matches the key exactly.

- [ ] **Step 3: Local check**

Set `ssrfAllowedHosts = 127.0.0.1/32` in local `conf/app.conf`, start server, send test email to `http://127.0.0.1:9999/x` → receive normal 502 not `SSRF blocked`.

- [ ] **Step 4: Revert local test config**

```bash
git checkout conf/app.conf
```

- [ ] **Step 5: Commit**

```bash
git add conf/app.conf.example
git commit -m "docs(conf): document ssrfAllowedHosts"
```

---

### Task 15: Admin migration runbook

**Files:**
- Create: `docs/http-email-migration.md`

- [ ] **Step 1: Write the doc**

```markdown
# Custom HTTP Email Upgrade Runbook

## What changed

Before this release, `Custom HTTP Email` providers stored their body-field
map in `user_mapping` (OAuth user mapping reuse) and their content-type in
`issuer_url`. Both were bugs. The new code has dedicated columns.

## What happens on first start

`InitCustomHttpEmailMigration()` (called from `main.go`) moves every Email
provider's `user_mapping` → `body_mapping` and `issuer_url` → `content_type`,
then clears the originals. The migration is idempotent.

Check logs for: `[migration] upgraded N Custom HTTP Email providers`.

## Manual verification

```sql
SELECT owner, name, body_mapping, content_type, user_mapping, issuer_url
FROM provider
WHERE category='Email' AND type='Custom HTTP Email';
```

- `body_mapping` populated, `user_mapping` empty → OK.
- `content_type` set, `issuer_url` empty → OK.

## Rollback

Old code reads `user_mapping` and `issuer_url`. To roll back, run:

```sql
UPDATE provider SET user_mapping=body_mapping, issuer_url=content_type
WHERE category='Email' AND type='Custom HTTP Email' AND user_mapping='';
```

Then redeploy prior binary.

## SSRF allowlist

If your email API lives on a private network, add its CIDR to
`ssrfAllowedHosts` in `conf/app.conf` and restart. The default blocks
RFC1918, loopback, link-local, and metadata ranges.
```

- [ ] **Step 2: Commit**

```bash
git add docs/http-email-migration.md
git commit -m "docs: add Custom HTTP Email upgrade runbook"
```

---

### Task 16: Preset authoring guide

**Files:**
- Create: `docs/http-email-presets.md`

- [ ] **Step 1: Write the doc**

```markdown
# Authoring Email Presets

A preset lives in `email/presets.go` (backend; source of truth) and is
fetched by the frontend at `/api/get-http-email-presets`. A preset encodes
everything admins typically copy from a vendor's quick-start: endpoint shape,
method, content-type, required headers, and a body template.

## Template rules

- Placeholders: `${fromAddress}` `${fromName}` `${toAddress}` `${toAddresses}`
  `${subject}` `${content}` `${contentText}`.
- Values are escaped according to the preset's `ContentType`:
  - `application/json` → JSON string escape (quotes, backslash, newline).
  - `application/x-www-form-urlencoded` → URL query escape.
  - `text/plain` → raw.
- `${toAddresses}` expands to a native array in JSON and to
  comma-separated URL-encoded values in form mode.
- Unknown placeholders (typos) fail send with a clear error.

## Header placeholders

Headers are **not** template-substituted; they are sent as-is. Use literal
secret placeholders like `{api_token}` or `{server_token}` in the preset's
`HttpHeaders`; admins overwrite them after picking the preset.

## Checklist when adding a preset

1. Verify live against the provider with a throwaway key.
2. `go test ./email -run TestPresets` must pass.
3. Include `Docs` URL.
4. Keep `EndpointExample` with `{placeholders}` to signal which parts the
   admin must customize (e.g. `{account_id}`).
5. Mirror the entry in UI if local fallback is desired; otherwise the
   frontend reads from the backend and picks up new presets on restart.

## Security

- Never bake a real API key into a preset.
- If the provider uses Basic auth with `key:secret`, put the base64 token
  hint as `{base64(key:secret)}` so admins know to compute it.
```

- [ ] **Step 2: Commit**

```bash
git add docs/http-email-presets.md
git commit -m "docs: preset authoring guide"
```

---

## Self-Review Checklist

**Spec coverage**
- Universal HTTP sender → Tasks 5–7 ✓
- Cloudflare + 6 other APIs out-of-the-box → Task 9 + Task 15 ✓
- Security: SSRF → Task 3 + Task 14 ✓
- Security: context-aware escaping → Task 2 ✓
- Security: response body size cap + timeouts → Task 5 ✓
- Error body surfacing → Task 5, Task 8 ✓
- Data migration from legacy mis-wired fields → Task 4 ✓
- Frontend UI with body template + presets → Tasks 10–13 ✓
- Admin runbook → Task 15 ✓
- Preset authoring guide → Task 16 ✓

**Known gaps (intentionally deferred)**
- Raw MIME mode (for AWS SES v2 `SendRawEmail`): leave to a follow-up.
- Retry / exponential backoff: not needed for the admin test flow; reconsider when the sender is called from queued jobs.
- Per-provider rate limiting: existing middleware covers it at the controller layer.
- Multipart attachments: not needed for auth-flow emails (codes, invites).

**Type consistency check**
- `HttpEmailOptions` defined in Task 6 matches fields consumed by `HttpEmailSender` in Task 5. ✓
- `Context` struct (Task 2) matches `ctx := Context{...}` in Task 5. ✓
- `Preset` struct (Task 9) matches `EmailPreset` TS type in Task 11 (key/name/endpointExample/method/contentType/httpHeaders/bodyTemplate/docs). ✓
- `BodyTemplate` column type `text` (Task 1) sized for multi-KB JSON templates. ✓

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-17-custom-http-email-universal-sender.md`.
