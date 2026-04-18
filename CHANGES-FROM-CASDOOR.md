# Changes from upstream Casdoor

JetAuth is a fork of [Casdoor](https://github.com/casdoor/casdoor), used and
redistributed under the Apache License, Version 2.0. This file summarizes
the architectural divergence from the upstream project. It is not a
line-level diff — consult `git log` and the per-file commit history for that.

## Structural changes

- **Go module path**: `github.com/casdoor/casdoor` → `github.com/deluxebear/jetauth`.
- **Frontend**: a new React + Vite + Tailwind CSS v4 + TanStack Query
  frontend lives in `web-new/`. The upstream Ant Design frontend in `web/`
  is scheduled for removal.
- **Product name**: user-visible strings, configuration keys, cookie and
  session names, and default admin organization naming have been migrated
  from "Casdoor" to "JetAuth".

## Subsystems added

- **Business-permission (ReBAC) module** under `object/biz_*.go` and
  `controllers/biz_permission_api.go`:
  - Per-application Casbin policy tables (`biz_{appName}_policy`).
  - Role inheritance with ancestor-member expansion.
  - `BizAppResource` catalog with OpenAPI / CSV / YAML / JSON / paste
    import, preview/diff, and test-match.
  - Permission stats and grantee aggregation endpoints.
- **Custom HTTP Email Provider**: generalized Email provider that can speak
  any REST API, with per-vendor presets, preview + sandbox-send, and
  SSRF-safe outbound requests.
- **Homegrown i18n** (`web-new/src/i18n.tsx`) replaces `react-i18next` in
  the new frontend.

## Subsystems removed

- **Built-in RADIUS server** (`radius/` package and `object/radius.go`)
  was removed. The upstream code supported only PAP, had a MFA
  challenge-fall-through correctness bug, an `AcctOutputPackets`
  copy-paste error, and a global `StateMap` without mutex. See the commit
  removing it for details. The `object/mfa_radius.go` **client** used for
  RADIUS-as-MFA-provider remains.

## Retained upstream integrations

- `idp/casdoor.go` lets administrators use another Casdoor instance as an
  OIDC identity provider.
- `storage/casdoor.go` lets administrators use another Casdoor instance
  as a storage backend.
- `object/mfa_radius.go` lets administrators authenticate MFA against an
  external RADIUS server.

These are customer-facing *integrations* with Casdoor-as-a-third-party, in
the same sense that `idp/github.go` is an integration with GitHub. They
are unrelated to JetAuth's internal implementation.

## License

Apache License, Version 2.0. See `LICENSE` and `NOTICE`.
