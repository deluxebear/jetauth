# MFA Setup & Verify Flow Design

## Overview

Implement the complete MFA (Multi-Factor Authentication) flow for the new frontend. Two paths: forced MFA setup (RequiredMfa) and MFA verification (NextMfa). Supports App (TOTP), SMS, and Email MFA types.

## Backend API Reference (already implemented)

### Login API Response Variants

The `/api/login` endpoint returns different `data` values:

1. **Normal login success:** `{ status: "ok", data: "user-id-string" }` → complete login
2. **RequiredMfa:** `{ status: "ok", data: "RequiredMfa" }` → user must set up MFA before login
3. **NextMfa:** `{ status: "ok", data: "NextMfa", data2: [MfaProps...] }` → user must verify MFA

### MFA Setup APIs

| Endpoint | Method | Params | Purpose |
|----------|--------|--------|---------|
| `/api/mfa/setup/initiate` | POST (form) | `owner`, `name`, `mfaType` | Returns secret/QR URL for TOTP, or sends code for SMS/Email |
| `/api/mfa/setup/verify` | POST (form) | `passcode`, `mfaType`, `secret`/`dest`, `countryCode` | Verifies setup code |
| `/api/mfa/setup/enable` | POST (form) | `owner`, `name`, `mfaType`, `secret`/`dest`, `recoveryCodes`, `countryCode` | Enables MFA on user |

### MFA Verification (during login)

Call `/api/login` again with `passcode` + `mfaType` (or `recoveryCode`). Backend detects MFA session and validates.

```
POST /api/login
Body (JSON): {
  application: "app-name",
  organization: "org-name",
  passcode: "123456",
  mfaType: "app",
  enableMfaRemember: true
}
```

On success: returns normal login response with `HandleLoggedIn`.

### MfaProps Structure (returned in NextMfa data2)

```typescript
interface MfaProps {
  enabled: boolean;
  isPreferred: boolean;
  mfaType: string;          // "app" | "sms" | "email"
  secret: string;           // masked phone/email for display
  countryCode: string;
  url: string;              // TOTP QR URL (otpauth://)
  recoveryCodes: string[];
  mfaRememberInHours: number;
}
```

## Frontend Architecture

### New Files

| File | Responsibility |
|------|---------------|
| `web/src/pages/MfaSetup.tsx` | 3-step MFA setup page (password → verify code → enable) |
| `web/src/pages/MfaVerify.tsx` | MFA verification page (enter code or recovery code) |

### Modified Files

| File | Changes |
|------|---------|
| `web/src/App.tsx` | Add routes, store MFA state, navigate to MFA pages on RequiredMfa/NextMfa |
| `web/src/locales/en.ts` | MFA page translations |
| `web/src/locales/zh.ts` | MFA page translations |

## Path A: MFA Setup Flow (RequiredMfa)

### Trigger

Login API returns `{ status: "ok", data: "RequiredMfa" }`. App.tsx stores `{ owner, name, organization, application }` from the login form and navigates to `/mfa/setup`.

### Step 1: Verify Password

Simple password input to confirm identity. Frontend calls `/api/mfa/setup/initiate` with `owner`, `name`, `mfaType` to get the TOTP secret/QR code (or trigger SMS/Email code).

The mfaType is determined from the organization's mfaItems — whichever has `rule: "Required"`.

### Step 2: Verify Code (type-specific)

**App (TOTP):**
- Display QR code (generate from `otpauth://` URL using a QR library)
- Show secret key as text fallback (for manual entry)
- 6-digit input field
- Call `/api/mfa/setup/verify` with `passcode`, `mfaType: "app"`, `secret`

**SMS:**
- Show masked phone number from user data
- "Send Code" button with countdown
- 6-digit input field
- Call `/api/mfa/setup/verify` with `passcode`, `mfaType: "sms"`, `dest` (phone), `countryCode`

**Email:**
- Show masked email from user data
- "Send Code" button with countdown
- 6-digit input field
- Call `/api/mfa/setup/verify` with `passcode`, `mfaType: "email"`, `dest` (email)

### Step 3: Enable & Show Recovery Code

- Display recovery code (UUID) — warn user to save it
- "Copy" button for recovery code
- Call `/api/mfa/setup/enable` with all params
- On success: re-call `/api/login` with original credentials to complete login
- If the re-login returns NextMfa: navigate to `/mfa/verify`
- If normal success: navigate to `/`

## Path B: MFA Verify Flow (NextMfa)

### Trigger

Login API returns `{ status: "ok", data: "NextMfa", data2: [MfaProps...] }`. App.tsx stores the MFA props list and login form data, navigates to `/mfa/verify`.

### UI

- Dropdown/tabs to select verification method (from available MfaProps)
- 6-digit code input
- "Remember this device" checkbox (shows `mfaRememberInHours` from MfaProps)
- "Use recovery code" link toggles to recovery code input

### Verification

Call `/api/login` again with:
```json
{
  "application": "original-app",
  "organization": "original-org",
  "passcode": "123456",
  "mfaType": "app",
  "enableMfaRemember": true
}
```

Or for recovery code:
```json
{
  "application": "original-app",
  "organization": "original-org",
  "recoveryCode": "3d0eb45a-..."
}
```

On success: `applyAccountData(res)` → navigate to `/`.

## QR Code Rendering

Use `qrcode` npm package (lightweight, no canvas dependency) to generate QR code from `otpauth://` URL as data URL. No external service needed.

## State Management

App.tsx manages MFA state during the login→MFA→complete flow:

```typescript
const [mfaState, setMfaState] = useState<{
  type: "setup" | "verify";
  mfaType?: string;              // Required MFA type (for setup)
  mfaProps?: MfaProps[];         // Available methods (for verify)
  loginForm: {                   // Original login data for re-login
    application: string;
    organization: string;
    username: string;
    password: string;            // encrypted password, kept in memory only
  };
} | null>(null);
```

This state lives in App.tsx memory only — never persisted to localStorage.

## Security Notes

- Encrypted password kept in memory for re-login after MFA setup (cleared on unmount)
- MFA pages are unauthenticated routes (user hasn't completed login yet)
- Backend validates via MfaSessionUserId (not login session)
- Recovery codes shown once, never stored in frontend

## Visual Style

MFA pages use the same split-panel layout as Login/Signup (left branding + right form), with the same org theme/logo applied. Consistent with existing auth page design.
