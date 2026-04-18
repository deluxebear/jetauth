import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTheme } from "../../theme";
import { useTranslation } from "../../i18n";
import { api } from "../../api/client";
import BrandingLayer from "../shell/BrandingLayer";
import OrgChoiceWidget from "../shell/OrgChoiceWidget";
import TopBar from "../shell/TopBar";
import IdentifierStep from "./IdentifierStep";
import MethodStep from "./MethodStep";
import ProvidersRow from "./ProvidersRow";
import { resolveSigninMethods } from "../api/resolveSigninMethods";
import { useSigninItemVisibility } from "../items/useSigninItemVisibility";
import CustomTextItems from "../items/CustomTextItems";
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
 * with the step components. W2b wires all four method forms (Password,
 * Code, WebAuthn, Face ID) through MethodStep.
 */
export default function SigninPage({ application, providers }: SigninPageProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();

  const [step, setStep] = useState<Step>("identifier");
  const [identifier, setIdentifier] = useState("");
  const [methods, setMethods] = useState<SigninMethodInfo[]>([]);
  const [recommended, setRecommended] = useState<string>("");
  const [userHint, setUserHint] = useState<string>("");
  const [error, setError] = useState<string>("");

  const signinItemVis = useSigninItemVisibility(application.signinItems);

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

  const reloadHome = () => {
    window.location.href = "/";
  };

  const handleOAuthRedirect = (data: string): boolean => {
    const redirectUri = searchParams.get("redirect_uri");
    if (redirectUri && data) {
      const joiner = redirectUri.includes("?") ? "&" : "?";
      window.location.href = `${redirectUri}${joiner}code=${encodeURIComponent(data)}&state=${encodeURIComponent(searchParams.get("state") ?? "")}`;
      return true;
    }
    return false;
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
      if (res.data && handleOAuthRedirect(res.data)) return;
      // Full page reload so App.tsx re-bootstraps its `user` state via
      // /api/get-account; a plain navigate("/") would bounce back to
      // /login because the top-level state still thinks we're anon.
      // The backend also routes the user to the right landing page based
      // on role (admin → Dashboard, non-admin → UserHomePage).
      reloadHome();
    } catch (e: unknown) {
      setError((e as Error).message ?? "network error");
    }
  };

  const handleCodeSubmit = async (code: string) => {
    setError("");
    const body = {
      application: application.name,
      organization: orgName,
      username: identifier,
      code,
      type: searchParams.get("type") ?? "login",
      signinMethod: "Verification code",
      clientId: application.name,
      redirectUri: searchParams.get("redirect_uri") ?? "",
      state: searchParams.get("state") ?? "",
    };
    try {
      const res = await api.post<{ status: string; msg?: string; data?: string }>("/api/login", body);
      if (res.status !== "ok") {
        setError(res.msg ?? t("auth.signin.noMethodError"));
        return;
      }
      if (res.data && handleOAuthRedirect(res.data)) return;
      reloadHome();
    } catch (e: unknown) {
      setError((e as Error).message ?? "network error");
    }
  };

  const handleBack = () => {
    setStep("identifier");
    setError("");
  };

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
      <TopBar hideLanguage={!signinItemVis.isVisible("Languages")} />

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

          <OrgChoiceWidget mode={application.orgChoiceMode} currentOrg={orgName} />

          <h1 className="text-2xl font-bold tracking-tight text-text-primary mb-1">
            {orgDisplay}
          </h1>
          <p className="text-[13px] text-text-muted mb-8">
            {t("auth.signin.brandingSubtitle")}
          </p>

          {step === "identifier" && (
            <>
              <IdentifierStep onSubmit={handleIdentifierSubmit} error={error} />
              {signinItemVis.isVisible("Providers") && (
                <ProvidersRow
                  application={application}
                  providers={providers}
                  redirectUri={searchParams.get("redirect_uri") ?? undefined}
                  state={searchParams.get("state") ?? undefined}
                />
              )}
              <CustomTextItems items={signinItemVis.customItems} />
              {signinItemVis.isVisible("Signup link") && application.enableSignUp && (
                <p className="mt-6 text-center text-[12px] text-text-muted">
                  {t("auth.signup.haveAccount")}{" — "}
                  <a href={`/signup/${application.name}`} className="text-accent hover:underline">
                    {signinItemVis.labelOf("Signup link") ?? t("auth.signup.signinLink")}
                  </a>
                </p>
              )}
            </>
          )}

          {step === "method" && (
            <>
              <MethodStep
                identifier={identifier}
                userHint={userHint}
                application={application.name}
                organization={orgName}
                methods={methods}
                recommended={recommended}
                forgotPasswordHref={`/forget/${application.name}`}
                onPasswordSubmit={handlePasswordSubmit}
                onCodeSubmit={handleCodeSubmit}
                onWebAuthnSuccess={reloadHome}
                onFaceSuccess={reloadHome}
                onBack={signinItemVis.isVisible("Back button") ? handleBack : undefined}
                error={error}
              />

              <CustomTextItems items={signinItemVis.customItems} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
