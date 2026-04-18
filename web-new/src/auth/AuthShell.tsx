// web-new/src/auth/AuthShell.tsx
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { ThemeProvider } from "./ThemeProvider";
import { getAppLogin } from "./api/getAppLogin";
import type { AuthLookup } from "./api/getResolvedTheme";
import type { AuthApplication, ResolvedProvider } from "./api/types";
import { useTranslation } from "../i18n";
import SigninPage from "./signin/SigninPage";
import ClassicSigninPage from "./signin/ClassicSigninPage";
import ForgotPasswordPage from "./signin/ForgotPasswordPage";
import SignupPage from "./signup/SignupPage";
import LayoutRouter from "./layouts/LayoutRouter";

type Mode = "signin" | "signup" | "forget";

interface AuthShellProps {
  mode: Mode;
}

/**
 * Resolve the route params into a lookup shape the backend understands.
 *
 *  /login                          → app=admin/app-built-in   (IAM admin panel)
 *  /login/<org>                    → organization=<org>       (backend resolves to org's default app)
 *  /login/<org>/<app>              → app=admin/<app>          (specific OAuth/signin flow)
 */
function deriveLookup(params: {
  applicationName?: string;
  organizationName?: string;
}): AuthLookup {
  if (params.applicationName) {
    return { kind: "app", appId: `admin/${params.applicationName}` };
  }
  if (params.organizationName) {
    return { kind: "org", orgName: params.organizationName };
  }
  return { kind: "app", appId: "admin/app-built-in" };
}

export default function AuthShell({ mode }: AuthShellProps) {
  const params = useParams<{ applicationName?: string; organizationName?: string }>();
  const lookup = useMemo(() => deriveLookup(params), [params.applicationName, params.organizationName]);

  return (
    <ThemeProvider lookup={lookup}>
      <AuthShellInner lookup={lookup} mode={mode} />
    </ThemeProvider>
  );
}

function AuthShellInner({ lookup, mode }: { lookup: AuthLookup; mode: Mode }) {
  const { t } = useTranslation();
  const [app, setApp] = useState<AuthApplication | null>(null);
  const [providers, setProviders] = useState<ResolvedProvider[]>([]);
  const [error, setError] = useState("");

  const key = lookup.kind === "app" ? `app:${lookup.appId}` : `org:${lookup.orgName}`;

  useEffect(() => {
    getAppLogin(lookup)
      .then(({ application, providers }) => {
        setApp(application);
        setProviders(providers);
      })
      .catch((e: Error) => setError(e.message ?? "failed to load"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

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

  const pageContent = (() => {
    if (mode === "signin") {
      if (app.signinMethodMode === "classic") {
        return <ClassicSigninPage application={app} providers={providers} />;
      }
      return <SigninPage application={app} providers={providers} />;
    }
    if (mode === "forget") return <ForgotPasswordPage application={app} />;
    return <SignupPage application={app} />;
  })();

  return <LayoutRouter application={app}>{pageContent}</LayoutRouter>;
}
