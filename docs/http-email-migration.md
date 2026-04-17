# Custom HTTP Email Upgrade Runbook

## What changed

Before this release, `Custom HTTP Email` providers stored their body-field map
in `user_mapping` (a field meant for OAuth user-info field mapping) and their
content-type in `issuer_url` (meant for OIDC issuer URLs). Both were bugs. The
new code has dedicated columns: `body_mapping`, `content_type`, `body_template`.

The universal sender now:
- Renders the body from `body_template` via `${var}` placeholders
  (see `email/template.go`)
- Applies content-type-aware escaping (JSON / x-www-form-urlencoded / text)
- Blocks outbound requests to RFC1918, loopback, link-local, and metadata
  IP ranges unless explicitly allowlisted

## What happens on first start

`InitCustomHttpEmailMigration()` (called from `main.go` immediately after
`object.InitDb()`) moves every `category=Email, type=Custom HTTP Email`
provider's `user_mapping` → `body_mapping` and `issuer_url` → `content_type`,
then clears the originals. The migration is idempotent.

Check server logs for:

```
[migration] upgraded N Custom HTTP Email providers
```

If `N == 0`, nothing needed migrating — either no such providers existed, or
they were already migrated on a prior start.

## Manual verification

```sql
SELECT owner, name, body_mapping, content_type, body_template, user_mapping, issuer_url
FROM provider
WHERE category = 'Email' AND type = 'Custom HTTP Email';
```

Expected after migration:
- `body_mapping` populated, `user_mapping` empty
- `content_type` set, `issuer_url` empty
- `body_template` may still be empty — the migration preserves legacy
  behavior but does not auto-generate a template. Admins should edit the
  provider and pick a preset (Cloudflare / Mailgun / etc.) to populate
  `body_template` with a working default.

## Rollback

Old code reads `user_mapping` and `issuer_url`. To roll back data only:

```sql
UPDATE provider
SET user_mapping = body_mapping,
    issuer_url   = content_type
WHERE category = 'Email'
  AND type = 'Custom HTTP Email'
  AND user_mapping = '';
```

Then redeploy the prior binary. Note: `body_template` is not represented in
the old code, so rollback does not restore a template — admins with
template-dependent configs will need to re-populate the old-style mapping.

## SSRF allowlist

If the email API lives on an internal network (e.g. an on-prem relay at
`10.0.5.10`), the request will be blocked by default. To allow it, set in
`conf/app.conf`:

```ini
ssrfAllowedHosts = 10.0.5.0/24
```

Multiple CIDRs are comma-separated. Restart the server after changing.

The blocklist covers:

| Range | Why |
|-------|-----|
| `127.0.0.0/8` | loopback |
| `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` | RFC1918 private |
| `100.64.0.0/10` | CGNAT |
| `169.254.0.0/16` | link-local + AWS/GCP metadata endpoint |
| `198.18.0.0/15` | benchmark |
| `224.0.0.0/4` | multicast |
| `240.0.0.0/4` | reserved |
| `::1/128`, `fc00::/7`, `fe80::/10` | IPv6 loopback, ULA, link-local |

## Testing the new config

After migrating (and optionally picking a preset), use the provider edit
page's "Send Test Email" button. On failure, the error message now includes
a response-body excerpt (up to 4 KB) from the remote API — much easier to
debug than the old `status: 500` bare-status message.
