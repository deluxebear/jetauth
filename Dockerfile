# syntax=docker/dockerfile:1.7
# ============================================================================
# JetAuth multi-stage, multi-arch Dockerfile
#
# Build:
#   # Local, single-arch
#   docker build -t jetauth:dev .
#
#   # Multi-arch publish (requires buildx)
#   docker buildx build \
#     --platform=linux/amd64,linux/arm64 \
#     -t ghcr.io/deluxebear/jetauth:latest \
#     --push .
#
# Runtime: alpine 3.20 + static Go binary, non-root (uid 1000), healthcheck.
# ============================================================================

ARG NODE_VERSION=22-alpine
ARG GO_VERSION=1.25-alpine
ARG ALPINE_VERSION=3.20

# ----------------------------------------------------------------------------
# Stage 1: Frontend build
#
# JS output is the same across CPU architectures, so force this stage onto
# the host's BUILDPLATFORM — cross-building React on arm64 emulation is
# painfully slow.
# ----------------------------------------------------------------------------
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION} AS front
WORKDIR /web

COPY web/package.json web/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund --prefer-offline

COPY web/ ./
RUN NODE_OPTIONS="--max-old-space-size=4096" npm run build


# ----------------------------------------------------------------------------
# Stage 2: Backend build
#
# Cross-compiles only the requested target arch per buildx platform, unlike
# the old build.sh which always compiled amd64 AND arm64 on every run.
# ----------------------------------------------------------------------------
FROM --platform=$BUILDPLATFORM golang:${GO_VERSION} AS back
RUN apk add --no-cache git ca-certificates
WORKDIR /src

# Dep download layered separately so module changes invalidate it
# independently of source changes.
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

COPY . .

# Bake git-derived version into util/variable.go before compilation.
# TestGetVersionInfo is a fork-specific trick: it rewrites Version/CommitId
# in variable.go from the live git metadata so `go build` picks them up
# without requiring ldflags at every call site.
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go test -v -run TestGetVersionInfo ./util/system_test.go ./util/system.go ./util/variable.go

ARG TARGETOS
ARG TARGETARCH
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
    go build -trimpath -ldflags="-w -s" -o /out/server .


# ----------------------------------------------------------------------------
# Stage 3: Runtime
#
# alpine 3.20 + static Go binary. ca-certificates for outbound HTTPS
# (OAuth callbacks, ACME, upstream idp), tzdata for correct Go time.LoadLocation
# behaviour, wget as a lightweight HEALTHCHECK helper. Runs as uid 1000.
# ----------------------------------------------------------------------------
FROM alpine:${ALPINE_VERSION} AS standard
LABEL org.opencontainers.image.source="https://github.com/deluxebear/jetauth"
LABEL org.opencontainers.image.description="JetAuth — IAM / SSO platform"
LABEL org.opencontainers.image.licenses="Apache-2.0"

RUN apk add --no-cache ca-certificates tzdata wget \
    && update-ca-certificates

ARG USER=jetauth
RUN adduser -D -u 1000 ${USER}

WORKDIR /
COPY --from=back  --chown=${USER}:${USER} /out/server         /server
COPY --from=back  --chown=${USER}:${USER} /src/swagger        /swagger
COPY --from=back  --chown=${USER}:${USER} /src/conf/app.conf  /conf/app.conf
COPY --from=front --chown=${USER}:${USER} /web/build          /web/build

# Writable data dir for SQLite / uploaded files when no external DB is wired
# up. Default config still writes to CWD (`/`) which is read-only for the
# non-root user, so production use requires either:
#   docker run -v jetauth-data:/data \
#     -e dataSourceName="file:/data/jetauth.db?cache=shared" ...
# or set driverName=mysql / postgres via env vars.
RUN mkdir -p /data && chown ${USER}:${USER} /data
VOLUME ["/data"]

USER ${USER}
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:8000/api/health || exit 1

ENTRYPOINT ["/server"]


