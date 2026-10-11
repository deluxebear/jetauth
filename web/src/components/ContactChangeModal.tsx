import { useEffect, useState } from "react";
import { Mail, Phone } from "lucide-react";
import { useTranslation } from "../i18n";
import { useModal } from "./Modal";
import { postForm } from "../api/client";

interface Props {
  type: "email" | "phone";
  /** Application whose email / SMS provider sends the code. */
  applicationName: string;
  /** Required for phone: the user's country code (e.g. "CN"). */
  countryCode?: string;
  disabled?: boolean;
  onChanged: (value: string) => void;
}

interface ApiResult {
  status: string;
  msg?: string;
}

const RESEND_SECONDS = 60;

/**
 * Self-service email / phone change. The new address must be proven with a
 * code sent to it (method "reset") before /api/reset-email-or-phone writes it
 * and marks it verified — users cannot set these fields via update-user.
 */
export default function ContactChangeModal({ type, applicationName, countryCode, disabled, onChanged }: Props) {
  const { t } = useTranslation();
  const modal = useModal();
  const [open, setOpen] = useState(false);
  const [dest, setDest] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleOpen = () => {
    setDest("");
    setCode("");
    setSentTo("");
    setCountdown(0);
    setError("");
    setOpen(true);
  };

  const sendCode = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await postForm<ApiResult>("/api/send-verification-code", {
        applicationId: `admin/${applicationName}`,
        method: "reset",
        type,
        dest: dest.trim(),
        countryCode: type === "phone" ? (countryCode ?? "") : "",
        captchaType: "none",
      });
      if (res.status !== "ok") {
        setError(res.msg || t("users.contact.sendFailed"));
        return;
      }
      setSentTo(dest.trim());
      setCountdown(RESEND_SECONDS);
    } catch (e) {
      setError((e instanceof Error && e.message) || t("users.contact.sendFailed"));
    } finally {
      setLoading(false);
    }
  };

  const confirm = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await postForm<ApiResult>("/api/reset-email-or-phone", { type, dest: sentTo, code: code.trim() });
      if (res.status !== "ok") {
        setError(res.msg || t("users.contact.failed"));
        return;
      }
      modal.toast(t("users.contact.success"));
      onChanged(sentTo);
      setOpen(false);
    } catch (e) {
      setError((e instanceof Error && e.message) || t("users.contact.failed"));
    } finally {
      setLoading(false);
    }
  };

  const ic = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[13px] text-text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors";
  const Icon = type === "email" ? Mail : Phone;

  return (
    <>
      <button type="button" onClick={handleOpen} disabled={disabled}
        className="shrink-0 flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[13px] font-medium text-text-secondary hover:bg-surface-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
        <Icon size={14} />
        {t("users.contact.change")}
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => !loading && setOpen(false)} />
          <div role="dialog" aria-modal="true" aria-labelledby="contact-change-title"
            className="relative w-full max-w-md rounded-xl border border-border bg-surface-1 shadow-[var(--shadow-elevated)] p-6 space-y-4">
            <h2 id="contact-change-title" className="text-[16px] font-bold text-text-primary">
              {t(type === "email" ? "users.contact.titleEmail" : "users.contact.titlePhone")}
            </h2>

            {error && (
              <div role="alert" className="rounded-lg bg-danger/10 border border-danger/20 px-3 py-2 text-[13px] text-danger">{error}</div>
            )}

            <div>
              <label htmlFor="contact-change-dest" className="block text-[12px] font-medium text-text-secondary mb-1.5">
                {t(type === "email" ? "users.contact.newEmail" : "users.contact.newPhone")}
              </label>
              <div className="flex gap-2">
                <input id="contact-change-dest" type={type === "email" ? "email" : "tel"} value={dest}
                  onChange={(e) => { setDest(e.target.value); setSentTo(""); }} className={ic} />
                <button type="button" onClick={sendCode} disabled={loading || !dest.trim() || countdown > 0}
                  className="shrink-0 rounded-lg border border-border px-3 py-2 text-[13px] font-medium text-text-secondary hover:bg-surface-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  {countdown > 0 ? t("users.contact.resend").replace("{s}", String(countdown)) : t("users.contact.sendCode")}
                </button>
              </div>
            </div>

            {sentTo && (
              <div>
                <label htmlFor="contact-change-code" className="block text-[12px] font-medium text-text-secondary mb-1.5">
                  {t("users.contact.code")}
                </label>
                <input id="contact-change-code" inputMode="numeric" autoComplete="one-time-code" value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && code.trim() && confirm()}
                  className={ic} />
                <p className="text-[11px] text-text-muted mt-1">{t("users.contact.codeSentTo").replace("{dest}", sentTo)}</p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setOpen(false)} disabled={loading}
                className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-text-secondary hover:bg-surface-2 transition-colors">
                {t("common.cancel")}
              </button>
              <button type="button" onClick={confirm} disabled={loading || !sentTo || !code.trim()}
                className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors">
                {t("users.contact.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
