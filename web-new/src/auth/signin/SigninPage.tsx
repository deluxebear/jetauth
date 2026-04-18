import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { useTheme } from "../../theme";
import { useTranslation } from "../../i18n";
import { api } from "../../api/client";
import BrandingLayer from "../shell/BrandingLayer";
import TopBar from "../shell/TopBar";
import IdentifierStep from "./IdentifierStep";
import PasswordForm from "./PasswordForm";
import { resolveSigninMethods } from "../api/resolveSigninMethods";
import type {
  AuthApplication,
  ResolvedProvider,
  SigninMethodInfo,
} from "../api/types";

type Step = "identifier" | "method";

interface SigninPageProps {
  application: AuthApplication;
  providers: ResolvedProvider[];
}

/**
 * Identifier-first signin orchestrator. Composes BrandingLayer + TopBar
 * with the step components. W2a only wires the Password method; W2b
 * extends the "method" step with CodeForm, WebAuthnForm, FaceForm,
 * ProvidersRow.
 */
export default function SigninPage({ application, providers: _providers }: SigninPageProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();

  const [step, setStep] = useState<Step>("identifier");
  const [identifier, setIdentifier] = useState("");
  const [methods, setMethods] = useState<SigninMethodInfo[]>([]);
  const [recommended, setRecommended] = useState<string>("");
  const [userHint, setUserHint] = useState<string>("");
  const [error, setError] = useState<string>("");

  const orgName =
    application.organizationObj?.name ?? application.organization ?? "built-in";

  const handleIdentifierSubmit = async (v: string) => {
    setError("");
    try {
      const payload = await resolveSigninMethods({
        application: application.name,
        organization: orgName,
        identifier: v,
      });
      setIdentifier(v);
      setMethods(payload.methods);
      setRecommended(payload.recommended);
      setUserHint(payload.userHint);
      setStep("method");
    } catch (e: unknown) {
      setError((e as Error).message ?? t("auth.signin.noMethodError"));
    }
  };

  const handlePasswordSubmit = async (password: string) => {
    setError("");
    // Construct the same AuthForm shape the legacy Login.tsx used — the
    // /api/login handler accepts it unchanged.
    const body = {
      application: application.name,
      organization: orgName,
      username: identifier,
      password,
      type: searchParams.get("type") ?? "login",
      signinMethod: "Password",
      clientId: application.name,
      redirectUri: searchParams.get("redirect_uri") ?? "",
      state: searchParams.get("state") ?? "",
    };
    try {
      const res = await api.post<{ status: string; msg?: string; data?: string }>(
        "/api/login",
        body
      );
      if (res.status !== "ok") {
        setError(res.msg ?? t("auth.signin.noMethodError"));
        return;
      }
      const redirectUri = searchParams.get("redirect_uri");
      if (redirectUri && res.data) {
        const joiner = redirectUri.includes("?") ? "&" : "?";
        window.location.href = `${redirectUri}${joiner}code=${encodeURIComponent(res.data)}&state=${encodeURIComponent(searchParams.get("state") ?? "")}`;
        return;
      }
      // Full page reload so App.tsx re-bootstraps its `user` state via
      // /api/get-account; a plain navigate("/") would bounce back to
      // /login because the top-level state still thinks we're anon.
      // The backend also routes the user to the right landing page based
      // on role (admin → Dashboard, non-admin → UserHomePage).
      window.location.href = "/";
    } catch (e: unknown) {
      setError((e as Error).message ?? "network error");
    }
  };

  const handleBack = () => {
    setStep("identifier");
    setError("");
  };

  const selectedMethod = recommended || methods[0]?.name || "Password";
  const orgLogo =
    theme === "dark" && application.organizationObj?.logoDark
      ? application.organizationObj.logoDark
      : application.organizationObj?.logo ?? application.logo;
  const orgDisplay =
    application.organizationObj?.displayName ??
    application.displayName ??
    application.name;

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
            {orgDisplay}
          </h1>
          <p className="text-[13px] text-text-muted mb-8">
            {t("auth.signin.brandingSubtitle")}
          </p>

          {step === "identifier" && (
            <IdentifierStep onSubmit={handleIdentifierSubmit} error={error} />
          )}

          {step === "method" && selectedMethod === "Password" && (
            <PasswordForm
              identifier={identifier}
              userHint={userHint}
              onSubmit={handlePasswordSubmit}
              onBack={handleBack}
              error={error}
            />
          )}

          {step === "method" && selectedMethod !== "Password" && (
            <div className="rounded-lg border border-border bg-surface-2 p-4 text-[13px] text-text-secondary">
              <ShieldCheck size={16} className="inline-block mr-1 text-accent" />
              {t("auth.signin.methodNotReady")}
              <button
                onClick={handleBack}
                className="mt-3 block text-[12px] text-accent hover:underline"
              >
                {t("auth.password.backButton")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
