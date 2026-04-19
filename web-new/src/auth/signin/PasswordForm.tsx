import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, ArrowLeft, ArrowRight } from "lucide-react";
import { useTranslation } from "../../i18n";
import { useModal } from "../../components/Modal";
import { MarkdownLinks } from "../items/MarkdownLinks";

interface PasswordFormProps {
  identifier: string;
  userHint?: string;
  onSubmit: (password: string, extras?: { autoSignin?: boolean }) => Promise<void>;
  onBack?: () => void;
  error?: string;
  forgotPasswordHref?: string;
  /** When false, suppresses the "Forgot password?" link. Default true. */
  showForgot?: boolean;
  /** Admin override label for the "Forgot password?" link. */
  forgotLabel?: string;
  /** Admin override label for the primary submit button. */
  submitLabel?: string;
  /** Render the agreement checkbox above the submit button. */
  showAgreement?: boolean;
  /** Label for the agreement checkbox (admin override or i18n fallback). */
  agreementLabel?: string;
  /** If true, submit is disabled until the checkbox is checked. */
  agreementRequired?: boolean;
  /** Render the captcha placeholder slot above the submit button. */
  showCaptcha?: boolean;
  /** Text inside the captcha placeholder box. */
  captchaPlaceholder?: string;
  /** Render the "Remember me" / auto sign in checkbox above submit. */
  showRememberMe?: boolean;
  /** Label for the remember-me checkbox. */
  rememberLabel?: string;
}

const REMEMBER_ME_KEY = "jetauth.rememberMe";

/**
 * Password-entry step of the identifier-first flow. Shows the resolved
 * identifier (or masked hint), accepts the password, and hands it to the
 * parent for the actual /api/login call.
 */
export default function PasswordForm({
  identifier,
  userHint,
  onSubmit,
  onBack,
  error,
  forgotPasswordHref,
  showForgot = true,
  forgotLabel,
  submitLabel,
  showAgreement = false,
  agreementLabel,
  agreementRequired = false,
  showCaptcha = false,
  captchaPlaceholder,
  showRememberMe = false,
  rememberLabel,
}: PasswordFormProps) {
  const { t } = useTranslation();
  const modal = useModal();
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [rememberMe, setRememberMe] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(REMEMBER_ME_KEY) === "1";
    } catch {
      return false;
    }
  });

  // Persist remember-me choice across sessions so the box is pre-checked on return.
  useEffect(() => {
    if (!showRememberMe || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(REMEMBER_ME_KEY, rememberMe ? "1" : "0");
    } catch {
      /* storage disabled — silently ignore */
    }
  }, [rememberMe, showRememberMe]);

  const display = userHint && userHint.length > 0 ? userHint : identifier;
  const needsAgreement = showAgreement && agreementRequired && !agreed;
  const canSubmit = password.length > 0 && !loading;

  const runSubmit = async () => {
    setLoading(true);
    try {
      await onSubmit(password, showRememberMe ? { autoSignin: rememberMe } : undefined);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    // Chinese "弹窗派" pattern: if the agreement is required but unchecked,
    // pop a confirm modal restating the terms with clickable links. Confirming
    // in the modal auto-checks the box and proceeds — cancelling just closes.
    if (needsAgreement) {
      modal.showConfirm(
        <>
          <p className="mb-2">{t("auth.agreement.confirmIntro")}</p>
          <MarkdownLinks text={resolvedAgreementLabel} className="block" />
        </>,
        () => {
          setAgreed(true);
          void runSubmit();
        },
        t("auth.agreement.confirmTitle"),
      );
      return;
    }
    await runSubmit();
  };

  const resolvedSubmitLabel = submitLabel && submitLabel.length > 0
    ? submitLabel
    : t("auth.password.submitButton");
  const resolvedForgotLabel = forgotLabel && forgotLabel.length > 0
    ? forgotLabel
    : t("auth.password.forgotLink");
  const resolvedAgreementLabel = agreementLabel && agreementLabel.length > 0
    ? agreementLabel
    : t("auth.agreement.label");
  const resolvedRememberLabel = rememberLabel && rememberLabel.length > 0
    ? rememberLabel
    : t("auth.rememberMe");
  const resolvedCaptchaLabel = captchaPlaceholder && captchaPlaceholder.length > 0
    ? captchaPlaceholder
    : t("auth.captcha.placeholder");

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-[13px] text-danger">
          {error}
        </div>
      )}

      <div>
        <label className="block text-[12px] font-medium text-text-secondary mb-1.5">
          {t("auth.password.label")}
        </label>
        <div className="relative">
          <input
            type={showPw ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            autoFocus
            required
            placeholder={t("auth.password.placeholder")}
            className="w-full border border-border bg-surface-1 px-3.5 py-2.5 pr-10 text-[14px] text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition-all rounded-lg"
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPw(!showPw)}
            aria-label={showPw ? t("auth.password.hidePassword") : t("auth.password.showPassword")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
          >
            {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      {showForgot && forgotPasswordHref && (
        <div className="text-right" data-signinitem="forgot-password?">
          <a href={forgotPasswordHref} className="text-[12px] text-accent hover:underline">
            {resolvedForgotLabel}
          </a>
        </div>
      )}

      {showRememberMe && (
        <label
          className="flex items-center gap-2 text-[12px] text-text-secondary cursor-pointer select-none"
          data-signinitem="auto-sign-in"
        >
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-border text-accent focus:ring-accent/30"
          />
          {resolvedRememberLabel}
        </label>
      )}

      {showAgreement && (
        <label
          className="flex items-start gap-2 text-[12px] text-text-secondary cursor-pointer select-none"
          data-signinitem="agreement"
        >
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 rounded border-border text-accent focus:ring-accent/30"
          />
          <MarkdownLinks text={resolvedAgreementLabel} />
        </label>
      )}

      {showCaptcha && (
        <div
          className="captcha-slot border border-dashed border-border rounded p-4 text-center text-[12px] text-text-muted"
          data-signinitem="captcha"
        >
          {resolvedCaptchaLabel}
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        data-cfg-section="branding"
        data-cfg-field="colorPrimary"
        data-signinitem="login-button"
        className="group w-full flex items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-[14px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
      >
        {loading ? (
          <>
            <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            {resolvedSubmitLabel}
          </>
        ) : (
          <>
            {resolvedSubmitLabel}
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </>
        )}
      </button>
    </form>
  );
}
