# Task API Demo

> 中文版见 [README.zh-CN.md](./README.zh-CN.md)

A tiny HTTP service used to verify the JetAuth WAF gateway's **URL-level
authorization** feature. It is intentionally boring on the business side
(in-memory task list) and interesting on the access-control side: 11
endpoints split across 5 tag groups so different roles in the
**Application Authorization** module produce visibly different behavior.

## Why this exists

JetAuth now lets a site gate every request against a Casbin enforcer
owned by an Application Authorization app. Before this PR, verifying
the feature meant pointing the WAF at a real internal service, which
is painful in a dev loop. This demo gives you a target that:

- runs in one command, no dependencies,
- ships an OpenAPI 3.1 spec so you can import all 11 resources into
  the authz module with one click,
- reads the gateway's `X-Forwarded-User` / `X-Forwarded-Email`
  headers and echoes them back, so you can confirm identity is
  flowing end-to-end.

## Run locally

```bash
# from the repo root
go run ./demo/task-api
# or pin the port
PORT=8081 go run ./demo/task-api
```

Open http://localhost:8081/ for the index + endpoint table.

## Local setup — route the demo through the JetAuth WAF

The demo on `:8081` is just the upstream. The interesting flow is
**browser → JetAuth gateway → demo**, because the gateway is where
SSO, identity header injection, and BizAuthz enforcement happen. Wiring
that up locally takes four pieces:

```
┌────────┐     task-demo.jetauth.local:8080     ┌──────────────┐
│ browser│ ───────────────────────────────────▶ │ JetAuth WAF  │
└────────┘                                      │  gateway     │
                                                └──────┬───────┘
                                                       │  http://localhost:8081
                                                       ▼
                                                ┌──────────────┐
                                                │ task-api demo│
                                                └──────────────┘
```

### 1. Pick a local domain

Anything ending in `.local`, `.test`, or a made-up TLD works — it just
needs to be something the browser will send in the `Host` header so
JetAuth's site-lookup can match it. This guide uses:

```
task-demo.jetauth.local
```

### 2. Point that domain at 127.0.0.1 via `/etc/hosts`

```bash
# macOS / Linux — add a line, then flush DNS cache on macOS
echo '127.0.0.1  task-demo.jetauth.local' | sudo tee -a /etc/hosts
sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder  # macOS only

# Windows — edit as Administrator:
#   C:\Windows\System32\drivers\etc\hosts
#   add:  127.0.0.1  task-demo.jetauth.local
```

Verify with `ping task-demo.jetauth.local` — it should resolve to
`127.0.0.1`. If it doesn't, nothing below will work.

### 3. Move the gateway off ports 80/443 (macOS/Linux, avoid sudo)

JetAuth's WAF defaults to `80` + `443`, which on Unix requires root.
For local dev, override in `conf/app.conf`:

```ini
gatewayHttpPort  = 8080
gatewayHttpsPort = 8443
```

Then restart the JetAuth backend so it re-listens on the new ports.
(The admin UI on `:8000` is unaffected — that's a separate listener.)

> **Why not just use 80/443 with sudo?** You can, and it lets the URL
> be the "clean" `http://task-demo.jetauth.local/api/tasks`. But every
> restart needs root, and the cost of typing the port once is low.

### 4. Configure the Site in JetAuth

In the admin UI (http://localhost:8000), go to **Sites → Add** and
fill in:

| Field              | Value                              | Why                                                     |
|--------------------|------------------------------------|---------------------------------------------------------|
| Name               | `task-demo`                        | Internal identifier.                                    |
| Domain             | `task-demo.jetauth.local`          | Must match step 1 exactly — this is the lookup key.     |
| SSL mode           | `HTTP`                             | Skip TLS for local; no cert juggling.                   |
| Host               | `http://localhost:8081`            | Upstream URL. **Scheme is required** (it's string-joined with the request path). |
| Application        | your JetAuth app                   | Identity source for SSO + BizAuthz.                     |
| Enable BizAuthz    | on                                 | Turns on URL-level authorization.                       |
| BizAuthz bypass    | `/api/health`                      | Liveness probe skips authz.                             |
| BizAuthz fail mode | `closed` (default)                 | If the engine errors, deny — safe default.              |

Save. JetAuth refreshes its in-memory `SiteMap` on save, so no restart
is needed after this step.

> **Alternative to `Host`**: leave `Host` empty and set `Port = 8081`.
> `site.GetHost()` builds `http://localhost:8081` when only the port
> is present. Either works; `Host` is clearer when the upstream is
> not on `localhost`.

### 5. Start everything

```bash
# Terminal 1 — JetAuth backend (admin UI :8000 + gateway :8080)
go run .

# Terminal 2 — task-api demo (upstream :8081)
go run ./demo/task-api
```

### 6. Hit the gateway, not the demo

```bash
# Expected: 200 JSON, skipped authz (it's in the bypass list).
curl -i http://task-demo.jetauth.local:8080/api/health

# Expected: 302 to SSO, because no session cookie yet.
curl -i http://task-demo.jetauth.local:8080/api/tasks

# In a browser:
open http://task-demo.jetauth.local:8080/api/me
# SSO flow runs; after login you should see
#   {"identity":{"user":"built-in/alice","email":"alice@ex.com"}}
# — proof that the gateway injected identity headers the demo read back.
```

If `/api/me` returns an empty `user` with a `gatewayNote`, the request
bypassed the WAF (you hit `:8081` directly, not `:8080`).

## Endpoints

| Method | Path                    | Tag      | Intended role         |
|--------|-------------------------|----------|-----------------------|
| GET    | `/api/health`           | health   | bypass                |
| GET    | `/api/me`               | identity | any authenticated     |
| GET    | `/api/tasks`            | tasks    | viewer / editor / admin |
| POST   | `/api/tasks`            | tasks    | editor / admin        |
| GET    | `/api/tasks/{id}`       | tasks    | viewer / editor / admin |
| PUT    | `/api/tasks/{id}`       | tasks    | editor / admin        |
| DELETE | `/api/tasks/{id}`       | tasks    | admin                 |
| GET    | `/api/reports/summary`  | reports  | admin                 |
| GET    | `/api/reports/export`   | reports  | admin                 |
| GET    | `/api/admin/audit`      | admin    | super-admin           |
| POST   | `/api/admin/broadcast`  | admin    | super-admin           |

## End-to-end walkthrough

1. **Create a JetAuth application** (if you don't already have one)
   — this is the identity source the gateway's BizAuthz gate will
   resolve claims against.
2. **Create a Biz Application Authorization config** bound to that
   application. Pick any model (default RBAC is fine for this demo).
3. **Import the OpenAPI spec** — in the authz module, go to
   *Resources → Import → OpenAPI*, paste the contents of
   `demo/task-api/openapi.yaml` (or fetch it from
   `http://localhost:8081/openapi.yaml`). You should see 11
   resources grouped by tag.
4. **Define roles & permissions** — suggested matrix:
   - `viewer`: `tasks:listTasks`, `tasks:getTask`, `identity:whoAmI`
   - `editor`: viewer + `tasks:createTask`, `tasks:updateTask`
   - `admin`: editor + `tasks:deleteTask`, `reports:*`
   - `super-admin`: admin + `admin:*`
5. **Add a Site** that points at this demo — see
   [Local setup](#local-setup--route-the-demo-through-the-jetauth-waf)
   above for the full field-by-field walk-through (domain, port
   overrides, SSL mode, bypass list, fail mode).
6. **Assign users to roles** in the authz module.
7. **Visit the site through the WAF** — e.g.
   `http://task-demo.jetauth.local:8080/api/tasks`. SSO kicks in, the
   gateway forwards `(userId, path, method)` to the enforcer, and
   you get 200 or a JSON 403 depending on the role.

## Troubleshooting

- **`/api/me` returns an empty user** — the request didn't pass
  through the WAF, or the site has `EnableBizAuthz` off. The helpful
  `gatewayNote` field is surfaced only when the header is missing.
- **Every request is 503** — the application binding is wrong, or
  the biz app is disabled. 503 specifically means "authz
  misconfigured"; 403 means "denied by policy". Check
  `service/authz.go` if you need to follow the codepath.
- **Policy changes take a while to apply** — the enforcer cache is
  currently process-local. See `TODO.md` *Redis 缓存 — 多实例部署支持*
  for the multi-instance caveat.
