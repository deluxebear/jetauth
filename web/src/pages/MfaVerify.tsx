import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, ArrowRight } from "lucide-react";
import { useTranslation } from "../i18n";
import { useTheme } from "../theme";

interface MfaProps {
  enabled: boolean;
  isPreferred: boolean;
  mfaType: string;
  secret: string;
  countryCode: string;
  url: string;
  recoveryCodes: string[];
  mfaRememberInHours: number;
}

interface MfaVerifyProps {
  mfaProps: MfaProps[];
  loginForm: {
    application: string;
    organization: string;
  };
  themeData?: any;
  orgBranding?: { logo?: string; logoDark?: string; displayName?: string } | null;
  onVerified: (response: any) => void;
  onError: (msg: string) => void;
}

const METHOD_LABELS: Record<string, string> = {
  app: "mfa.verify.methodApp",
  sms: "mfa.verify.methodSms",
  email: "mfa.verify.methodEmail",
};

export default function MfaVerify({ mfaProps, loginForm, themeData, orgBranding, onVerified, onError: _onError }: MfaVerifyProps) {
  const { t } = useTranslation();
  const { theme, applyOrgTheme, clearOrgTheme } = useTheme();
  const [selectedType, setSelectedType] = useState(mfaProps.find(p => p.isPreferred)?.mfaType || mfaProps[0]?.mfaType || "app");
  const [passcode, setPasscode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const rememberHours = mfaProps[0]?.mfaRememberInHours || 12;

  useEffect(() => {
    if (themeData?.isEnabled) applyOrgTheme(themeData);
    return () => clearOrgTheme();
  }, [themeData, applyOrgTheme, clearOrgTheme]);

  const orgLogo = (theme === "dark" && orgBranding?.logoDark) ? orgBranding.logoDark : orgBranding?.logo;

  const handleVerify = async () => {
    setError("");
    setLoading(true);
    try {
      const body: any = {
        application: loginForm.application,
        organization: loginForm.organization,
        type: "login",
      };
      if (useRecovery) {
        body.recoveryCode = recoveryCode;
      } else {
        body.passcode = passcode;
        body.mfaType = selectedType;
        body.enableMfaRemember = remember;
      }

      const res: any = await fetch("/api/login", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(r => r.json());

      if (res.status === "ok" && res.data !== "RequiredMfa" && res.data !== "NextMfa") {
        onVerified(res);
      } else {
        setError(res.msg || "Verification failed");
      }
    } catch (e: any) {
      setError(e.message || "Network error");
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "login-input w-full border border-border bg-surface-1 px-3.5 py-2.5 text-[14px] text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition-all";

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-0 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div className="flex justify-center mb-6">
          {orgLogo ? (
            <img src={orgLogo} alt="" className="h-12 max-w-[200px] object-contain" />
          ) : (
            <div className="h-12 w-12 rounded-xl bg-accent/15 border border-accent/20 flex items-center justify-center">
              <ShieldCheck size={24} className="text-accent" />
            </div>
          )}
        </div>

        <h2 className="text-xl font-bold text-center text-text-primary mb-1">{t("mfa.verify.title" as any)}</h2>
        <p className="text-[13px] text-center text-text-muted mb-6">{t("mfa.verify.subtitle" as any)}</p>

        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="login-card mb-4 border border-danger/30 bg-danger/10 px-4 py-2.5 text-[13px] text-danger">
            {error}
          </motion.div>
        )}

        {!useRecovery ? (
          <div className="space-y-4">
            {mfaProps.length > 1 && (
              <div>
                <label className="block text-[12px] font-medium text-text-secondary mb-1.5">{t("mfa.verify.method" as any)}</label>
                <select
                  value={selectedType}
                  onChange={(e) => { setSelectedType(e.target.value); setPasscode(""); }}
                  className={inputClass}
                >
                  {mfaProps.map(p => (
                    <option key={p.mfaType} value={p.mfaType}>{t(METHOD_LABELS[p.mfaType] as any || p.mfaType)}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-[12px] font-medium text-text-secondary mb-1.5">{t("mfa.verify.enterCode" as any)}</label>
              <input
                type="text"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className={`${inputClass} text-center text-lg font-mono tracking-[0.5em]`}
                placeholder="000000"
                maxLength={6}
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && passcode.length === 6 && handleVerify()}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="mfa-remember"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4 rounded border-border text-accent focus:ring-accent/30 cursor-pointer"
              />
              <label htmlFor="mfa-remember" className="text-[13px] text-text-secondary cursor-pointer">
                {t("mfa.verify.remember" as any)} ({rememberHours} {t("mfa.verify.rememberHours" as any)})
              </label>
            </div>

            <button
              onClick={handleVerify}
              disabled={loading || passcode.length !== 6}
              className="login-btn w-full flex items-center justify-center gap-2 bg-accent py-2.5 text-[14px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <>{t("mfa.verify.submit" as any)} <ArrowRight size={16} /></>}
            </button>

            <div className="text-center">
              <button onClick={() => setUseRecovery(true)} className="text-[12px] text-accent hover:underline">
                {t("mfa.verify.useRecovery" as any)}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-[12px] font-medium text-text-secondary mb-1.5">{t("mfa.verify.recoveryPlaceholder" as any)}</label>
              <input
                type="text"
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)}
                className={inputClass}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && recoveryCode && handleVerify()}
              />
            </div>

            <button
              onClick={handleVerify}
              disabled={loading || !recoveryCode}
              className="login-btn w-full flex items-center justify-center gap-2 bg-accent py-2.5 text-[14px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <>{t("mfa.verify.submit" as any)} <ArrowRight size={16} /></>}
            </button>

            <div className="text-center">
              <button onClick={() => setUseRecovery(false)} className="text-[12px] text-accent hover:underline">
                {t("mfa.verify.useCode" as any)}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
