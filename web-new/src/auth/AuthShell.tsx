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

const PREVIEW_MESSAGE_TYPE = "jetauth.preview.config" as const;
const PREVIEW_READY_TYPE = "jetauth.preview.ready" as const;

function AuthShellInner({ lookup, mode }: { lookup: AuthLookup; mode: Mode }) {
  const { t } = useTranslation();
  const [app, setApp] = useState<AuthApplication | null>(null);
  const [providers, setProviders] = useState<ResolvedProvider[]>([]);
  const [error, setError] = useState("");

  const key = lookup.kind === "app" ? `app:${lookup.appId}` : `org:${lookup.orgName}`;
  const isPreviewMode = typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("preview");

  useEffect(() => {
    getAppLogin(lookup)
      .then(({ application, providers }) => {
        setApp(application);
        setProviders(providers);

        // In preview mode, signal readiness to the parent window so it
        // can postMessage the actual config. Kept after setApp so the
        // first config message has a base to merge over.
        if (isPreviewMode && window.parent && window.parent !== window) {
          window.parent.postMessage(
            { type: PREVIEW_READY_TYPE },
            window.location.origin
          );
        }
      })
      .catch((e: Error) => setError(e.message ?? "failed to load"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Preview message listener: admin UI posts application overrides that
  // get merged over the fetched app. Runs only in preview mode.
  //
  // ThemeData overrides also directly patch the :root CSS variables
  // that ThemeProvider injected, so color/radius/font changes render
  // live without a full theme refetch.
  useEffect(() => {
    if (!isPreviewMode) return;
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type !== PREVIEW_MESSAGE_TYPE) return;
      const overrides = e.data.payload as Partial<AuthApplication> | undefined;
      if (!overrides) return;
      setApp((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          ...overrides,
          organizationObj:
            overrides.organizationObj === undefined
              ? prev.organizationObj
              : {
                  ...(prev.organizationObj ?? {}),
                  ...overrides.organizationObj,
                },
        } as AuthApplication;
      });

      // Patch :root CSS vars directly so ThemeProvider's initial injection
      // (which was based on the pre-edit resolved theme) doesn't keep
      // winning. Takes effective values from the merged orgTheme then
      // appTheme (app wins) — same precedence as the backend resolver.
      const resolvedOrgTheme = overrides.organizationObj?.themeData;
      const resolvedAppTheme = overrides.themeData;
      const effective = resolvedAppTheme ?? resolvedOrgTheme;
      if (effective && typeof document !== "undefined") {
        const root = document.documentElement;
        if (effective.colorPrimary) {
          root.style.setProperty("--color-primary", effective.colorPrimary);
          root.style.setProperty("--accent", effective.colorPrimary);
          root.style.setProperty("--color-accent", effective.colorPrimary);
        }
        if (effective.borderRadius !== undefined && effective.borderRadius !== null) {
          root.style.setProperty("--radius-md", `${effective.borderRadius}px`);
          root.style.setProperty("--radius-lg", `${effective.borderRadius + 4}px`);
        }
        if (effective.fontFamily) {
          root.style.setProperty("--font-sans", effective.fontFamily);
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [isPreviewMode]);

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
