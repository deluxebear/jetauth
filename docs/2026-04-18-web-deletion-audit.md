# Web Module Deletion: Pre-flight Audit

**Date:** 2026-04-18  
**Branch:** feat/auth-ui-revamp  
**Context:** Dependency enumeration for W1-T02 (static serving migration from legacy `web/` to `web/`)

## Summary

Audit complete. Baseline search found 9 references across known files; grep surfaced 4 additional files not in the baseline that require W1-T02 coverage: `deployment/deploy.go` (2 hits), `embedded/embedded.go` (1 comment), `.github/workflows/sync.yml` (1 hit), and `Makefile` (1 hit). Total audit surface: 13 references across 10 unique files. Ready for W1-T02 migration planning.

## Grep Output

### Command 1: Go Code References to `web/build` and `web/build`

```
./routers/static_filter.go:43:	path := "web/build"
./routers/static_filter.go:52:	path = filepath.Join(frontendBaseDir, "web/build")
./routers/static_filter.go:202:		errorText := fmt.Sprintf("The JetAuth frontend HTML file: \"index.html\" was not found, it should be placed at: \"%s/web/build/index.html\".", dir)
./embed_static.go:26://go:embed all:web/build
./embed_static.go:33:	sub, err := fs.Sub(embeddedWebFS, "web/build")
./deployment/deploy.go:55:	path := fmt.Sprintf("../web/build/static/%s/", folder)
./deployment/deploy.go:79:	htmlPath := "../web/build/index.html"
./embedded/embedded.go:19:// WebFS holds the embedded frontend filesystem (web/build).
./main.go:87:	// web.SetStaticPath("/static", "web/build/static")
```

### Command 2: CI, Docker, and Build Configuration References

```
Dockerfile:5:COPY ./web/package.json ./web/yarn.lock ./
Dockerfile:49:COPY --from=FRONT --chown=$USER:$USER /web/build ./web/build
Dockerfile:68:COPY --from=FRONT /web/build ./web/build
.github/workflows/sync.yml:30:        config: './web/crowdin.yml'
.github/workflows/build.yml:46:          cache-dependency-path: ./web/yarn.lock
.github/workflows/build.yml:54:          path: ./web/build
.github/workflows/build.yml:136:          cache-dependency-path: ./web/yarn.lock
.github/workflows/build.yml:151:          path: ./web/cypress/screenshots
.github/workflows/build.yml:156:          path: ./web/cypress/videos
.github/workflows/build.yml:212:          path: ./web/build
Makefile:71:	cd web/ && yarn && yarn run build && cd -
```

### Command 3: Code Importing or Running from `web/`

```
./routers/lightweight_auth_filter.go:46:	candidates = append(candidates, filepath.Join("web", "public", scriptName))
./object/oauth_dcr.go:116:		req.ApplicationType = "web"
```

**Note:** Line in `oauth_dcr.go:116` is a string literal for OAuth DCR spec (ApplicationType enum), not a path reference—can be safely ignored for migration.

## Deletion Surface: Files Requiring W1-T02 Changes

- [ ] **Go Files (Path Rewrites)**
  - [ ] `embed_static.go:26,33` — Repoint `//go:embed` directive and `fs.Sub()` call from `web/build` → `web/build`
  - [ ] `routers/static_filter.go:43,52` — Update hardcoded path strings `"web/build"` → `"web/build"`
  - [ ] `routers/static_filter.go:202` — Update error message (already hints `web/build`, but verify it matches final target)
  - [ ] `routers/lightweight_auth_filter.go:46` — Update fallback candidate path from `"web"` → `"web"`
  - [ ] `deployment/deploy.go:55,79` — Update relative paths `../web/build/static` and `../web/build/index.html` → use `web/` equivalent

- [ ] **Configuration & Metadata**
  - [ ] `embedded/embedded.go:19` — Update comment documentation for `WebFS` to reflect `web/build` source

- [ ] **Docker Build**
  - [ ] `Dockerfile:5` — Update `COPY ./web/package.json ./web/yarn.lock` → point to `web/` paths
  - [ ] `Dockerfile:49,68` — Update `COPY --from=FRONT /web/build` → `COPY --from=FRONT /web/build` (2 occurrences in different build stages)

- [ ] **CI/CD Workflows**
  - [ ] `.github/workflows/build.yml:46,136` — Update `cache-dependency-path: ./web/yarn.lock` → `./web/yarn.lock` (2 occurrences)
  - [ ] `.github/workflows/build.yml:54,212` — Update artifact `path: ./web/build` → `./web/build` (2 occurrences)
  - [ ] `.github/workflows/build.yml:151,156` — Update test artifact paths (cypress screenshots/videos) from `./web/cypress` → `./web/cypress` if test suites move
  - [ ] `.github/workflows/sync.yml:30` — Update Crowdin config `'./web/crowdin.yml'` → `'./web/crowdin.yml'` (if file moves)

- [ ] **Build Automation**
  - [ ] `Makefile:71` — Update `frontend` target from `cd web/` → `cd web/` (both the directory and yarn command)

**Total files to touch:** 10 (5 Go, 1 Dockerfile, 2 GitHub workflows, 1 Makefile, 1 configuration comment)

---

## Notes for W1-T02

1. The `//go:embed all:web/build` directive must remain a **single-line rewrite** (not a folder migration) since it's a compile-time directive.
2. The Dockerfile `COPY` stages should verify that the build stage name `FRONT` outputs to `/web/build` (not `/web/build`) — may need adjustment in the multi-stage build.
3. Cypress test paths assume the test suite files move to `web/cypress/`; confirm with the UI team if tests stay in legacy `web/` or move.
4. The `deployment/deploy.go` file uses relative paths (`../web/build`) — verify working directory expectations before rewriting (may need absolute path or env var injection).
5. No references found in shell scripts (`build.sh`, `docker-entrypoint.sh`) in this audit run—those were searched but returned no hits.
