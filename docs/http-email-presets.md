# Authoring Email Presets

A preset is a shippable default that fills endpoint, method, headers, and body
template so admins only supply credentials and account IDs. Presets live in
`email/presets.go` (backend; source of truth) and are served to the frontend at
`/api/get-http-email-presets`. The frontend's `PresetPicker` component lists
them as one-click buttons on the Custom HTTP Email provider edit page.

## Structure

```go
type Preset struct {
    Key             string            // stable id, kebab-case
    Name            string            // human-readable
    EndpointExample string            // URL with {placeholders} admin replaces
    Method          string            // "POST" in most cases
    ContentType     string            // application/json | application/x-www-form-urlencoded | text/plain
    HttpHeaders     map[string]string // includes Authorization hint like "Bearer {api_token}"
    BodyTemplate    string            // body with ${var} placeholders
    Docs            string            // link to upstream docs
}
```

## Template placeholder vocabulary

Available in `BodyTemplate`:

| Placeholder | Shape | Example substitution |
|---|---|---|
| `${fromAddress}` | string | `noreply@yourdomain.com` |
| `${fromName}` | string | `JetAuth` |
| `${toAddress}` | string | first recipient email |
| `${toAddresses}` | **array** | native JSON array or form-multi-value |
| `${subject}` | string | `Your code is 123456` |
| `${content}` | string | HTML body |
| `${contentText}` | string | plain-text body |

`${toAddresses}` is structural: in JSON mode it expands to `["a","b"]`
(without surrounding quotes), in form mode to comma-separated URL-encoded
values. Use it when the API accepts multiple recipients as an array.

## Context-aware escaping

Values are escaped based on `ContentType`:

- `application/json` — JSON string escape (quotes, backslashes, newlines).
  Template author supplies the surrounding `"..."`, the placeholder value
  is inserted without its own quotes.
- `application/x-www-form-urlencoded` — URL query escape.
- `text/plain` (or empty) — raw.

Unknown placeholders (typos) cause the send to fail with a descriptive error
rather than silently truncating the body. Test each preset locally with
`go test ./email -run TestPresets_`.

## Header values

Headers are **not** template-substituted. They are sent as-is. Use literal
hints like `Bearer {api_token}` or `{server_token}` so admins know which
secret to replace. Examples:

- `"Authorization": "Bearer {api_token}"`
- `"X-Postmark-Server-Token": "{server_token}"`
- `"Authorization": "Basic {base64(api:API_KEY)}"` (Mailgun style)

## Checklist when adding a preset

1. **Verify live.** Hit the real API with a throwaway key and capture a
   working payload. Translate it into the template.
2. **Add test assertion.** `TestPresets_AllKeysUnique` already catches key
   collisions and missing schemes. If your preset's JSON body is non-trivial
   (nested objects, arrays), add a dedicated `TestPresets_<Name>RendersValidJSON`
   to `email/presets_test.go`.
3. **Include docs URL.** `Docs` field must link to the upstream spec.
4. **Keep endpoint templated.** Use `{account_id}`, `{domain}`, `{region}`
   etc. in `EndpointExample` to signal which parts the admin edits. Do NOT
   hardcode a real account id.
5. **Never bake secrets.** `HttpHeaders` may contain placeholder strings like
   `{api_token}`; admins overwrite them. Tests should not require real keys.

## Security

- Presets ship identically to all customers — no environment-specific data.
- An admin-owned SSRF allowlist (`ssrfAllowedHosts` in `conf/app.conf`) can
  relax private-IP blocking; presets don't need to worry about it.
- Response-body leak: error excerpts are capped at 4 KB. Do not assume the
  remote API masks credentials in error responses.

## Frontend integration

The frontend fetches `/api/get-http-email-presets` once at page load and
caches within the session. Adding a preset to `email/presets.go` is enough —
no frontend-side data mirror is required. Restart the backend for new
presets to appear; the frontend picks them up on next page load.

If you want a local-only preset (not server-shipped), add it to
`web-new/src/data/emailPresets.ts` as a fallback. That file currently only
contains the fetcher.

## Example: adding Mailjet variant

```go
{
    Key:             "mailjet",
    Name:            "Mailjet v3.1",
    EndpointExample: "https://api.mailjet.com/v3.1/send",
    Method:          "POST",
    ContentType:     "application/json",
    HttpHeaders: map[string]string{
        "Authorization": "Basic {base64(API_KEY:SECRET)}",
        "Content-Type":  "application/json",
    },
    BodyTemplate: `{"Messages":[{"From":{"Email":"${fromAddress}","Name":"${fromName}"},"To":[{"Email":"${toAddress}"}],"Subject":"${subject}","HTMLPart":"${content}"}]}`,
    Docs:         "https://dev.mailjet.com/email/reference/send-emails/",
},
```

Run `go test ./email -run TestPresets` — both tests pass means the preset
key is unique, the endpoint has a scheme, and (if Cloudflare-like JSON) the
body renders to valid JSON with sample context.
