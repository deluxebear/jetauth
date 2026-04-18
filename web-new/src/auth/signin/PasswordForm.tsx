import { useState, type FormEvent } from "react";
import { Eye, EyeOff, ArrowLeft, ArrowRight } from "lucide-react";
import { useTranslation } from "../../i18n";

interface PasswordFormProps {
  identifier: string;
  userHint?: string;
  onSubmit: (password: string) => Promise<void>;
  onBack: () => void;
  error?: string;
}

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
}: PasswordFormProps) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const display = userHint && userHint.length > 0 ? userHint : identifier;
  const canSubmit = password.length > 0 && !loading;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    try {
      await onSubmit(password);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2">
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

      <button
        type="submit"
        disabled={!canSubmit}
        className="group w-full flex items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-[14px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
      >
        {loading ? (
          <>
            <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            {t("auth.password.submitButton")}
          </>
        ) : (
          <>
            {t("auth.password.submitButton")}
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </>
        )}
      </button>
    </form>
  );
}
