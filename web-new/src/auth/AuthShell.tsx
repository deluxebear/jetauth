// web-new/src/auth/AuthShell.tsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ThemeProvider } from "./ThemeProvider";
import { getAppLogin } from "./api/getAppLogin";
import type { AuthApplication, ResolvedProvider } from "./api/types";
import { useTranslation } from "../i18n";
import SigninPage from "./signin/SigninPage";

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

  if (mode === "signin") {
    return <SigninPage application={app} providers={providers} />;
  }

  // mode === "signup" — W1 placeholder stays for now; W3 replaces with SignupPage.
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
        style={{ borderRadius: "var(--radius-lg, 12px)" }}
      >
        <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--color-primary, #2563EB)" }}>
          {t("auth.signupTitle")}
        </h1>
        <p className="text-sm text-gray-500">
          {app.displayName || app.name} · {t("auth.skeletonNote")}
        </p>
      </div>
    </div>
  );
}
