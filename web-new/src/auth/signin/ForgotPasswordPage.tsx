import { useState, type FormEvent } from "react";
import { Eye, EyeOff, ArrowRight, ArrowLeft, CheckCircle } from "lucide-react";
import { useTheme } from "../../theme";
import { useTranslation } from "../../i18n";
import { api } from "../../api/client";
import BrandingLayer from "../shell/BrandingLayer";
import TopBar from "../shell/TopBar";
import SafeHtml from "../shell/SafeHtml";
import IdentifierStep from "./IdentifierStep";
import { resolveSigninMethods } from "../api/resolveSigninMethods";
import { useSigninItemVisibility } from "../items/useSigninItemVisibility";
import { resolveTemplate } from "../templates";
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

  const forgetItemVis = useSigninItemVisibility(application.forgetItems);

  const orgName =
    application.organizationObj?.name ?? application.organization ?? "built-in";
  const orgDisplay =
    application.displayName ||
    application.organizationObj?.displayName ||
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

  // Label overrides from admin-configured forgetItems. Fall back to i18n
  // when no override is set — keeps backward compat when forgetItems is
  // empty/missing.
  const newPasswordLabel = forgetItemVis.labelOf("New password") || t("auth.forgot.newPassword");
  const confirmPasswordLabel = forgetItemVis.labelOf("Confirm password") || t("auth.forgot.confirmPassword");
  const verifyCodeButtonLabel = forgetItemVis.labelOf("Verify code button") || t("auth.code.submit");
  const resetPasswordButtonLabel = forgetItemVis.labelOf("Reset password button") || t("auth.forgot.submitButton");
  const successMessageLabel = forgetItemVis.labelOf("Success message") || t("auth.forgot.success");
  const signinLinkLabel = forgetItemVis.labelOf("Signin link") || t("auth.forgot.backToSignin");
  const sendCodeButtonLabel = forgetItemVis.labelOf("Send code button") || t("auth.identifier.continueButton");
  const backButtonLabel = forgetItemVis.labelOf("Back button") || t("auth.password.backButton");

  // Forget flow has three forward phases (identifier → code → password).
  // Back walks one step at a time so the user can correct an input.
  const goBack = () => {
    if (phase === "password") setPhase("code");
    else if (phase === "code") setPhase("identifier");
  };
  const showBack = phase === "code" || phase === "password";

  const { Component: Template } = resolveTemplate(application.template);

  return (
    <Template
      variant="forgot"
      application={application}
      theme={theme}
      options={application.templateOptions ?? {}}
      slots={{
        topBar: <TopBar hideLanguage={!forgetItemVis.isVisible("Languages")} />,
        branding: (
          <BrandingLayer
            logo={orgLogo}
            logoDark={application.organizationObj?.logoDark}
            favicon={application.organizationObj?.favicon ?? application.favicon}
            displayName={orgDisplay}
            title={application.title}
            theme={theme}
            hideLogo={!forgetItemVis.isVisible("Logo")}
          />
        ),
        content: (
          <>
            <h1 className="text-2xl font-bold tracking-tight text-text-primary mb-1">
              {t("auth.forgot.title")}
            </h1>
            <p className="text-[13px] text-text-muted mb-8">
              {phase === "done" ? successMessageLabel : t("auth.forgot.subtitle")}
            </p>

            {error && (
              <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-[13px] text-danger">
                {error}
              </div>
            )}

            <div data-cfg-section="forget" data-cfg-field="forgetItems">
            {phase === "identifier" && forgetItemVis.isVisible("Username") && (
              <div data-signinitem="username">
                <IdentifierStep
                  onSubmit={handleIdentifierSubmit}
                  placeholder={forgetItemVis.placeholderOf("Username")}
                  submitLabel={forgetItemVis.isVisible("Send code button") ? sendCodeButtonLabel : undefined}
                  submitItemName={forgetItemVis.isVisible("Send code button") ? "send-code-button" : undefined}
                />
              </div>
            )}

            {showBack && forgetItemVis.isVisible("Back button") && (
              <button
                type="button"
                onClick={goBack}
                data-signinitem="back-button"
                className="mb-3 inline-flex items-center gap-1 text-[12px] text-text-muted hover:text-text-secondary transition-colors"
              >
                <ArrowLeft size={14} />
                {backButtonLabel}
              </button>
            )}

            {phase === "code" && forgetItemVis.isVisible("Verification code") && (
              <form onSubmit={handleCodeSubmit} className="space-y-4" data-signinitem="verification-code">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  autoFocus
                  autoComplete="one-time-code"
                  aria-label={t("auth.code.codePlaceholder")}
                  placeholder={forgetItemVis.placeholderOf("Verification code") || t("auth.code.codePlaceholder")}
                  className="w-full rounded-lg border border-border bg-surface-1 px-3.5 py-2.5 text-[14px] tracking-[0.3em] text-center text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition-all"
                />
                <button
                  type="submit"
                  disabled={code.length !== 6}
                  data-signinitem="verify-code-button"
                  className="group w-full flex items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-[14px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                >
                  {verifyCodeButtonLabel}
                  <ArrowRight size={16} />
                </button>
              </form>
            )}

            {phase === "password" && (
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                {forgetItemVis.isVisible("New password") && (
                  <div data-signinitem="new-password">
                    <label className="block text-[12px] font-medium text-text-secondary mb-1.5">
                      {newPasswordLabel}
                    </label>
                    <div className="relative">
                      <input
                        type={showPw ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                        autoFocus
                        required
                        placeholder={forgetItemVis.placeholderOf("New password") || t("auth.password.placeholder")}
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
                )}
                {forgetItemVis.isVisible("Confirm password") && (
                  <div data-signinitem="confirm-password">
                    <label className="block text-[12px] font-medium text-text-secondary mb-1.5">
                      {confirmPasswordLabel}
                    </label>
                    <input
                      type={showPw ? "text" : "password"}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      autoComplete="new-password"
                      required
                      placeholder={forgetItemVis.placeholderOf("Confirm password") || t("auth.password.placeholder")}
                      className="w-full border border-border bg-surface-1 px-3.5 py-2.5 text-[14px] text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition-all rounded-lg"
                    />
                  </div>
                )}
                {forgetItemVis.isVisible("Reset password button") && (
                  <button
                    type="submit"
                    disabled={loading || password.length === 0 || confirm.length === 0}
                    data-signinitem="reset-password-button"
                    className="group w-full flex items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-[14px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                  >
                    {loading ? (
                      <>
                        <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        {resetPasswordButtonLabel}
                      </>
                    ) : (
                      <>
                        {resetPasswordButtonLabel}
                        <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                )}
              </form>
            )}

            {phase === "done" && (
              <div className="space-y-4">
                {forgetItemVis.isVisible("Success message") && (
                  <div
                    data-signinitem="success-message"
                    className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-[14px] text-success"
                  >
                    <CheckCircle size={18} />
                    {successMessageLabel}
                  </div>
                )}
                {forgetItemVis.isVisible("Signin link") && (
                  <a
                    href={`/login/${orgName}/${application.name}`}
                    data-signinitem="signin-link"
                    className="group w-full flex items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-[14px] font-semibold text-white hover:bg-accent-hover transition-all duration-200"
                  >
                    <ArrowLeft size={16} />
                    {signinLinkLabel}
                  </a>
                )}
              </div>
            )}
          </div>

          </>
        ),
        htmlInjection: <SafeHtml html={application.forgetHtml || ""} className="auth-page-html" />,
      }}
    />
  );
}
