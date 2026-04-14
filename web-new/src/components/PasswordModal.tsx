import { useState } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { useTranslation } from "../i18n";
import { useModal } from "./Modal";
import * as UserBackend from "../backend/UserBackend";
import { obfuscatePassword } from "../utils/obfuscator";

interface Props {
  userOwner: string;
  userName: string;
  hasExistingPassword: boolean;
  isAdmin: boolean;
  disabled?: boolean;
}

export default function PasswordModal({
  userOwner, userName, hasExistingPassword, isAdmin, disabled,
}: Props) {
  const { t } = useTranslation();
  const modal = useModal();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");

  // Non-admin users must verify old password if one exists
  const needOldPassword = hasExistingPassword && !isAdmin;

  const handleOpen = () => {
    setOldPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError("");
    setShowOld(false);
    setShowNew(false);
    setShowConfirm(false);
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (!newPassword) {
      setError(t("password.error.empty" as any));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("password.error.mismatch" as any));
      return;
    }
    if (needOldPassword && !oldPassword) {
      setError(t("password.error.oldRequired" as any));
      return;
    }

    setLoading(true);
    setError("");
    try {
      const encOld = oldPassword ? obfuscatePassword(oldPassword) : "";
      const encNew = obfuscatePassword(newPassword);

      const res = await UserBackend.setPassword(userOwner, userName, encOld, encNew);
      if (res.status === "ok") {
        modal.toast(t("password.success" as any));
        setOpen(false);
      } else {
        setError(res.msg || t("password.error.failed" as any));
      }
    } catch (e: any) {
      setError(e.message || t("password.error.failed" as any));
    } finally {
      setLoading(false);
    }
  };

  const ic = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 pr-10 text-[13px] text-text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors";

  return (
    <>
      <button type="button" onClick={handleOpen} disabled={disabled}
        className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
        <KeyRound size={14} />
        {hasExistingPassword ? t("password.modify" as any) : t("password.set" as any)}
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => !loading && setOpen(false)} />
          <div className="relative w-full max-w-md rounded-xl border border-border bg-surface-1 shadow-[var(--shadow-elevated)] p-6 space-y-4">
            <h2 className="text-[16px] font-bold text-text-primary">{t("password.title" as any)}</h2>

            {error && (
              <div className="rounded-lg bg-danger/10 border border-danger/20 px-3 py-2 text-[13px] text-danger">{error}</div>
            )}

            {needOldPassword && (
              <div>
                <label className="block text-[12px] font-medium text-text-secondary mb-1.5">{t("password.old" as any)}</label>
                <div className="relative">
                  <input type={showOld ? "text" : "password"} value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} className={ic} placeholder={t("password.placeholder" as any)} />
                  <button type="button" onClick={() => setShowOld(!showOld)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary">
                    {showOld ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="block text-[12px] font-medium text-text-secondary mb-1.5">{t("password.new" as any)}</label>
              <div className="relative">
                <input type={showNew ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={ic} placeholder={t("password.placeholder" as any)} />
                <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary">
                  {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-text-secondary mb-1.5">{t("password.confirm" as any)}</label>
              <div className="relative">
                <input type={showConfirm ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && newPassword && confirmPassword && handleSubmit()}
                  className={`${ic} ${confirmPassword && confirmPassword !== newPassword ? "border-danger focus:border-danger focus:ring-danger/30" : ""}`}
                  placeholder={t("password.placeholder" as any)} />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary">
                  {showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {confirmPassword && confirmPassword !== newPassword && (
                <p className="text-[11px] text-danger mt-1">{t("password.error.mismatch" as any)}</p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setOpen(false)} disabled={loading}
                className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-text-secondary hover:bg-surface-2 transition-colors">
                {t("common.cancel" as any)}
              </button>
              <button type="button" onClick={handleSubmit} disabled={loading || !newPassword || !confirmPassword || (needOldPassword && !oldPassword)}
                className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors">
                {loading ? <span className="inline-block h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : t("password.submit" as any)}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
