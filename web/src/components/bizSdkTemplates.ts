// Full SDK templates for the Casbin-mode integration tab. Each template is a
// local enforcer that mirrors the app's policies and refreshes them by
// polling the lightweight /api/biz-get-policy-version endpoint, falling back
// to a full /api/biz-get-policies fetch whenever the version changed (or the
// version endpoint is unavailable).
//
// The sources are plain strings with __ENDPOINT__ / __APP_ID__ placeholders
// (no backticks or ${} inside) so they can be shown and copied verbatim.
//
// /api/biz-watch-policies (long-poll) is an optional upgrade: replace the
// ticker/interval with a loop that blocks on it, then call refresh() when it
// reports a change. Polling the version works against every server version.

export interface SdkTemplateParams {
  endpoint: string;
  appId: string;
  displayName?: string;
}

const GO_TEMPLATE = `// JetAuth business authorization Go SDK: __NAME__
// Local Casbin enforcer cache, refreshed by polling /api/biz-get-policy-version
// and falling back to a full /api/biz-get-policies fetch.
//
// go get github.com/casbin/casbin/v3
package bizauth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"sync"
	"time"

	"github.com/casbin/casbin/v3"
	"github.com/casbin/casbin/v3/model"
)

const (
	Endpoint = "__ENDPOINT__"
	AppID    = "__APP_ID__"
)

type envelope struct {
	Status string
	Msg    string
	Data   json.RawMessage
}

type policiesData struct {
	ModelText        string
	Policies         [][]string
	GroupingPolicies [][]string
	Version          string
}

type Client struct {
	token    func() string // returns a bearer access token
	http     *http.Client
	mu       sync.RWMutex
	enforcer *casbin.Enforcer
	version  string
}

func NewClient(token func() string) *Client {
	return &Client{token: token, http: &http.Client{Timeout: 10 * time.Second}}
}

func (c *Client) get(ctx context.Context, path string) (json.RawMessage, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", Endpoint+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.token())
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s: HTTP %d", path, resp.StatusCode)
	}
	var env envelope
	if err := json.NewDecoder(resp.Body).Decode(&env); err != nil {
		return nil, err
	}
	if env.Status != "ok" {
		return nil, errors.New(env.Msg)
	}
	return env.Data, nil
}

// fetchVersion asks the server for the current policy version. The payload
// may be a bare string or an object carrying a version field.
func (c *Client) fetchVersion(ctx context.Context) (string, error) {
	raw, err := c.get(ctx, "/api/biz-get-policy-version?appId="+url.QueryEscape(AppID))
	if err != nil {
		return "", err
	}
	var s string
	if json.Unmarshal(raw, &s) == nil {
		return s, nil
	}
	var obj struct{ Version string }
	if err := json.Unmarshal(raw, &obj); err != nil {
		return "", err
	}
	return obj.Version, nil
}

// Refresh downloads every policy and atomically swaps the local enforcer.
func (c *Client) Refresh(ctx context.Context) error {
	raw, err := c.get(ctx, "/api/biz-get-policies?appId="+url.QueryEscape(AppID))
	if err != nil {
		return err
	}
	var d policiesData
	if err := json.Unmarshal(raw, &d); err != nil {
		return err
	}
	m, err := model.NewModelFromString(d.ModelText)
	if err != nil {
		return err
	}
	e, err := casbin.NewEnforcer(m)
	if err != nil {
		return err
	}
	if len(d.Policies) > 0 {
		if _, err := e.AddPolicies(d.Policies); err != nil {
			return err
		}
	}
	if len(d.GroupingPolicies) > 0 {
		if _, err := e.AddGroupingPolicies(d.GroupingPolicies); err != nil {
			return err
		}
	}
	c.mu.Lock()
	c.enforcer, c.version = e, d.Version
	c.mu.Unlock()
	return nil
}

// Start loads the policies once, then keeps them fresh until ctx is done.
// Each tick compares the server version with the cached one and only does a
// full fetch on change. If the version endpoint fails, it falls back to a
// full fetch so the cache never goes stale silently.
func (c *Client) Start(ctx context.Context, interval time.Duration) error {
	if err := c.Refresh(ctx); err != nil {
		return err
	}
	go func() {
		t := time.NewTicker(interval)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				v, err := c.fetchVersion(ctx)
				c.mu.RLock()
				same := err == nil && v == c.version
				c.mu.RUnlock()
				if !same {
					_ = c.Refresh(ctx) // keep serving the previous snapshot on failure
				}
			}
		}
	}()
	return nil
}

// Enforce evaluates a request against the local snapshot (no network call).
func (c *Client) Enforce(sub, obj, act string) (bool, error) {
	c.mu.RLock()
	e := c.enforcer
	c.mu.RUnlock()
	if e == nil {
		return false, errors.New("policies not loaded yet")
	}
	return e.Enforce(sub, obj, act)
}

// Usage:
//   c := bizauth.NewClient(func() string { return accessToken })
//   if err := c.Start(ctx, 30*time.Second); err != nil { log.Fatal(err) }
//   ok, _ := c.Enforce("org/alice", "/orders", "DELETE")
//
// Optional: instead of polling, long-poll /api/biz-watch-policies and call
// Refresh when it reports a change.`;

const TS_TEMPLATE = `// JetAuth business authorization TypeScript SDK: __NAME__
// Local Casbin enforcer cache, refreshed by polling /api/biz-get-policy-version
// and falling back to a full /api/biz-get-policies fetch.
//
// npm i casbin
// Run this on a trusted backend (Node). It downloads the whole policy set,
// so do not ship it to untrusted browsers.
import { newEnforcer, newModel, type Enforcer } from "casbin";

const ENDPOINT = "__ENDPOINT__";
const APP_ID = "__APP_ID__";

interface PoliciesData {
  modelText: string;
  policies: string[][];
  groupingPolicies: string[][];
  version: string;
}

export class BizAuthClient {
  private enforcer: Enforcer | null = null;
  private version = "";
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private getToken: () => string,
    private refreshMs = 30_000,
  ) {}

  private async get<T>(path: string): Promise<T> {
    const resp = await fetch(ENDPOINT + path, {
      headers: { Authorization: "Bearer " + this.getToken() },
    });
    if (!resp.ok) throw new Error(path + ": HTTP " + resp.status);
    const body = await resp.json();
    if (body.status !== "ok") throw new Error(body.msg || "request failed");
    return body.data as T;
  }

  // The payload may be a bare string or an object carrying a version field.
  private async fetchVersion(): Promise<string | null> {
    try {
      const data = await this.get<string | { version: string }>(
        "/api/biz-get-policy-version?appId=" + encodeURIComponent(APP_ID),
      );
      return typeof data === "string" ? data : data.version;
    } catch {
      return null; // endpoint unavailable: caller falls back to a full fetch
    }
  }

  /** Download every policy and swap the local enforcer. */
  async refresh(): Promise<void> {
    const d = await this.get<PoliciesData>(
      "/api/biz-get-policies?appId=" + encodeURIComponent(APP_ID),
    );
    const e = await newEnforcer(newModel(d.modelText));
    for (const p of d.policies ?? []) await e.addPolicy(...p);
    for (const g of d.groupingPolicies ?? []) await e.addGroupingPolicy(...g);
    this.enforcer = e;
    this.version = d.version;
  }

  /** Load once, then re-check the version on an interval. */
  async start(): Promise<void> {
    await this.refresh();
    this.timer = setInterval(() => {
      this.tick().catch((err) => console.error("policy refresh failed", err));
    }, this.refreshMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    const v = await this.fetchVersion();
    if (v === null || v !== this.version) await this.refresh();
  }

  /** Evaluate against the local snapshot (no network call). */
  async enforce(sub: string, obj: string, act: string): Promise<boolean> {
    if (!this.enforcer) throw new Error("policies not loaded yet");
    return this.enforcer.enforce(sub, obj, act);
  }
}

// Usage:
//   const auth = new BizAuthClient(() => accessToken);
//   await auth.start();
//   const ok = await auth.enforce("org/alice", "/orders", "DELETE");
//
// Optional: instead of polling, long-poll /api/biz-watch-policies and call
// refresh() when it reports a change.`;

function fill(tpl: string, p: SdkTemplateParams): string {
  return tpl
    .split("__NAME__").join(p.displayName || p.appId)
    .split("__ENDPOINT__").join(p.endpoint)
    .split("__APP_ID__").join(p.appId);
}

export function buildGoSdkTemplate(p: SdkTemplateParams): string {
  return fill(GO_TEMPLATE, p);
}

export function buildTsSdkTemplate(p: SdkTemplateParams): string {
  return fill(TS_TEMPLATE, p);
}
