# Changes from upstream Casdoor

JetAuth is a fork of [Casdoor](https://github.com/casdoor/casdoor), used and
redistributed under the Apache License, Version 2.0. This file summarizes
the architectural divergence from the upstream project. It is not a
line-level diff — consult `git log`, `TODO.md`, and the per-module design
docs under `docs/` for specifics.

## Structural changes

- **Go module path**: `github.com/casdoor/casdoor` → `github.com/deluxebear/jetauth`.
- **Frontend rewrite (`web/`)**: a completely new admin frontend built
  with React 19 + Vite + Tailwind CSS v4 + TanStack Query + React Router v6.
  It replaces — not augments — the upstream Ant Design frontend under `web/`,
  which is scheduled for deletion. Shared UI patterns:
  - A reusable list-page pattern (`web/docs/list-page-pattern.md`) and
    an extended `DataTable` component (selectable rows, `onRowClick`,
    client-side sort, persistent `columnsToggle`, `bulkActions`).
  - Entity-detail layout primitives: `EntityHeader`, `SplitButton`,
    `StatCard`, `DangerZone` (type-to-confirm destructive actions).
  - Homegrown `useTranslation` in `web/src/i18n.tsx` — no
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
- New editor UI in `web/`: `BodyTemplateEditor` (variable chips + live
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
- **In-memory enforcer cache** — enforce in ~0.01 ms after warm-up, versus
  the legacy path that issues 15–25 DB queries per call. The store is an
  LRU with optional `bizEnforcerCacheMaxEntries` / `bizEnforcerCacheIdleTtlSeconds`
  bounds (both off by default), a generation guard against rebuild/invalidate
  races, and Prometheus hit/miss/eviction metrics
  (`object/biz_enforcer_lru.go`).
- **Cross-instance invalidation** — optional Redis pub/sub watcher
  (`bizPolicyWatcherEnabled`, default off; `object/biz_policy_watcher.go`)
  so a policy change on one node drops the cached enforcer on the others.
  The optional Redis policy cache (`bizPolicyCacheEnabled`) is unchanged.
- **Policy versioning, changelog and watch API** — `BizAppConfig.PolicyVersion`
  plus a `biz_policy_changelog` table. Additions are recorded as precise
  deltas; removals, updates and manual syncs record a `full_rebuild` marker.
  `GET /api/biz-watch-policies` (long poll: incremental / full / 304) and
  `GET /api/biz-get-policy-version` serve SDKs; the log keeps the last 1000
  versions per app. A `biz-policy-changed` webhook event fires after each
  policy sync. Go/TypeScript SDK templates in the integration tab keep a local
  enforcer cache.
- **Role properties and data scope** — `biz_role.properties` holds typed,
  validated metadata; `dataScope` (`all` / `org` / `dept` / `dept_and_children`
  / `self` / `custom`, optional per-resource overrides) is merged across a
  user's roles and exposed by `GET /api/biz-get-user-data-scope`. The role
  edit page has a data-scope editor.
- **Server-side pagination** for `biz-get-roles` / `biz-get-permissions`
  (`p`, `pageSize`, sort and filter parameters; total in `data2`).
- **Migration from platform permissions** — `POST /api/biz-migrate-from-permission`
  copies an organization's platform roles and permissions into the biz tables
  (dry-run report, `skip` / `overwrite` conflict policy, single transaction,
  one policy sync), with a preview/confirm dialog in the web UI.
- **Management UX** — per-application business-permission tab on the user
  edit page, quick-create wizard that seeds a default admin role and
  permission, CodeMirror model editor with server-side Casbin model validation.
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

### Platform permission system improvements

The platform `Permission` / `Role` / `Enforcer` path was left structurally
intact (it is intentionally separate from the biz subsystem) but gained:

- **Approval workflow** — a state machine (`Pending` → `Approved` / `Rejected`,
  revoke, resubmit; admin-only approval, mandatory reject reason), an audit
  log table, `POST /api/approve-permission`, `/api/reject-permission` and
  `GET /api/get-permission-approval-logs`, e-mail notifications, automatic
  demotion to `Pending` when a non-approver edits policy-affecting fields, and
  an approval queue / "my submissions" UI (`object/permission_approval.go`).
- **Field validation and model awareness** — required-field and
  domain-vs-model checks on save (`object/permission_fields.go`); the form
  parses the selected model (blank = built-in default) to disable fields the
  model cannot use. A permission that names a missing model now fails closed.
- **Enforcer caching** — LRU + TTL cache for `getPermissionEnforcer()` with
  ORM-hook invalidation and an optional Redis pub/sub watcher; off by default
  (`permissionEnforcerCacheEnabled`, `permissionEnforcerCacheSize`,
  `permissionEnforcerCacheTtlSeconds`, `permissionEnforcerWatcherEnabled`).
  Benchmark: ~255 µs/op uncached vs ~4.6 µs/op cached.
- **Model-driven policy layout** — rows are generated from the model's
  `policy_definition` field names; the permission id stays on the reserved
  `v5` column and rows are removed by it. Up to five model fields plus the
  id column are supported; legacy rows and models are byte-identical. See
  `docs/permission-policy-layout.md`.

### ReBAC (Zanzibar-style) — shipped alongside Casbin

Extension of the application-authorization module: each `BizAppConfig`
now declares a `ModelType` field (`"casbin"` default or `"rebac"`), and
the `BizEnforce` dispatcher (`object/biz_rebac_dispatch.go`) steers
`/api/biz-enforce` to the matching engine. The ReBAC implementation is
an OpenFGA v1.1-compatible graph engine living entirely in the existing
`object/` package — no extra services required for single-instance
deployments.

- **Schema management** — Authorization models are append-only, saved via
  `/api/biz-write-authorization-model` with a CAS-safe dry-run mode. The
  DSL front door reuses `openfga/language` v0.2.1 for DSL ↔ Proto ↔
  JSON conversion; conflict scanner refuses destructive migrations that
  orphan existing tuples.
- **Engine** — `ReBACCheck` implements all five OpenFGA rewrites (`this`,
  `computed_userset`, `tuple_to_userset`, `union`, `intersection`,
  `difference`) with per-request memoisation, a 25-depth cap, and
  ternary cycle-state propagation so `difference` paths with cycles
  conservatively deny (CP-8 C7). `consolidated_1_1_tests.yaml`: 130/134
  pass + 4 documented skips.
- **CEL Conditions** — compiled per `(authorizationModelId, conditionName)`
  and cached; merges tuple-side and request-side contexts; evaluation
  failure surfaces as `BizAuthzKindConditionFailed`, not silent deny.
- **Contextual tuples** — request-only grants validated against schema,
  merged into the checkContext without persisting.
- **List / Expand** — `ReBACListObjects`, `ReBACListUsers`, `ReBACExpand`
  each use reverse-index candidate generation + per-candidate Check,
  `base64`-encoded opaque cursors, and a 10s internal timeout (returns
  partial results + token on cut-off).
- **Cache** — two tiers behind `BizReBACCache`. L2 is the default
  in-memory `sync.Map` with 10s TTL. L3 is an optional `RedisBizReBACCache`
  (enabled via `bizReBACCacheL3Enabled=true`) with pub/sub invalidation on
  `jetauth:rebac:invalidations` for cross-instance freshness; heartbeat
  detection triggers pessimistic `flushAll` on disconnect.
- **Ops layer** — per-`(store,user)` token-bucket rate limiting
  (`rebacListObjectsRPS` / `rebacListObjectsBurst`, defaults 20 rps / 40
  burst, HTTP 429 + `Retry-After: 1` on reject), six Prometheus metric
  families under `biz_rebac_*`, `useAccessibleResources` React hook with
  transparent 429 back-off + pagination, end-to-end smoke script at
  `web/scripts/rebac-e2e-smoke.sh`, and benchmark harness gated by
  `make rebac-bench` (SLA targets: Check p99<50ms, ListObjects p99<300ms).
- **Concurrency and performance follow-ups** — compare-and-swap on schema
  save/activate via optional `expectedModelId` (`BIZ_REBAC_SCHEMA_STALE`
  on conflict; the schema editor sends it), request-context threading into
  the L2/L3 cache calls (`ReBACCheckCtx`), ListObjects direct-grant
  short-circuit and per-call model hoisting (193 ms → 19 ms on the bench
  fixture), and a fix creating the assertion and tuple-audit tables on fresh
  databases.
- **Guidance errors** — ReBAC apps returning HTTP 400 with
  `msg=BIZ_API_NOT_SUPPORTED_IN_REBAC` when a caller hits the
  Casbin-only endpoints (`biz-get-user-roles`, `biz-get-user-permissions`,
  `biz-get-permissions-for-subject`), pointing at the right replacement
  endpoint and doc URL.

Docs: `docs/rebac-spec.md`, `docs/rebac-plan.md`,
`docs/rebac-operations-guide.md`, `docs/rebac-implementation-status.md`,
`docs/rebac-sla-baseline.md`, `docs/rebac-integration-plan.md`.

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
- **Site gateway audit (2026-04-16)** — all findings fixed. P0/P1 covered
  the SiteMap / ruleMap concurrent-map panic, connection-pool exhaustion,
  hot-path allocations and unnecessary header copies; the remaining P2/P3
  items landed later: per-site certificate locks, change-detected refresh
  (`count + max(updated_time)` fingerprint, forced every 60 s, interval
  configurable via `siteRefreshIntervalSeconds`) and memoized, cycle-safe
  compound-rule lookups.
- **Gateway API-level authorization** — the gateway can call `BizEnforce`
  between OAuth and proxy-forward (`Site.EnableBizAuthz`, bypass list, fail
  mode), using the site's application as the join key.
- **RFC 7009 token revocation** — `POST /api/login/oauth/revoke`; revoked
  tokens (stored `expires_in = 0`, shared with SSO logout) are rejected by
  introspection, token exchange, API bearer auth and the MCP self-server.
  Revoking either the access or the refresh token invalidates both, since
  they share one stored row.
- **Syncer group sync** — group and membership reconciliation for Azure AD,
  Okta, SCIM, WeCom, Lark, AWS IAM, Active Directory (with configurable
  LDAPS verification via `SslMode`), Keycloak and the Database syncer
  (configurable group tables). Locally assigned groups are preserved.
- **Auth cleanups** — IdP auto-signup decision centralized, unreachable SAML
  branch removed, stale logout TODOs replaced by documented decisions.
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
- **Homegrown i18n** in `web/src/i18n.tsx` — see above.

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

Most earlier planned items have shipped (see above). What genuinely remains:

- **Plain widening of the policy table** — permission models whose sixth
  field is not the permission id, or with seven or more fields, are still
  rejected (the adapter table has six columns).
- **Role custom properties on the platform `Role`** — only `biz_role` has
  `properties`; there is also no UI editor for per-resource data scopes.
- **Precise removal deltas** in the biz policy changelog — removals and
  updates always record `full_rebuild`.
- **Migration tool** — whole-organization import only, no selective import.
- **Syncer group follow-ups** — not verified against real tenants (unit
  tests with mocked endpoints only); no nested/hierarchical groups, and
  groups deleted remotely are not removed locally.
- **Permission form** — Actions options do not follow the model.
- **Defaults and ops** — enforcer caches and Redis watchers are off by
  default and lack multi-node soak tests; Redis policy-text compression is
  not implemented; swagger output has not been regenerated for the new APIs.
- **ReBAC** — real-hardware p50/p99 for the SLA baseline, and reconciling the
  consolidated-suite skip count between code and docs.

## License

Apache License, Version 2.0. See `LICENSE` and `NOTICE`.
