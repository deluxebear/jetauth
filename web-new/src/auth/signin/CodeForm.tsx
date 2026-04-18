import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Send } from "lucide-react";
import { useTranslation } from "../../i18n";
import { api } from "../../api/client";

interface CodeFormProps {
  identifier: string;
  /** "email" or "phone" — picks the correct send channel and keyboard. */
  destType: "email" | "phone";
  /** The actual email / phone to receive the code. Display-safe (masked OK). */
  destValue: string;
  application: string;
  organization: string;
  onSubmit: (code: string) => Promise<void>;
  onBack?: () => void;
  error?: string;
}

const COUNTDOWN_SECONDS = 60;

/**
 * Verification-code signin step. Two phases:
 *   1. "send"    — user clicks to send a code to their email/phone
 *   2. "verify"  — user enters the 6-digit code and submits
 *
 * Owned by the SigninPage / ClassicSigninPage orchestrator; this component
 * is pure and does not call /api/login itself — it hands the verified code
 * to the parent via onSubmit.
 */
export default function CodeForm({
  identifier,
  destType,
  destValue,
  application,
  organization,
  onSubmit,
  onBack,
  error: externalError,
}: CodeFormProps) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<"send" | "verify">("send");
  const [code, setCode] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sendError, setSendError] = useState("");

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const sendCode = async () => {
    setSendError("");
    setSending(true);
    try {
      await api.post("/api/send-verification-code", {
        applicationId: `admin/${application}`,
        organizationId: `admin/${organization}`,
        method: "login",
        type: destType,
        dest: destValue,
        checkUser: identifier,
      });
      setPhase("verify");
      setCountdown(COUNTDOWN_SECONDS);
    } catch (e: unknown) {
      setSendError((e as Error).message || t("auth.code.sendError"));
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== 6 || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(code);
    } finally {
      setSubmitting(false);
    }
  };

  const sendLabel = t(destType === "email" ? "auth.code.sendToEmail" : "auth.code.sendToPhone")
    .replace(destType === "email" ? "{email}" : "{phone}", destValue);

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
        <span className="truncate text-[13px] text-text-secondary">{destValue}</span>
      </div>

      {(externalError || sendError) && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-[13px] text-danger">
          {externalError || sendError}
        </div>
      )}

      {phase === "send" && (
        <button
          type="button"
          onClick={sendCode}
          disabled={sending}
          className="group w-full flex items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-[14px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
        >
          {sending ? (
            <>
              <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              {sendLabel}
            </>
          ) : (
            <>
              <Send size={16} />
              {sendLabel}
            </>
          )}
        </button>
      )}

      {phase === "verify" && (
        <>
          <div>
            <label className="block text-[12px] font-medium text-text-secondary mb-1.5">
              {t("auth.code.codeLabel")}
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              autoFocus
              autoComplete="one-time-code"
              placeholder={t("auth.code.codePlaceholder")}
              className="w-full rounded-lg border border-border bg-surface-1 px-3.5 py-2.5 text-[14px] tracking-[0.3em] text-center text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={code.length !== 6 || submitting}
            className="group w-full flex items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-[14px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            {submitting ? (
              <>
                <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                {t("auth.code.submit")}
              </>
            ) : (
              <>
                {t("auth.code.submit")}
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>

          <button
            type="button"
            onClick={sendCode}
            disabled={countdown > 0 || sending}
            aria-label={countdown > 0
              ? t("auth.code.resend").replace("{seconds}", String(countdown))
              : t("auth.code.resendReady")}
            className="w-full py-2 text-center text-[12px] text-text-muted hover:text-text-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {countdown > 0
              ? t("auth.code.resend").replace("{seconds}", String(countdown))
              : t("auth.code.resendReady")}
          </button>
        </>
      )}
    </form>
  );
}
