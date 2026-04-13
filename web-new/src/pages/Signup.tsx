import { useState, useEffect, type FormEvent } from "react";
import { useParams, useSearchParams, useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, ArrowRight, ShieldCheck, Sun, Moon, Globe } from "lucide-react";
import { useTranslation } from "../i18n";
import { useTheme } from "../theme";
import { api } from "../api/client";
import { COUNTRIES } from "../components/CountryCodeSelect";

interface SignupForm {
  username: string;
  displayName: string;
  password: string;
  confirm: string;
  email: string;
  emailCode: string;
  phone: string;
  phonePrefix: string;
  phoneCode: string;
  invitationCode: string;
  agreement: boolean;
}

interface Application {
  name: string;
  organization: string;
  logo: string;
  displayName: string;
  clientId: string;
  clientSecret: string;
  signupItems?: { name: string; visible: boolean; required: boolean; label?: string }[];
  termsOfUse?: string;
  [key: string]: unknown;
}

export default function Signup() {
  const { applicationName } = useParams<{ applicationName: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t, locale, setLocale, locales } = useTranslation();
  const { theme, toggle: toggleTheme } = useTheme();

  const [application, setApplication] = useState<Application | null>(null);
  const [appLoading, setAppLoading] = useState(true);
  const [appError, setAppError] = useState("");

  const [form, setForm] = useState<SignupForm>({
    username: "",
    displayName: "",
    password: "",
    confirm: "",
    email: "",
    emailCode: "",
    phone: "",
    phonePrefix: "1",
    phoneCode: "",
    invitationCode: searchParams.get("invitationCode") || "",
    agreement: false,
  });

  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof SignupForm, string>>>({});

  const [emailCountdown, setEmailCountdown] = useState(0);
  const [phoneCountdown, setPhoneCountdown] = useState(0);

  const appName = applicationName || "app-built-in";

  // Fetch application details
  useEffect(() => {
    setAppLoading(true);
    api
      .get<{ status: string; data: Application; msg?: string }>(
        `/api/get-application?id=admin/${appName}`
      )
      .then((res) => {
        if (res.status === "ok" && res.data) {
          setApplication(res.data);
        } else {
          setAppError(res.msg || "Failed to load application");
        }
      })
      .catch((e) => setAppError(e.message || "Network error"))
      .finally(() => setAppLoading(false));
  }, [appName]);

  // Countdown timers
  useEffect(() => {
    if (emailCountdown <= 0) return;
    const timer = setTimeout(() => setEmailCountdown(emailCountdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [emailCountdown]);

  useEffect(() => {
    if (phoneCountdown <= 0) return;
    const timer = setTimeout(() => setPhoneCountdown(phoneCountdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [phoneCountdown]);

  const updateField = <K extends keyof SignupForm>(key: K, value: SignupForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validate = (): boolean => {
    const errors: Partial<Record<keyof SignupForm, string>> = {};

    if (!form.username.trim()) errors.username = t("signup.fillRequired");
    if (!form.displayName.trim()) errors.displayName = t("signup.fillRequired");
    if (!form.password) errors.password = t("signup.fillRequired");
    if (!form.confirm) errors.confirm = t("signup.fillRequired");
    if (form.password && form.confirm && form.password !== form.confirm) {
      errors.confirm = t("signup.passwordMismatch");
    }
    if (!form.email.trim()) errors.email = t("signup.fillRequired");
    if (!form.agreement) errors.agreement = t("signup.fillRequired");

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const sendCode = async (type: "email" | "phone") => {
    if (!application) return;
    const dest = type === "email" ? form.email : form.phone;
    if (!dest.trim()) {
      setFieldErrors((prev) => ({
        ...prev,
        [type === "email" ? "email" : "phone"]: t("signup.fillRequired"),
      }));
      return;
    }

    try {
      const body = {
        dest,
        type,
        applicationId: `admin/${appName}`,
        method: "signup",
        countryCode: type === "phone" ? form.phonePrefix : undefined,
        captchaType: "none",
        captchaToken: "",
        clientSecret: application.clientSecret,
      };
      const res = await api.post<{ status: string; msg?: string }>(
        "/api/send-verification-code",
        body
      );
      if (res.status === "ok") {
        if (type === "email") setEmailCountdown(60);
        else setPhoneCountdown(60);
      } else {
        setError(res.msg || "Failed to send code");
      }
    } catch (e: any) {
      setError(e.message || "Network error");
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!validate()) return;
    if (!application) return;

    setLoading(true);
    try {
      const body = {
        application: appName,
        organization: application.organization,
        username: form.username,
        name: form.username,
        displayName: form.displayName,
        password: form.password,
        email: form.email,
        emailCode: form.emailCode,
        phone: form.phone,
        phonePrefix: form.phonePrefix,
        phoneCode: form.phoneCode,
        invitationCode: form.invitationCode,
        type: "signup",
      };

      const res = await api.post<{ status: string; msg?: string }>("/api/signup", body);
      if (res.status === "ok") {
        navigate("/login");
      } else {
        setError(res.msg || "Signup failed");
      }
    } catch (e: any) {
      setError(e.message || "Network error");
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "w-full rounded-lg border border-border bg-surface-1 px-3.5 py-2.5 text-[14px] text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition-all";
  const labelClass = "block text-[12px] font-medium text-text-secondary mb-1.5";
  const errorClass = "text-[11px] text-danger mt-1";

  // Loading state
  if (appLoading) {
    return (
      <div className="min-h-screen bg-surface-0 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
          <span className="text-[13px] text-text-muted font-mono">{t("common.loading")}</span>
        </div>
      </div>
    );
  }

  // App load error
  if (appError) {
    return (
      <div className="min-h-screen bg-surface-0 flex items-center justify-center">
        <div className="text-center">
          <p className="text-danger text-[14px] mb-4">{appError}</p>
          <Link to="/login" className="text-accent text-[13px] hover:underline">
            {t("signup.signInNow")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex relative bg-surface-0">
      {/* Top-right controls */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-1">
        <button
          onClick={toggleTheme}
          className="rounded-lg p-2 text-text-muted hover:text-text-secondary hover:bg-surface-2 transition-colors"
        >
          {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        <div className="relative group">
          <button className="flex items-center gap-1 rounded-lg p-2 text-text-muted hover:text-text-secondary hover:bg-surface-2 transition-colors">
            <Globe size={17} />
            <span className="text-[11px] font-mono font-medium uppercase">{locale}</span>
          </button>
          <div className="invisible group-hover:visible absolute right-0 top-full mt-1 w-36 rounded-lg border border-border bg-surface-2 py-1 shadow-[var(--shadow-elevated)]">
            {locales.map((l) => (
              <button
                key={l.value}
                onClick={() => setLocale(l.value)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-[13px] transition-colors ${
                  locale === l.value
                    ? "text-accent bg-accent-subtle"
                    : "text-text-secondary hover:bg-surface-3"
                }`}
              >
                <span className="font-mono text-[11px] font-bold uppercase w-5">{l.value}</span>
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Left panel -- branding */}
      <div className="hidden lg:flex lg:w-[45%] relative bg-surface-1 items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-dot-grid opacity-40" />
        <div className="absolute top-1/4 left-1/3 h-72 w-72 rounded-full blur-[100px]" style={{ background: "var(--gradient-from)", opacity: 0.08 }} />
        <div className="absolute bottom-1/3 right-1/4 h-56 w-56 rounded-full blur-[80px]" style={{ background: "var(--gradient-blob)", opacity: 0.06 }} />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="relative z-10 max-w-md px-12"
        >
          <div className="flex items-center gap-3 mb-10">
            {application?.logo ? (
              <img src={application.logo} alt="Logo" className="h-11 w-11 rounded-xl object-contain" />
            ) : (
              <div className="h-11 w-11 rounded-xl bg-accent/15 border border-accent/20 flex items-center justify-center">
                <ShieldCheck size={22} className="text-accent" />
              </div>
            )}
            <div>
              <div className="text-lg font-bold tracking-tight text-text-primary">
                {application?.displayName || t("login.brand.title")}
              </div>
              <div className="text-[11px] font-mono text-text-muted tracking-wider uppercase">
                {t("login.brand.subtitle")}
              </div>
            </div>
          </div>

          <h1 className="text-[40px] font-bold leading-[1.1] tracking-tight text-text-primary mb-5">
            {t("signup.brandHeading1")}
            <br />
            <span className="text-transparent bg-clip-text" style={{ backgroundImage: `linear-gradient(to right, var(--gradient-from), var(--gradient-to))` }}>
              {t("signup.brandHeading2")}
            </span>
          </h1>

          <p className="text-[15px] leading-relaxed text-text-secondary mb-10">
            {t("signup.brandDescription")}
          </p>

          <div className="flex flex-wrap gap-2">
            {["SSO", "OAuth 2.0", "OIDC", "SAML", "LDAP", "RBAC"].map((tag, i) => (
              <motion.span
                key={tag}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4 + i * 0.08, duration: 0.3 }}
                className="rounded-full border border-border bg-surface-2/60 px-3 py-1 text-[11px] font-mono font-medium text-text-muted"
              >
                {tag}
              </motion.span>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Right panel -- form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="w-full max-w-sm"
        >
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            {application?.logo ? (
              <img src={application.logo} alt="Logo" className="h-9 w-9 rounded-lg object-contain" />
            ) : (
              <div className="h-9 w-9 rounded-lg bg-accent/15 flex items-center justify-center">
                <ShieldCheck size={18} className="text-accent" />
              </div>
            )}
            <span className="text-base font-bold tracking-tight">
              {application?.displayName || t("login.brand.title")}
            </span>
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-text-primary mb-1">
            {t("signup.title")}
          </h2>
          <p className="text-[13px] text-text-muted mb-6">{t("signup.subtitle")}</p>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-5 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-[13px] text-danger"
            >
              {error}
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {/* Username */}
            <div>
              <label className={labelClass}>
                {t("signup.username")} <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => updateField("username", e.target.value)}
                autoComplete="username"
                autoFocus
                className={inputClass}
                placeholder={t("signup.username")}
              />
              {fieldErrors.username && <p className={errorClass}>{fieldErrors.username}</p>}
            </div>

            {/* Display Name */}
            <div>
              <label className={labelClass}>
                {t("signup.displayName")} <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={form.displayName}
                onChange={(e) => updateField("displayName", e.target.value)}
                className={inputClass}
                placeholder={t("signup.displayName")}
              />
              {fieldErrors.displayName && <p className={errorClass}>{fieldErrors.displayName}</p>}
            </div>

            {/* Password */}
            <div>
              <label className={labelClass}>
                {t("signup.password")} <span className="text-danger">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => updateField("password", e.target.value)}
                  autoComplete="new-password"
                  className={`${inputClass} pr-10`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {fieldErrors.password && <p className={errorClass}>{fieldErrors.password}</p>}
            </div>

            {/* Confirm Password */}
            <div>
              <label className={labelClass}>
                {t("signup.confirm")} <span className="text-danger">*</span>
              </label>
              <div className="relative">
                <input
                  type={showConfirm ? "text" : "password"}
                  value={form.confirm}
                  onChange={(e) => updateField("confirm", e.target.value)}
                  autoComplete="new-password"
                  className={`${inputClass} pr-10`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {fieldErrors.confirm && <p className={errorClass}>{fieldErrors.confirm}</p>}
            </div>

            {/* Email */}
            <div>
              <label className={labelClass}>
                {t("signup.email")} <span className="text-danger">*</span>
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => updateField("email", e.target.value)}
                autoComplete="email"
                className={inputClass}
                placeholder="user@example.com"
              />
              {fieldErrors.email && <p className={errorClass}>{fieldErrors.email}</p>}
            </div>

            {/* Email Code */}
            <div>
              <label className={labelClass}>{t("signup.emailCode")}</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.emailCode}
                  onChange={(e) => updateField("emailCode", e.target.value)}
                  className={`${inputClass} flex-1`}
                  placeholder={t("signup.emailCode")}
                />
                <button
                  type="button"
                  disabled={emailCountdown > 0 || !form.email.trim()}
                  onClick={() => sendCode("email")}
                  className="shrink-0 rounded-lg border border-accent bg-accent/10 px-3 py-2.5 text-[12px] font-semibold text-accent hover:bg-accent/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {emailCountdown > 0
                    ? `${t("signup.codeSent")} (${emailCountdown}s)`
                    : t("signup.sendCode")}
                </button>
              </div>
            </div>

            {/* Phone */}
            <div>
              <label className={labelClass}>{t("signup.phone")}</label>
              <div className="flex gap-2">
                <select
                  value={form.phonePrefix}
                  onChange={(e) => updateField("phonePrefix", e.target.value)}
                  className="shrink-0 w-[110px] rounded-lg border border-border bg-surface-1 px-2 py-2.5 text-[13px] text-text-primary focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition-all"
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.phone.replace("+", "")}>
                      {c.flag} {c.phone}
                    </option>
                  ))}
                </select>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => updateField("phone", e.target.value)}
                  className={`${inputClass} flex-1`}
                  placeholder={t("signup.phone")}
                />
              </div>
              {fieldErrors.phone && <p className={errorClass}>{fieldErrors.phone}</p>}
            </div>

            {/* Phone Code */}
            <div>
              <label className={labelClass}>{t("signup.phoneCode")}</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.phoneCode}
                  onChange={(e) => updateField("phoneCode", e.target.value)}
                  className={`${inputClass} flex-1`}
                  placeholder={t("signup.phoneCode")}
                />
                <button
                  type="button"
                  disabled={phoneCountdown > 0 || !form.phone.trim()}
                  onClick={() => sendCode("phone")}
                  className="shrink-0 rounded-lg border border-accent bg-accent/10 px-3 py-2.5 text-[12px] font-semibold text-accent hover:bg-accent/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {phoneCountdown > 0
                    ? `${t("signup.codeSent")} (${phoneCountdown}s)`
                    : t("signup.sendCode")}
                </button>
              </div>
            </div>

            {/* Invitation Code (shown if present in URL) */}
            {form.invitationCode && (
              <div>
                <label className={labelClass}>{t("signup.invitationCode")}</label>
                <input
                  type="text"
                  value={form.invitationCode}
                  readOnly
                  className={`${inputClass} bg-surface-2 text-text-muted cursor-not-allowed`}
                />
              </div>
            )}

            {/* Terms of Use */}
            <div className="flex items-start gap-2 pt-1">
              <input
                type="checkbox"
                id="agreement"
                checked={form.agreement}
                onChange={(e) => updateField("agreement", e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-border text-accent focus:ring-accent/30 cursor-pointer"
              />
              <label htmlFor="agreement" className="text-[13px] text-text-secondary cursor-pointer">
                {t("signup.agreement")}{" "}
                {application?.termsOfUse ? (
                  <a
                    href={application.termsOfUse}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    {t("signup.termsOfUse")}
                  </a>
                ) : (
                  <span className="text-accent">{t("signup.termsOfUse")}</span>
                )}
              </label>
            </div>
            {fieldErrors.agreement && <p className={errorClass}>{fieldErrors.agreement}</p>}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="group w-full flex items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-[14px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 mt-2"
            >
              {loading ? (
                <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                <>
                  {t("signup.submit")}
                  <ArrowRight
                    size={16}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </>
              )}
            </button>
          </form>

          {/* Sign in link */}
          <p className="mt-6 text-center text-[13px] text-text-muted">
            {t("signup.haveAccount")}{" "}
            <Link to="/login" className="text-accent font-medium hover:underline">
              {t("signup.signInNow")}
            </Link>
          </p>

          <p className="mt-8 text-center text-[11px] text-text-muted">
            {t("common.poweredBy")}{" "}
            <span className="font-mono font-medium text-text-secondary">JetAuth</span>{" "}
            &middot; {t("common.openSourceIAM")}
          </p>
        </motion.div>
      </div>
    </div>
  );
}
