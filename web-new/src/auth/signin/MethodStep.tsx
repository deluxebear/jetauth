import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "../../i18n";
import PasswordForm from "./PasswordForm";
import CodeForm from "./CodeForm";
import WebAuthnForm from "./WebAuthnForm";
import FaceForm from "./FaceForm";
import type { SigninMethodInfo } from "../api/types";

type MethodName = "Password" | "Verification code" | "WebAuthn" | "Face ID";

interface MethodStepProps {
  identifier: string;
  userHint?: string;
  application: string;
  organization: string;
  methods: SigninMethodInfo[];
  recommended: string;
  forgotPasswordHref?: string;
  onPasswordSubmit: (password: string, extras?: { autoSignin?: boolean }) => Promise<void>;
  onCodeSubmit: (code: string) => Promise<void>;
  onWebAuthnSuccess: () => void;
  onFaceSuccess: () => void;
  onBack?: () => void;
  /**
   * Admin-configured order of method names (from application.signinMethods).
   * If provided and non-empty, drives the display order of the method picker;
   * methods missing from this list fall to the end in their server order.
   * If empty/undefined, uses the server-provided order untouched.
   */
  orderedMethodNames?: string[];
  error?: string;
  // Admin-driven signin item overrides, wired by SigninPage from
  // useSigninItemVisibility. Each form consumes only the ones that apply.
  showForgot?: boolean;
  forgotLabel?: string;
  submitLabel?: string;
  showAgreement?: boolean;
  agreementLabel?: string;
  agreementRequired?: boolean;
  showCaptcha?: boolean;
  captchaPlaceholder?: string;
  showRememberMe?: boolean;
  rememberLabel?: string;
}

/**
 * Renders the active method's form and lets the user switch between
 * methods when more than one is available. The parent orchestrator
 * (SigninPage) owns the actual POST /api/login calls for Password and
 * Code; WebAuthn and Face forms handle their own network flow and
 * signal back via onWebAuthnSuccess / onFaceSuccess.
 */
export default function MethodStep({
  identifier,
  userHint,
  application,
  organization,
  methods,
  recommended,
  forgotPasswordHref,
  onPasswordSubmit,
  onCodeSubmit,
  onWebAuthnSuccess,
  onFaceSuccess,
  onBack,
  orderedMethodNames,
  error,
  showForgot,
  forgotLabel,
  submitLabel,
  showAgreement,
  agreementLabel,
  agreementRequired,
  showCaptcha,
  captchaPlaceholder,
  showRememberMe,
  rememberLabel,
}: MethodStepProps) {
  const { t } = useTranslation();

  // Apply admin-configured ordering when present: items appear in the
  // configured sequence; anything not configured is dropped from the
  // picker (parity with the classic tab logic).
  const orderedMethods = (() => {
    if (!orderedMethodNames || orderedMethodNames.length === 0) return methods;
    const byName = new Map(methods.map((m) => [m.name, m]));
    const out: SigninMethodInfo[] = [];
    for (const name of orderedMethodNames) {
      const m = byName.get(name);
      if (m) out.push(m);
    }
    return out.length > 0 ? out : methods;
  })();

  const initial =
    (orderedMethods.find((m) => m.name === recommended)?.name as MethodName | undefined) ??
    (orderedMethods[0]?.name as MethodName | undefined) ??
    "Password";
  const [active, setActive] = useState<MethodName>(initial);
  const [menuOpen, setMenuOpen] = useState(false);

  const showSwitcher = orderedMethods.length > 1;
  // destType / destValue for CodeForm: prefer email; fall back to phone.
  const inferDestType = (): "email" | "phone" =>
    userHint && userHint.includes("@") ? "email" : "phone";

  let body: ReactNode = null;
  if (active === "Password") {
    body = (
      <PasswordForm
        identifier={identifier}
        userHint={userHint}
        onSubmit={onPasswordSubmit}
        onBack={onBack}
        error={error}
        forgotPasswordHref={forgotPasswordHref}
        showForgot={showForgot}
        forgotLabel={forgotLabel}
        submitLabel={submitLabel}
        showAgreement={showAgreement}
        agreementLabel={agreementLabel}
        agreementRequired={agreementRequired}
        showCaptcha={showCaptcha}
        captchaPlaceholder={captchaPlaceholder}
        showRememberMe={showRememberMe}
        rememberLabel={rememberLabel}
      />
    );
  } else if (active === "Verification code") {
    body = (
      <CodeForm
        identifier={identifier}
        destType={inferDestType()}
        destValue={identifier}
        application={application}
        organization={organization}
        onSubmit={onCodeSubmit}
        onBack={onBack}
        error={error}
        submitLabel={submitLabel}
        showAgreement={showAgreement}
        agreementLabel={agreementLabel}
        agreementRequired={agreementRequired}
        showCaptcha={showCaptcha}
        captchaPlaceholder={captchaPlaceholder}
      />
    );
  } else if (active === "WebAuthn") {
    body = (
      <WebAuthnForm
        identifier={identifier}
        userHint={userHint}
        application={application}
        organization={organization}
        onSuccess={onWebAuthnSuccess}
        onBack={onBack}
        error={error}
        submitLabel={submitLabel}
      />
    );
  } else if (active === "Face ID") {
    body = (
      <FaceForm
        identifier={identifier}
        userHint={userHint}
        application={application}
        organization={organization}
        onSuccess={onFaceSuccess}
        onBack={onBack}
        error={error}
        submitLabel={submitLabel}
      />
    );
  }

  return (
    <div className="space-y-3">
      {body}

      {showSwitcher && (
        <div
          className="relative"
          data-cfg-section="signin"
          data-cfg-field="signinMethods"
        >
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="w-full flex items-center justify-center gap-1 py-2 text-[12px] text-text-muted hover:text-text-secondary transition-colors"
          >
            {t("auth.method.switchLabel")}
            <ChevronDown size={12} className={menuOpen ? "rotate-180 transition-transform" : "transition-transform"} />
          </button>
          {menuOpen && (
            <div className="absolute left-0 right-0 mt-1 rounded-lg border border-border bg-surface-1 p-1 shadow-[var(--shadow-elevated)] z-10">
              {orderedMethods.map((m) => {
                const isActive = m.name === active;
                return (
                  <button
                    key={m.name}
                    type="button"
                    onClick={() => {
                      setActive(m.name as MethodName);
                      setMenuOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-[13px] transition-colors ${
                      isActive ? "text-accent bg-accent-subtle" : "text-text-secondary hover:bg-surface-2"
                    }`}
                  >
                    {m.displayName}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
