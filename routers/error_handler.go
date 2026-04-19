package routers

import (
	"encoding/json"
	"net/http"
	"strings"
)

// Handle404 replaces beego's default "Not Found / Powered by beego 2.0.0"
// page, which leaks the web framework version and looks unbranded.
//
// Behaviour:
//   - /api/* → JSON error so SDK/JS clients get a parseable shape
//   - everything else → minimal neutral HTML, no framework fingerprint
//
// Static assets and the SPA fallback are served by StaticFilter before
// routing, so this handler only fires for truly unmatched paths.
func Handle404(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if strings.HasPrefix(r.URL.Path, "/api/") {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"status": "error",
			"msg":    "The requested endpoint was not found.",
		})
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusNotFound)
	_, _ = w.Write([]byte(notFoundHTML))
}

const notFoundHTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Not found</title>
<style>
:root{color-scheme:light dark}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f8fafc;color:#0f172a}
@media (prefers-color-scheme:dark){body{background:#0f172a;color:#e2e8f0}}
.card{max-width:420px;padding:48px 32px;text-align:center}
.code{font-size:64px;font-weight:700;letter-spacing:-.02em;margin:0 0 8px;opacity:.3}
h1{font-size:18px;font-weight:600;margin:0 0 8px}
p{font-size:14px;margin:0 0 24px;opacity:.65;line-height:1.5}
a{display:inline-block;padding:10px 20px;border-radius:8px;background:#0f172a;color:#fff;text-decoration:none;font-size:13px;font-weight:500;transition:opacity .15s}
a:hover{opacity:.85}
@media (prefers-color-scheme:dark){a{background:#e2e8f0;color:#0f172a}}
</style>
</head>
<body>
<div class="card">
<div class="code">404</div>
<h1>Page not found</h1>
<p>The page you are looking for does not exist or has been moved.</p>
<a href="/">Go home</a>
</div>
</body>
</html>`
