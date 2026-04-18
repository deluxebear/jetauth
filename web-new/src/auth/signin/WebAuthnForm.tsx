import { useState } from "react";
import { ArrowLeft, KeyRound } from "lucide-react";
import { startAuthentication } from "@simplewebauthn/browser";
import { useTranslation } from "../../i18n";
import { api } from "../../api/client";

interface WebAuthnFormProps {
  identifier: string;
  userHint?: string;
  application: string;
  organization: string;
  onSuccess: () => void;
  onBack?: () => void;
  error?: string;
}

/**
 * Platform-authenticator (passkey) sign-in step.
 *
 * Flow:
 *   1. GET /api/webauthn/signin/begin?owner=<org>&name=<identifier>
 *      → receives PublicKeyCredentialRequestOptions
 *   2. startAuthentication(options) → triggers browser/OS passkey prompt
 *   3. POST /api/webauthn/signin/finish → backend validates assertion
 *   4. onSuccess() → parent handles full-page reload
 *
 * Feature-detects window.PublicKeyCredential; falls back to a clear
 * "unsupported" message + back button when missing.
 */
export default function WebAuthnForm({
  identifier,
  userHint,
  application: _application,
  organization,
  onSuccess,
  onBack,
  error: externalError,
}: WebAuthnFormProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [flowError, setFlowError] = useState("");

  const display = userHint && userHint.length > 0 ? userHint : identifier;
  const isSupported = typeof window !== "undefined" && !!window.PublicKeyCredential;

  const handleSignin = async () => {
    setFlowError("");
    setLoading(true);
    try {
      // Step 1: begin — get challenge from server
      const options = await api.get<Record<string, unknown>>(
        `/api/webauthn/signin/begin?owner=${encodeURIComponent(organization)}&name=${encodeURIComponent(identifier)}`,
      );

      // Step 2: hand off to the browser authenticator
      // Cast via `unknown` since the backend response is typed as opaque JSON
      // and `PublicKeyCredentialRequestOptionsJSON` has a stricter contract.
      const assertion = await startAuthentication({
        optionsJSON: options as unknown as Parameters<typeof startAuthentication>[0]["optionsJSON"],
      });

      // Step 3: finish — send assertion to server
      await api.post("/api/webauthn/signin/finish", assertion);

      // Step 4: notify parent
      onSuccess();
    } catch (e: unknown) {
      setFlowError((e as Error).message || t("auth.webauthn.failed"));
    } finally {
      setLoading(false);
    }
  };

  const displayError = externalError || flowError;

  return (
    <div className="space-y-4">
      {/* Back chip + identifier */}
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2">
        {onBack && (
          <>
            <button
              type="button"
              onClick={onBack}
              aria-label={t("auth.password.backButton")}
              className="flex items-center gap-1 text-[12px] text-text-muted hover:text-text-secondary transition-colors"
            >
              <ArrowLeft size={14} />
              {t("auth.password.backButton")}
            </button>
            <span className="h-4 w-px bg-border" />
          </>
        )}
        <span className="truncate text-[13px] text-text-secondary">{display}</span>
      </div>

      {/* External / flow error */}
      {displayError && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-[13px] text-danger">
          {displayError}
        </div>
      )}

      {isSupported ? (
        <>
          {/* Prompt hint */}
          <p className="text-[13px] text-text-muted text-center">
            {t("auth.webauthn.prompt")}
          </p>

          {/* Primary passkey button */}
          <button
            type="button"
            onClick={handleSignin}
            disabled={loading}
            className="group w-full flex items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-[14px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            {loading ? (
              <>
                <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                {t("auth.webauthn.trying")}
              </>
            ) : (
              <>
                <KeyRound size={16} />
                {t("auth.webauthn.button")}
              </>
            )}
          </button>
        </>
      ) : (
        /* Browser does not support WebAuthn */
        <div className="rounded-lg border border-border bg-surface-1 px-4 py-4 text-center">
          <KeyRound size={24} className="mx-auto mb-2 text-text-muted" />
          <p className="text-[13px] text-text-muted">{t("auth.webauthn.unsupported")}</p>
        </div>
      )}
    </div>
  );
}
