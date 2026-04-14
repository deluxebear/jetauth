import { useState, useEffect, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, ArrowRight, ShieldCheck, Sun, Moon, Globe } from "lucide-react";
import { useTranslation } from "../i18n";
import { useTheme } from "../theme";

interface OrgBranding {
  logo?: string;
  logoDark?: string;
  favicon?: string;
  displayName?: string;
}

interface LoginProps {
  onLogin: (username: string, password: string, organization: string) => Promise<void>;
  error?: string;
  themeData?: { themeType: string; colorPrimary: string; borderRadius: number; isCompact: boolean; isEnabled: boolean } | null;
  orgBranding?: OrgBranding | null;
  onOrganizationChange?: (org: string) => void;
}

export default function Login({ onLogin, error, themeData, orgBranding, onOrganizationChange }: LoginProps) {
  const { organizationName } = useParams<{ organizationName: string }>();
  const organization = organizationName || "built-in";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const { t, locale, setLocale, locales } = useTranslation();
  const { theme, toggle: toggleTheme, applyOrgTheme, clearOrgTheme } = useTheme();

  // Notify parent when organization changes (from route param)
  useEffect(() => {
    onOrganizationChange?.(organization);
  }, [organization, onOrganizationChange]);

  useEffect(() => {
    if (themeData?.isEnabled) {
      applyOrgTheme(themeData);
    }
    return () => clearOrgTheme();
  }, [themeData, applyOrgTheme, clearOrgTheme]);

  // Apply org favicon and title on login page
  useEffect(() => {
    if (orgBranding?.favicon) {
      let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = orgBranding.favicon;
    }
    if (orgBranding?.displayName) {
      document.title = orgBranding.displayName;
    }
  }, [orgBranding]);

  // Resolve branding: use org logo (dark variant if in dark mode), fallback to defaults
  const orgLogo = (theme === "dark" && orgBranding?.logoDark) ? orgBranding.logoDark : orgBranding?.logo;
  const orgName = orgBranding?.displayName || t("login.brand.title");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onLogin(username, password, organization);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex relative" data-compact={themeData?.isCompact ? "true" : undefined}>
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

      {/* Left panel — branding */}
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
            {orgLogo ? (
              <img src={orgLogo} alt="" className="h-16 max-w-[280px] object-contain" />
            ) : (
              <>
                <div className="h-11 w-11 rounded-xl bg-accent/15 border border-accent/20 flex items-center justify-center">
                  <ShieldCheck size={22} className="text-accent" />
                </div>
                <div>
                  <div className="text-lg font-bold tracking-tight text-text-primary">
                    {orgName}
                  </div>
                  <div className="text-[11px] font-mono text-text-muted tracking-wider uppercase">
                    {t("login.brand.subtitle")}
                  </div>
                </div>
              </>
            )}
          </div>

          <h1 className="text-[40px] font-bold leading-[1.1] tracking-tight text-text-primary mb-5">
            {t("login.brand.heading1")}
            <br />
            {t("login.brand.heading2")}{" "}
            <span className="text-transparent bg-clip-text" style={{ backgroundImage: `linear-gradient(to right, var(--gradient-from), var(--gradient-to))` }}>
              {t("login.brand.heading3")}
            </span>
          </h1>

          <p className="text-[15px] leading-relaxed text-text-secondary mb-10">
            {t("login.brand.description")}
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

          <div className="mt-16 flex items-center gap-3">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
            <span className="text-[10px] font-mono text-text-muted">
              {t("login.brand.secure")}
            </span>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
          </div>
        </motion.div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center bg-surface-0 px-6">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="w-full max-w-sm"
        >
          <div className="lg:hidden flex items-center gap-2 mb-10">
            {orgLogo ? (
              <img src={orgLogo} alt="" className="h-9 max-w-[160px] object-contain" />
            ) : (
              <>
                <div className="h-9 w-9 rounded-lg bg-accent/15 flex items-center justify-center">
                  <ShieldCheck size={18} className="text-accent" />
                </div>
                <span className="text-base font-bold tracking-tight">{orgName}</span>
              </>
            )}
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-text-primary mb-1">
            {t("login.title")}
          </h2>
          <p className="text-[13px] text-text-muted mb-8">{t("login.subtitle")}</p>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="login-card mb-5 border border-danger/30 bg-danger/10 px-4 py-2.5 text-[13px] text-danger"
            >
              {error}
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="login-form space-y-4">
            <div>
              <label className="block text-[12px] font-medium text-text-secondary mb-1.5">
                {t("login.username")}
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                required
                className="login-input w-full border border-border bg-surface-1 px-3.5 py-2.5 text-[14px] text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition-all"
                placeholder="admin"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-text-secondary mb-1.5">
                {t("login.password")}
              </label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="login-input w-full border border-border bg-surface-1 px-3.5 py-2.5 pr-10 text-[14px] text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition-all"
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
            </div>

            <button
              type="submit"
              disabled={loading || !username || !password}
              className="login-btn group w-full flex items-center justify-center gap-2 bg-accent py-2.5 text-[14px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 mt-2"
            >
              {loading ? (
                <>
                  <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  {t("login.submitting" as any)}
                </>
              ) : (
                <>
                  {t("login.submit")}
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[11px] text-text-muted">{t("common.or")}</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {[
              { name: "GitHub", icon: "GH" },
              { name: "Google", icon: "G" },
              { name: "SAML", icon: "S" },
            ].map((p) => (
              <button
                key={p.name}
                className="login-card flex items-center justify-center gap-1.5 border border-border bg-surface-1 py-2 text-[12px] font-medium text-text-secondary hover:bg-surface-2 hover:text-text-primary transition-colors"
              >
                <span className="font-mono text-[11px] font-bold text-text-muted">{p.icon}</span>
                {p.name}
              </button>
            ))}
          </div>

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
