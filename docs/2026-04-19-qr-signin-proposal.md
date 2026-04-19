# QR Sign-in Proposal

**Date**: 2026-04-19
**Status**: Proposal — not yet built.
**Relates to**: `docs/2026-04-19-auth-template-gallery.md` (T06 was originally slated as a layout template; this doc argues it should live one layer down, in the sign-in methods system).

---

## TL;DR

QR sign-in is a **sign-in method** (L3 in the three-layer model), not a layout template (L2). Building it as a template requires bolting new slots onto the template contract and duplicating QR logic across any template that wants to support QR-first UX. Building it as a sign-in method lets *any* template render QR next to the existing Password / Verification code / WebAuthn / Face ID methods — just like Chinese sites already do.

**Recommendation**: add a generalized `QR` sign-in method that sits beside the existing four, backed by a provider-agnostic QR backend endpoint. The first concrete integration reuses the existing WeChat ticket flow. DingTalk / Lark / custom app follow the same shape later.

---

## Why not a template

The Template contract today has four slots: `topBar`, `branding`, `content`, `htmlInjection`. Pages own what goes inside `content` — forms, providers, links — and templates own the outer layout. A QR-first template would either:

1. **Inject its own QR code into a brand new slot** (say `formPrimary`). Pages would need to know how to build this slot, which means every page (`SigninPage`, `ClassicSigninPage`, plus whatever future signin variants) grows QR-awareness. That's exactly the kind of cross-cutting feature-to-layout coupling we designed the slot system to avoid.
2. **Receive QR as config and render it itself**. Templates become business-logic-aware (polling tickets, handling scan events). Templates are supposed to be pure layout.

Either way the template abstraction leaks. The real nature of QR is *another way for a user to say "I'm me"* — which is exactly what a sign-in method is.

Chinese sign-in UX conventions (淘宝 / 支付宝 / 京东 / 微信网页版) don't use distinct layouts for QR-first, either. They use **the same centered-card layout** with a QR tab that happens to be the default. That's a sign-in-method ordering concern, not a layout concern.

---

## Existing infrastructure

JetAuth inherits a WeChat-specific QR flow from Casdoor:

| Piece | Location |
|-------|----------|
| Ticket generation | `controllers/auth.go:GetQRCode` — calls `idp.GetWechatOfficialAccountQRCode` |
| Ticket → image URL + ticket id | Same endpoint, returns `{code, ticket}` |
| Scan event | `controllers/auth.go` event handler (line ~1340, `HandleOfficialAccountEvent`) — validates WeChat callback, marks the ticket scanned |
| Ticket cache | `idp.WechatCacheMap` in-memory map |
| Status poll | `controllers/auth.go:GetWebhookEventType` — client polls for `SCAN` event |

This plumbing works, but it's hardwired to:
- A specific `Provider` of type `WeChat` (the caller passes a provider id)
- WeChat's Official Account API (ticket generation call)
- WeChat's async scan callback contract

Generalizing to DingTalk / Lark / a custom "scan-with-your-own-app" flow requires an abstraction.

---

## Proposed design

### 1. Backend: generalized QR endpoint

```
GET  /api/qr/begin?provider=<org>/<providerName>
     → { ticket, imageUrl, expiresIn }

GET  /api/qr/status?ticket=<ticket>
     → { status: "pending" | "scanned" | "confirmed" | "expired",
         sessionToken?: string }   // populated when confirmed
```

Internally dispatch on `provider.Type`:
- `WeChat` → existing `idp.GetWechatOfficialAccountQRCode` path
- `DingTalk` → (to be implemented; DingTalk has a similar ticket-image flow)
- `Lark` → (to be implemented)
- `Custom` → generate a random ticket, return `imageUrl` = a URL encoding the ticket that the app's own scanner can POST to `/api/qr/confirm` with a session token

Each provider type implements a small interface on the Go side:

```go
type QRIdProvider interface {
    GenerateTicket() (ticket, imageUrl string, expiresIn int, err error)
    GetStatus(ticket string) (status string, sessionToken string, err error)
}
```

The existing `WechatIdProvider` needs a thin adapter to this interface.

### 2. Frontend: QR as a SigninMethod

Add `"QR"` to the `SigninMethod.name` enum used by admins.
Update `ClassicSigninPage` and `MethodStep` (identifier-first) to render `<QRBody />` when QR is selected.

`<QRBody />`:
1. On mount, calls `/api/qr/begin?provider=<configured-provider>` — provider is configured via the signin-method row's `rule` field (reuses the existing rule column)
2. Renders the returned `imageUrl` (QR image)
3. Polls `/api/qr/status?ticket=...` every 2s
4. On `confirmed`, stores the session token and redirects to `/`
5. On `expired`, regenerates

### 3. Admin config

The `signinMethods` table already supports per-method rules. For QR:
- `name`: `"QR"`
- `displayName`: auto-filled
- `rule`: dropdown of the app's configured QR-capable providers (type in `["WeChat", "DingTalk", "Lark", "Custom"]`)

No new admin tab — reuses the existing Sign-in Methods table. Ordering in that table controls tab order, which is how admins express "QR is the primary way to sign in" (put it first).

### 4. Chinese-style "QR is default" UX

For apps that want QR-first:
- Put `QR` as the first row in `signinMethods`
- Set `signinMethodMode` to `"classic"` (tab-style)
- The Classic tab renderer already picks the first tab as default selected

No template changes required. Works with any layout — Centered, Split Hero, Full-bleed, Sidebar Brand, Minimal — wherever the admin pointed `app.template`.

---

## Work breakdown

| Area | Task | Estimate |
|------|------|----------|
| Backend | Define `QRIdProvider` interface | 2h |
| Backend | Adapter for WeChat | 2h |
| Backend | `/api/qr/begin` + `/api/qr/status` endpoints | 3h |
| Backend | Swagger annotations | 0.5h |
| Frontend | `<QRBody />` component with poll loop | 3h |
| Frontend | Add `"QR"` to supported tabs in `ClassicSigninPage` + `MethodStep` | 2h |
| Frontend | Signin-method admin row: QR option + provider dropdown in `rule` | 1h |
| Frontend | i18n keys | 0.5h |
| Docs | Admin guide: how to enable QR for an app | 1h |
| **Total** | | **~15h (≈2 days)** |

Does *not* include DingTalk / Lark provider implementations — those are per-provider IdP adapters that follow the same shape once the interface exists.

---

## Security considerations

- **Ticket entropy** — at least 128 bits, url-safe base64, not guessable.
- **Ticket expiry** — 5 minutes max. `/api/qr/begin` returns `expiresIn`; frontend regenerates on expiry.
- **Rate limit** — per-IP cap on `/api/qr/begin` (e.g. 30/min) to prevent ticket exhaustion attacks on the cache.
- **Status leak** — `/api/qr/status` must not return the session token to the *requesting* client until the ticket is confirmed AND the polling client's IP matches the ticket's origin IP. Otherwise a malicious page can grab someone else's session token by polling their ticket.
- **Cache eviction** — expired tickets must be evicted from `WechatCacheMap` (or the new generalized cache) on a timer, not just on next access, or memory grows unbounded under attack.
- **CSRF** — the confirm callback (which the scan produces) should include an HMAC of the ticket+provider-secret so it can't be forged by someone who only knows the ticket id.

---

## Open questions

1. **Custom-provider QR flow** — should the "scan with your own app" mode use a server-sent event (SSE) stream for status instead of poll? Polling is simpler to deploy but burns more RPC; SSE needs keepalive tuning. Recommend polling for v1, SSE as an opt-in optimization.

2. **Session handoff on mobile browser** — if the user scans on the same device they're already on (e.g. mobile browser → WeChat app → back to browser), the sign-in needs to land on the right tab. Usually handled by the app linking back with a deep link.

3. **Offline QR** — signed-JWT QR codes that contain the entire auth grant without needing a server round-trip. Much faster UX but requires the scanner to be trusted to validate the signature. Out of scope for v1.

---

## When to build

Not blocked by anything in M1/M2. Can land as M3 or M4. Priority should be driven by customer demand — if multiple apps want QR-first UX, pull it forward; otherwise it can wait while the template system matures.
