import { useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "../../i18n";

interface IdentifierStepProps {
  onSubmit: (identifier: string) => Promise<void>;
  error?: string;
  /**
   * Optional admin-configured placeholder override (from signinItems
   * entry whose name === "Username"). Falls back to the i18n default.
   */
  placeholder?: string;
  /**
   * Admin override for the submit button label. Signin uses "Continue",
   * forget-password passes the "Send code button" label.
   */
  submitLabel?: string;
  /**
   * data-signinitem attribute value for the submit button — lets the
   * admin's per-item customCss reach this shared button. Signin passes
   * nothing (button styled via the enclosing "username" scope); forget
   * passes "send-code-button" so that row's CSS targets it.
   */
  submitItemName?: string;
}

/**
 * Step 1 of identifier-first signin. Collects a single identifier
 * (username / email / phone), trims it, and hands off to the parent.
 */
export default function IdentifierStep({ onSubmit, error, placeholder, submitLabel, submitItemName }: IdentifierStepProps) {
  const { t } = useTranslation();
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);

  const trimmed = identifier.trim();
  const canSubmit = trimmed.length > 0 && !loading;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    try {
      await onSubmit(trimmed);
    } finally {
      setLoading(false);
    }
  };

  const resolvedPlaceholder = placeholder && placeholder.length > 0
    ? placeholder
    : t("auth.identifier.placeholder");

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-[13px] text-danger">
          {error}
        </div>
      )}
      <div>
        <input
          type="text"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoComplete="username"
          autoFocus
          aria-label={resolvedPlaceholder}
          placeholder={resolvedPlaceholder}
          className="w-full rounded-lg border border-border bg-surface-1 px-3.5 py-2.5 text-[14px] text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition-all"
        />
      </div>
      <button
        type="submit"
        disabled={!canSubmit}
        data-cfg-section="branding"
        data-cfg-field="colorPrimary"
        {...(submitItemName ? { "data-signinitem": submitItemName } : {})}
        className="group w-full flex items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-[14px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
      >
        {loading ? (
          <>
            <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            {submitLabel || t("auth.identifier.continueButton")}
          </>
        ) : (
          <>
            {submitLabel || t("auth.identifier.continueButton")}
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </>
        )}
      </button>
    </form>
  );
}
