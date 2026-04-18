import { useState, type FormEvent } from "react";
import { Eye, EyeOff, ArrowRight, ArrowLeft, CheckCircle } from "lucide-react";
import { useTheme } from "../../theme";
import { useTranslation } from "../../i18n";
import { api } from "../../api/client";
import BrandingLayer from "../shell/BrandingLayer";
import TopBar from "../shell/TopBar";
import IdentifierStep from "./IdentifierStep";
import { resolveSigninMethods } from "../api/resolveSigninMethods";
import type { AuthApplication } from "../api/types";

type Phase = "identifier" | "code" | "password" | "done";

interface Props {
  application: AuthApplication;
}

export default function ForgotPasswordPage({ application }: Props) {
  const { theme } = useTheme();
  const { t } = useTranslation();

  const [phase, setPhase] = useState<Phase>("identifier");
  const [identifier, setIdentifier] = useState("");
  const [destType, setDestType] = useState<"email" | "phone">("email");
  const [destValue, setDestValue] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const orgName =
    application.organizationObj?.name ?? application.organization ?? "built-in";
  const orgDisplay =
    application.organizationObj?.displayName ??
    application.displayName ??
    application.name;
  const orgLogo =
    theme === "dark" && application.organizationObj?.logoDark
      ? application.organizationObj.logoDark
      : application.organizationObj?.logo ?? application.logo;

  const handleIdentifierSubmit = async (v: string) => {
    setError("");
    try {
      const payload = await resolveSigninMethods({
        application: application.name,
        organization: orgName,
        identifier: v,
      });
      setIdentifier(v);
      // userHint is masked; we need a non-masked dest for sending the code.
      // The caller flow: resolveSigninMethods returns masked hint; send-code
      // accepts the identifier and re-resolves server-side, so we pass the
      // identifier as the dest. If destType can't be inferred, default to email.
      if (payload.userHint && payload.userHint.includes("@")) {
        setDestType("email");
      } else if (payload.userHint) {
        setDestType("phone");
      }
      setDestValue(v); // backend looks up the user by identifier anyway
      // Trigger the code send immediately.
      await api.post("/api/send-verification-code", {
        applicationId: `admin/${application.name}`,
        organizationId: `admin/${orgName}`,
        method: "forget",
        type: payload.userHint.includes("@") ? "email" : "phone",
        dest: v,
        checkUser: v,
      });
      setPhase("code");
    } catch (e: unknown) {
      setError((e as Error).message || "failed");
    }
  };

  const handleCodeSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return;
    setError("");
    setPhase("password");
  };

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError(t("auth.forgot.mismatch"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await api.post<{ status: string; msg?: string }>(
        "/api/set-password",
        {
          userOwner: orgName,
          userName: identifier,
          newPassword: password,
          code,
          dest: destValue,
          type: destType,
        }
      );
      if (res.status !== "ok") {
        setError(res.msg || "failed");
        setLoading(false);
        return;
      }
      setPhase("done");
    } catch (err: unknown) {
      setError((err as Error).message || "network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex relative">
      <TopBar />
      <div className="w-full flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm">
          <div className="mb-10">
            <BrandingLayer
              logo={orgLogo}
              logoDark={application.organizationObj?.logoDark}
              favicon={application.organizationObj?.favicon ?? application.favicon}
              displayName={orgDisplay}
              theme={theme}
            />
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-text-primary mb-1">
            {t("auth.forgot.title")}
          </h1>
          <p className="text-[13px] text-text-muted mb-8">
            {phase === "done" ? t("auth.forgot.success") : t("auth.forgot.subtitle")}
          </p>

          {error && (
            <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-[13px] text-danger">
              {error}
            </div>
          )}

          {phase === "identifier" && (
            <IdentifierStep onSubmit={handleIdentifierSubmit} />
          )}

          {phase === "code" && (
            <form onSubmit={handleCodeSubmit} className="space-y-4">
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
              <button
                type="submit"
                disabled={code.length !== 6}
                className="group w-full flex items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-[14px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                {t("auth.code.submit")}
                <ArrowRight size={16} />
              </button>
            </form>
          )}

          {phase === "password" && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-[12px] font-medium text-text-secondary mb-1.5">
                  {t("auth.forgot.newPassword")}
                </label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-text-secondary mb-1.5">
                  {t("auth.forgot.confirmPassword")}
                </label>
                <input
                  type={showPw ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                  placeholder={t("auth.password.placeholder")}
                  className="w-full border border-border bg-surface-1 px-3.5 py-2.5 text-[14px] text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition-all rounded-lg"
                />
              </div>
              <button
                type="submit"
                disabled={loading || password.length === 0 || confirm.length === 0}
                className="group w-full flex items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-[14px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                {loading ? (
                  <>
                    <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    {t("auth.forgot.submitButton")}
                  </>
                ) : (
                  <>
                    {t("auth.forgot.submitButton")}
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          )}

          {phase === "done" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-[14px] text-success">
                <CheckCircle size={18} />
                {t("auth.forgot.success")}
              </div>
              <a
                href={`/login/${orgName}/${application.name}`}
                className="group w-full flex items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-[14px] font-semibold text-white hover:bg-accent-hover transition-all duration-200"
              >
                <ArrowLeft size={16} />
                {t("auth.forgot.backToSignin")}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
