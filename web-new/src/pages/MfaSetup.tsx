import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, Check, Copy, ArrowRight, Eye, EyeOff } from "lucide-react";
import QRCode from "qrcode";
import { useTranslation } from "../i18n";
import { useTheme } from "../theme";
import { postForm } from "../api/client";

interface MfaSetupProps {
  mfaType: string;
  owner: string;
  name: string;
  organization: string;
  application: string;
  encryptedPassword: string;
  themeData?: any;
  orgBranding?: { logo?: string; logoDark?: string; displayName?: string } | null;
  onComplete: () => void;
}

interface InitiateResponse {
  status: string;
  msg?: string;
  data?: {
    mfaType: string;
    secret: string;
    url: string;
    recoveryCodes: string[];
    mfaRememberInHours: number;
  };
}

export default function MfaSetup({
  mfaType, owner, name, organization, application,
  encryptedPassword, themeData, orgBranding, onComplete,
}: MfaSetupProps) {
  const { t } = useTranslation();
  const { theme, applyOrgTheme, clearOrgTheme } = useTheme();
  const [step, setStep] = useState(0);
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [secret, setSecret] = useState("");
  const [totpUrl, setTotpUrl] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  const [passcode, setPasscode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [copied, setCopied] = useState(false);

  // Only apply/clear theme in login flow (encryptedPassword present means login-triggered).
  // For logged-in users (from personal settings), Layout already handles the theme.
  const isLoginFlow = !!encryptedPassword;
  useEffect(() => {
    if (isLoginFlow && themeData?.isEnabled) applyOrgTheme(themeData);
    return () => { if (isLoginFlow) clearOrgTheme(); };
  }, [themeData, isLoginFlow, applyOrgTheme, clearOrgTheme]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const orgLogo = (theme === "dark" && orgBranding?.logoDark) ? orgBranding.logoDark : orgBranding?.logo;

  const handlePasswordVerify = async () => {
    setError("");
    setLoading(true);
    try {
      const loginRes: any = await fetch("/api/login", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          application, organization, username: name,
          password: encryptedPassword || password,
          signinMethod: "Password", type: "login",
        }),
      }).then(r => r.json());

      if (loginRes.status === "error") {
        setError(t("mfa.setup.passwordIncorrect" as any));
        return;
      }

      const res = await postForm<InitiateResponse>("/api/mfa/setup/initiate", {
        owner, name, mfaType,
      });

      if (res.status === "ok" && res.data) {
        setSecret(res.data.secret);
        setTotpUrl(res.data.url);
        setRecoveryCodes(res.data.recoveryCodes || []);

        if (mfaType === "app" && res.data.url) {
          const dataUrl = await QRCode.toDataURL(res.data.url, { width: 200, margin: 2 });
          setQrDataUrl(dataUrl);
        }
        setStep(1);
      } else {
        setError(res.msg || "MFA initiation failed");
      }
    } catch (e: any) {
      setError(e.message || "Network error");
    } finally {
      setLoading(false);
    }
  };

  const handleSendCode = async () => {
    try {
      const dest = secret;
      await postForm("/api/send-verification-code", {
        dest,
        type: mfaType === "sms" ? "phone" : "email",
        applicationId: `admin/${application}`,
        method: "mfa",
        countryCode: "",
        captchaType: "none",
        captchaToken: "",
        clientSecret: "",
      });
      setCodeSent(true);
      setCountdown(60);
    } catch (e: any) {
      setError(e.message || "Failed to send code");
    }
  };

  const handleVerifyCode = async () => {
    setError("");
    setLoading(true);
    try {
      const params: Record<string, string> = { passcode, mfaType };
      if (mfaType === "app") {
        params.secret = secret;
      } else {
        params.dest = secret;
        if (mfaType === "sms") params.countryCode = "";
      }

      const res: any = await postForm("/api/mfa/setup/verify", params);
      if (res.status === "ok") {
        setStep(2);
      } else {
        setError(res.msg || "Verification failed");
      }
    } catch (e: any) {
      setError(e.message || "Network error");
    } finally {
      setLoading(false);
    }
  };

  const handleEnable = async () => {
    setError("");
    setLoading(true);
    try {
      const params: Record<string, string> = {
        owner, name, mfaType,
        recoveryCodes: JSON.stringify(recoveryCodes),
      };
      if (mfaType === "app") {
        params.secret = secret;
      } else {
        params.dest = secret;
        if (mfaType === "sms") params.countryCode = "";
      }

      const res: any = await postForm("/api/mfa/setup/enable", params);
      if (res.status === "ok") {
        onComplete();
      } else {
        setError(res.msg || "Failed to enable MFA");
      }
    } catch (e: any) {
      setError(e.message || "Network error");
    } finally {
      setLoading(false);
    }
  };

  const handleCopySecret = () => {
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyRecovery = () => {
    navigator.clipboard.writeText(recoveryCodes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const steps = [
    t("mfa.setup.step.password" as any),
    t("mfa.setup.step.verify" as any),
    t("mfa.setup.step.enable" as any),
  ];

  const inputClass = "login-input w-full border border-border bg-surface-1 px-3.5 py-2.5 text-[14px] text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition-all";

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-0 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
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

        <h2 className="text-xl font-bold text-center text-text-primary mb-1">{t("mfa.setup.title" as any)}</h2>
        <p className="text-[13px] text-center text-text-muted mb-6">{t("mfa.setup.subtitle" as any)}</p>

        <div className="flex items-center justify-center gap-2 mb-8">
          {steps.map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`flex items-center justify-center h-7 w-7 rounded-full text-[11px] font-bold transition-colors ${
                i <= step ? "bg-accent text-white" : "bg-surface-3 text-text-muted"
              }`}>
                {i < step ? <Check size={14} /> : i + 1}
              </div>
              <span className={`text-[12px] font-medium ${i === step ? "text-text-primary" : "text-text-muted"}`}>{label}</span>
              {i < steps.length - 1 && <div className={`w-8 h-px ${i < step ? "bg-accent" : "bg-surface-3"}`} />}
            </div>
          ))}
        </div>

        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="login-card mb-4 border border-danger/30 bg-danger/10 px-4 py-2.5 text-[13px] text-danger">
            {error}
          </motion.div>
        )}

        {step === 0 && (
          <div className="space-y-4">
            <div>
              <label className="block text-[12px] font-medium text-text-secondary mb-1.5">{t("mfa.setup.enterPassword" as any)}</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputClass} pr-10`}
                  placeholder="••••••••"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && password && handlePasswordVerify()}
                />
                <button type="button" tabIndex={-1} onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button onClick={handlePasswordVerify} disabled={loading || !password} className="login-btn w-full flex items-center justify-center gap-2 bg-accent py-2.5 text-[14px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all">
              {loading ? <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <>{t("mfa.setup.next" as any)} <ArrowRight size={16} /></>}
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            {mfaType === "app" && (
              <>
                <p className="text-[13px] text-text-secondary">{t("mfa.setup.totpDesc" as any)}</p>
                {qrDataUrl && (
                  <div className="flex justify-center">
                    <div className="p-3 bg-white rounded-xl border border-border">
                      <img src={qrDataUrl} alt="QR Code" className="w-[180px] h-[180px]" />
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-text-muted">{t("mfa.setup.secretKey" as any)}:</span>
                  <code className="flex-1 text-[11px] font-mono text-text-secondary bg-surface-2 px-2 py-1 rounded truncate">{secret}</code>
                  <button onClick={handleCopySecret} className="shrink-0 text-[11px] text-accent hover:underline">
                    {copied ? t("mfa.setup.copied" as any) : t("mfa.setup.copySecret" as any)}
                  </button>
                </div>
              </>
            )}

            {mfaType === "sms" && (
              <>
                <p className="text-[13px] text-text-secondary">{t("mfa.setup.smsDesc" as any)}</p>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-text-primary font-mono">{secret}</span>
                  <button onClick={handleSendCode} disabled={countdown > 0} className="login-btn shrink-0 border border-accent bg-accent/10 px-3 py-1.5 text-[12px] font-semibold text-accent hover:bg-accent/20 disabled:opacity-50 transition-colors">
                    {countdown > 0 ? `${t("mfa.setup.codeSent" as any)} (${countdown}s)` : t("mfa.setup.sendCode" as any)}
                  </button>
                </div>
              </>
            )}

            {mfaType === "email" && (
              <>
                <p className="text-[13px] text-text-secondary">{t("mfa.setup.emailDesc" as any)}</p>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-text-primary font-mono">{secret}</span>
                  <button onClick={handleSendCode} disabled={countdown > 0} className="login-btn shrink-0 border border-accent bg-accent/10 px-3 py-1.5 text-[12px] font-semibold text-accent hover:bg-accent/20 disabled:opacity-50 transition-colors">
                    {countdown > 0 ? `${t("mfa.setup.codeSent" as any)} (${countdown}s)` : t("mfa.setup.sendCode" as any)}
                  </button>
                </div>
              </>
            )}

            <div>
              <label className="block text-[12px] font-medium text-text-secondary mb-1.5">{t("mfa.setup.enterCode" as any)}</label>
              <input
                type="text"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className={`${inputClass} text-center text-lg font-mono tracking-[0.5em]`}
                placeholder="000000"
                maxLength={6}
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && passcode.length === 6 && handleVerifyCode()}
              />
            </div>
            <button onClick={handleVerifyCode} disabled={loading || passcode.length !== 6} className="login-btn w-full flex items-center justify-center gap-2 bg-accent py-2.5 text-[14px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all">
              {loading ? <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <>{t("mfa.setup.verify" as any)} <ArrowRight size={16} /></>}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-accent mb-2">
              <Check size={18} />
              <span className="text-[14px] font-semibold">{t("mfa.setup.recoveryTitle" as any)}</span>
            </div>
            <p className="text-[13px] text-text-secondary">{t("mfa.setup.recoveryDesc" as any)}</p>

            <div className="relative">
              <div className="bg-surface-2 border border-border rounded-lg px-4 py-3 font-mono text-[14px] text-text-primary break-all">
                {recoveryCodes.join("\n")}
              </div>
              <button onClick={handleCopyRecovery} className="absolute top-2 right-2 p-1.5 rounded bg-surface-3 hover:bg-surface-4 text-text-muted hover:text-text-primary transition-colors">
                <Copy size={14} />
              </button>
            </div>

            <p className="text-[12px] text-warning font-medium">⚠ {t("mfa.setup.recoveryWarning" as any)}</p>

            <button onClick={handleEnable} disabled={loading} className="login-btn w-full flex items-center justify-center gap-2 bg-accent py-2.5 text-[14px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all">
              {loading ? <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <>{t("mfa.setup.confirmEnable" as any)} <ArrowRight size={16} /></>}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
