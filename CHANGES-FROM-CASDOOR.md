# Changes from upstream Casdoor

JetAuth is a fork of [Casdoor](https://github.com/casdoor/casdoor), used and
redistributed under the Apache License, Version 2.0. This file summarizes
the architectural divergence from the upstream project. It is not a
line-level diff — consult `git log`, `TODO.md`, and the per-module design
docs under `docs/` for specifics.

## Structural changes

- **Go module path**: `github.com/casdoor/casdoor` → `github.com/deluxebear/jetauth`.
- **Frontend rewrite (`web-new/`)**: a completely new admin frontend built
  with React 19 + Vite + Tailwind CSS v4 + TanStack Query + React Router v6.
  It replaces — not augments — the upstream Ant Design frontend under `web/`,
  which is scheduled for deletion. Shared UI patterns:
  - A reusable list-page pattern (`web-new/docs/list-page-pattern.md`) and
    an extended `DataTable` component (selectable rows, `onRowClick`,
    client-side sort, persistent `columnsToggle`, `bulkActions`).
  - Entity-detail layout primitives: `EntityHeader`, `SplitButton`,
    `StatCard`, `DangerZone` (type-to-confirm destructive actions).
  - Homegrown `useTranslation` in `web-new/src/i18n.tsx` — no
    `react-i18next` dependency. Per-file locale in TypeScript.
- **Product name**: user-visible strings, cookie/session names, the
  built-in admin organization constant, HTTP realm, MCP server name, PayPal
  brand_name, SCIM schema description, Swagger title, and DB defaults have
  all migrated from "Casdoor" to "JetAuth". See the
  `chore: minimize Casdoor branding` commit for the full surface.

## Major subsystems rewritten

### Custom HTTP Email — universal REST sender

Upstream stored the body-field map in `user_mapping` (a column meant for
OAuth user-info mapping) and the content-type in `issuer_url` (meant for
OIDC issuer URLs). Both were bugs that constrained the feature to a single
hand-written template.

The rewrite:

- Adds dedicated columns `body_mapping`, `content_type`, `body_template`
  to `provider` and runs an idempotent `InitCustomHttpEmailMigration()` at
  startup that moves legacy data into the new shape and clears the old
  columns. Logged as `[migration] upgraded N Custom HTTP Email providers`.
- Introduces a `${var}` template engine with content-type-aware escaping
  (JSON, `x-www-form-urlencoded`, plain text) — `email/template.go`.
- Replaces `HttpEmailProvider` with a typed `HttpEmailSender` that surfaces
  upstream error bodies verbatim.
- Ships seven built-in presets (Cloudflare, Mailgun, SendGrid, Resend,
  Postmark, Brevo, SMTP2GO) plus a Generic preset. Presets are authored in
  Go (`email/presets.go`) and exposed via a REST API the frontend consumes.
- Adds an SSRF guard that blocks outbound requests to RFC1918, loopback,
  link-local, and cloud-metadata ranges unless explicitly allowlisted via
  `ssrfAllowedHosts`.
- New editor UI in `web-new/`: `BodyTemplateEditor` (variable chips + live
  preview), `PresetPicker`, typed preset fetcher, and sandbox test-send.

Docs: `docs/http-email-migration.md`, `docs/http-email-presets.md`,
`docs/superpowers/plans/2026-04-17-custom-http-email-universal-sender.md`.

### Business-permission / Application Authorization

Upstream's `Permission` + `Enforcer` model has two structural limitations:
`GetBuiltInModel()` hard-forces a six-field policy shape regardless of the
user's Casbin model, and the two subsystems emit **incompatible policy
rows** — so the Enforcer-backed `get-policies` API returns empty for
Permission-created rules, and business systems cannot pull policies into a
local cache.

JetAuth adds a parallel **application-authorization** subsystem
(`object/biz_*.go`, `controllers/biz_permission_api.go`) that gives every
enterprise application its own first-class permission surface without
touching `check.go` / `permission_enforcer.go` / `authz.go`:

- **Per-application Casbin policy tables** (`biz_{appName}_policy`),
  populated by a relational sync engine that reads `biz_role`,
  `biz_role_inheritance`, `biz_role_member`, `biz_permission`, and
  `biz_permission_grantee`.
- **Role inheritance** with correct ancestor-member expansion into Casbin
  `g` rules. Cross-tenant writes are blocked at the controller layer.
- **Resource catalog** (`BizAppResource`) — an authoring aid that stores
  resource patterns consumed by Casbin. Import pipeline supports OpenAPI
  (3.0/3.1), CSV, YAML, JSON, and raw `cURL` paste, all with
  preview/diff (update vs. insert) and bulk apply. `{id}`→`:id|*|keep`
  path rewrites are user-selectable per import.
- **Test-match endpoint** (`biz-test-permission-match`) using Casbin
  `util.KeyMatch` / `KeyMatch2` to show admins exactly which patterns fire
  for a given request.
- **In-memory enforcer cache** (`bizEnforcerCache sync.Map`) — enforce in
  ~0.01 ms after warm-up, versus the legacy path that issues 15–25 DB
  queries per call.
- **Scope-aware roles and grantees**: a role defined in application scope
  can inherit from an org-scope role. `ResolveScopedRoles` unions app +
  org at sync time.
- **Grantee-side role reference uses role name** (not id) — matching
  Casdoor's string-identifier convention. Documented trade-off: role
  rename invalidates grants.
- **Stats endpoints** (`biz-get-role-stats`, `biz-get-permission-stats`)
  that aggregate member / inheritance / permission counts via single
  grouped queries.
- **Bulk delete** with the no-children safety guard on `DeleteBizRole`.

The admin UI is an independent redesign (Entity detail pages with tabs,
type-to-confirm delete, deep-linked tabs, TanStack-Query-driven data
flow) — not a port of the upstream `PermissionEditPage`.

Docs: `docs/business-permission-architecture.md`,
`docs/enterprise-authorization-plan.md`, `docs/authorization-guide.md`.

### ReBAC (Zanzibar-style) — planned integration

Planned extension of the application-authorization module: let admins pick
RBAC (Casbin) or ReBAC per application at creation time. Lightweight
self-built graph engine (reuses the existing DB + cache, zero extra infra).
Six-phase rollout tracked in `TODO.md` and `docs/rebac-integration-plan.md`.

### Built-in RADIUS server — removed

The upstream `radius/` package and `object/radius.go` were removed. The
upstream code supported only PAP, had a MFA challenge fall-through bug
(Access-Accept issued alongside the Access-Challenge), an
`AcctOutputPackets` copy-paste error (set from `AcctInputPackets_Get`),
and a global `StateMap` with no mutex. No upstream admin UI existed. See
the `refactor: remove built-in RADIUS server` commit for details. The
`object/mfa_radius.go` **client** — using an external RADIUS as an MFA
channel — remains.

## Correctness and security fixes

- **Biz-permission engine** — cross-tenant write blocking, model arity
  normalization, group membership correctly expanded into `g` rules at
  sync time, version field for invalidation, ancestor walk fixed
  (`computeRoleGPolicies` previously pulled ancestors' members into the
  child instead of the reverse).
- **Casbin v3 migration** — positional lookup regressions and init-data
  error surfacing fixed.
- **Entity update APIs** — block owner-field tampering across organization
  boundaries (admins could previously rewrite `owner` in PUT payloads and
  move objects across tenants).
- **Site gateway audit (2026-04-16)** — 17 of 20 findings fixed across P0
  (SiteMap / ruleMap concurrent-map panic, connection-pool exhaustion) and
  P1 (hot-path allocations, unnecessary header copies). Ongoing work
  tracked under "Site 网关后端安全与性能审计" in `TODO.md`.
- **SSRF guard** for the Custom HTTP Email sender (see above).

## Other subsystems

- **LLM / AI module** (`object/agent.go`, `object/openclaw_*.go`,
  `object/site.go`, `object/rule*.go`, MCP controllers): AI-Agent
  registration, MCP server proxy + tool control, MCP store with a
  local-cached registry, reverse-proxy gateway with WAF + IP/UA/rate-limit
  rules, and full log/trace entry. See `docs/llm-ai-module-guide.md`.
- **Business & Payment module**: complete purchase flow (products, cart,
  order, payment, plans, pricing, subscriptions, transactions) with UI
  reorganized into a dedicated section. See
  `docs/business-payment-module-guide.md` and
  `docs/2026-04-16-business-payment-module-analysis.md`.
- **Audit module** — Records and Verifications pages redesigned (detail
  drawer, filter chips, no-flash table loading).
- **Session list** — detail drawer, application column, user links,
  force-offline bulk action.
- **Authorization UI** — real user avatars and application favicons
  surfaced in list and detail views instead of letter placeholders.
- **Organization theme presets** — design tokens + preset picker for
  login-page branding.

## Dependency and tooling upgrades

- **SQLite driver**: `modernc.org/sqlite` v1.18.2 → v1.48.2, bumping
  embedded SQLite from 3.39 to 3.51 and unlocking JSONB.
- **Go module upgrades** tracked in `go.mod`; direct Casbin-org
  dependencies (`notify2`, `go-sms-sender`, `oss`, `gomail`, `ldapserver`,
  `casdoor-go-sdk`) remain, as they are maintained upstream libraries we
  depend on — renaming would require forking those libraries.
- **Homegrown i18n** in `web-new/src/i18n.tsx` — see above.

## Retained upstream integrations

These are customer-facing *integrations* with Casdoor-as-a-third-party, in
the same sense that `idp/github.go` is an integration with GitHub. They
are unrelated to JetAuth's internal implementation and therefore keep
"Casdoor" in their identifiers.

- `idp/casdoor.go` — use another Casdoor instance as an OIDC IdP.
- `storage/casdoor.go` — use another Casdoor instance as a storage backend.
- `object/mfa_radius.go` — authenticate MFA against an external RADIUS
  server.
- The various `provider.Type == "Casdoor"` switches that route to the
  above integrations.

## Planned work (tracked in `TODO.md`)

- **Approval workflow** for permissions (backend role check, Rejected
  state, approval-queue page, notifications, audit log).
- **Permission fields × model awareness** — surface the correct number of
  policy fields in the UI based on the chosen Casbin model.
- **Enforcer caching** — in-memory, Redis-watcher multi-instance
  invalidation, optional Redis policy-text cache, LRU+TTL.
- **Role custom properties** — structured data-scope (`dataScope`) and
  other business metadata stored on `biz_role.properties`.
- **Policy-definition field limit** — remove the six-field ceiling in
  `GetBuiltInModel()` once the dependent code paths are audited.
- **Gateway Casbin integration** — insert `BizEnforce` between OAuth and
  proxy-forward in `service/proxy.go` so the gateway enforces API-level
  permissions on forwarded requests, using `Site.CasdoorApplication` as
  the join key.
- **ReBAC** — six-phase rollout (data model → graph engine → API → schema
  editor → tuple manager → cache).
- **Site gateway audit P2 items** — remaining stability cleanups.

## License

Apache License, Version 2.0. See `LICENSE` and `NOTICE`.
