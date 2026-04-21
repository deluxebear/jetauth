<h1 align="center" style="border-bottom: none;">🔐 JetAuth</h1>
<h3 align="center">Unified Auth for the AI Era — Identity, Access Management & AI Gateway</h3>
<p align="center">
  Supporting MCP, A2A, OAuth 2.1, OIDC, SAML, CAS, LDAP, SCIM, WebAuthn, TOTP, MFA, Face ID and more
</p>

<p align="center">
  <a href="https://github.com/deluxebear/jetauth/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/deluxebear/jetauth?style=flat-square" alt="license">
  </a>
  <a href="https://github.com/deluxebear/jetauth/issues">
    <img alt="GitHub issues" src="https://img.shields.io/github/issues/deluxebear/jetauth?style=flat-square">
  </a>
  <a href="https://github.com/deluxebear/jetauth">
    <img alt="GitHub stars" src="https://img.shields.io/github/stars/deluxebear/jetauth?style=flat-square">
  </a>
</p>

## About

JetAuth is a unified authentication and authorization platform for the AI era, based on [Casdoor](https://github.com/casdoor/casdoor). It provides identity management, access control, and AI gateway capabilities in a single platform.

## Features

- Multi-organization management with role-based access control
- OAuth 2.1 / OIDC / SAML / CAS / LDAP / SCIM protocol support
- MCP Server & A2A agent authentication
- WebAuthn / TOTP / MFA / Face ID
- Modern frontend built with React, Vite, and Tailwind CSS
- RESTful API with Swagger documentation

## Install

```bash
git clone https://github.com/deluxebear/jetauth.git
cd jetauth
go build -o jetauth .
./jetauth
```

On first run, `jetauth` seeds `conf/app.conf` from an embedded default (with a randomized `authState`) and boots on port `8000` with a local SQLite database. Edit the file and restart to customize — see [`docs/configuration-reference.md`](docs/configuration-reference.md) for all options.

### macOS: unblock the downloaded binary

macOS Gatekeeper will block pre-built darwin binaries because they are not signed with an Apple Developer ID. After unzipping a release asset, clear the quarantine attribute once:

```bash
xattr -cr ./jetauth
chmod +x ./jetauth
./jetauth
```

## License

This project is licensed under the [Apache License 2.0](LICENSE).

Based on [Casdoor](https://github.com/casdoor/casdoor) by the Casdoor Authors.
