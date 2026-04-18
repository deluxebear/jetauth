// web-new/src/auth/AuthShell.tsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ThemeProvider, useAuthTheme } from "./ThemeProvider";
import { getAppLogin } from "./api/getAppLogin";
import type { AuthApplication, ResolvedProvider } from "./api/types";
import { useTranslation } from "../i18n";

type Mode = "signin" | "signup";

interface AuthShellProps {
  mode: Mode;
}

export default function AuthShell({ mode }: AuthShellProps) {
  const params = useParams<{ applicationName?: string; organizationName?: string }>();
  const appId =
    params.applicationName
      ? `admin/${params.applicationName}`
      : params.organizationName
      ? `admin/app-${params.organizationName}`
      : "admin/app-built-in";

  return (
    <ThemeProvider appId={appId}>
      <AuthShellInner appId={appId} mode={mode} />
    </ThemeProvider>
  );
}

function AuthShellInner({ appId, mode }: { appId: string; mode: Mode }) {
  const theme = useAuthTheme();
  const { t } = useTranslation();
  const [app, setApp] = useState<AuthApplication | null>(null);
  const [providers, setProviders] = useState<ResolvedProvider[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    getAppLogin(appId)
      .then(({ application, providers }) => {
        setApp(application);
        setProviders(providers);
      })
      .catch((e: Error) => setError(e.message ?? "failed to load"));
  }, [appId]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-[14px] text-text-muted">{error}</p>
      </div>
    );
  }
  if (!app) {
    return <div className="min-h-screen flex items-center justify-center">{t("auth.loading")}</div>;
  }

  // W1 placeholder surface — proves the theme pipeline works end-to-end.
  // W2 replaces the body with the real identifier-first sign-in orchestrator
  // (plus PasswordForm, CodeForm, WebAuthnForm, FaceForm, ProvidersRow).
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-8"
      style={{
        backgroundColor: "var(--color-background, #f8fafc)",
        fontFamily: "var(--font-sans, Inter)",
      }}
    >
      <div
        className="max-w-md w-full p-8 bg-white border border-gray-200 shadow-sm"
        style={{
          borderRadius: "var(--radius-lg, 12px)",
        }}
      >
        <h1
          className="text-2xl font-bold mb-2"
          style={{ color: "var(--color-primary, #2563EB)" }}
        >
          {mode === "signin" ? t("auth.signinTitle") : t("auth.signupTitle")}
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          {app.displayName || app.name} · {t("auth.skeletonNote")}
        </p>

        <div className="text-[12px] font-mono text-gray-400 p-3 bg-gray-50 rounded space-y-1">
          <div>theme.colorPrimary = <span className="text-black">{theme?.colorPrimary ?? "—"}</span></div>
          <div>providers = <span className="text-black">{providers.length}</span></div>
          <div>signinMethods = <span className="text-black">{app.signinMethods?.length ?? 0}</span></div>
          <div>formOffset = <span className="text-black">{app.formOffset ?? 0}</span></div>
        </div>
      </div>
    </div>
  );
}
