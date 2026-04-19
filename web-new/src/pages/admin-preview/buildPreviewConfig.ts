import type { AuthApplication } from "../../auth/api/types";

/**
 * Subset of AuthApplication that matters for UI preview rendering.
 * Extracted from the full admin form state + passed to the preview
 * iframe as a base64-encoded query parameter.
 *
 * Excludes secret fields (clientSecret, cert, certPublicKey) and
 * identity fields that shouldn't change in preview (owner, name).
 */
export type PreviewOverrides = Partial<
  Pick<
    AuthApplication,
    | "displayName"
    | "logo"
    | "favicon"
    | "homepageUrl"
    | "themeData"
    | "signinMethods"
    | "signinItems"
    | "signupItems"
    | "forgetItems"
    | "signinMethodMode"
    | "orgChoiceMode"
    | "formOffset"
    | "formBackgroundUrl"
    | "formBackgroundUrlMobile"
    | "formCss"
    | "formCssMobile"
    | "formSideHtml"
    | "headerHtml"
    | "footerHtml"
    | "signinHtml"
    | "signupHtml"
    | "forgetHtml"
    | "organizationObj"
    | "enablePassword"
    | "enableSignUp"
    | "enableCodeSignin"
    | "enableWebAuthn"
  >
>;

/**
 * Builds the preview override object from the full application.
 * Only the fields that matter for UI rendering are included.
 */
export function buildPreviewConfig(app: AuthApplication): PreviewOverrides {
  return {
    displayName: app.displayName,
    logo: app.logo,
    favicon: app.favicon,
    homepageUrl: app.homepageUrl,
    themeData: app.themeData,
    signinMethods: app.signinMethods,
    signinItems: app.signinItems,
    signupItems: app.signupItems,
    forgetItems: app.forgetItems,
    signinMethodMode: app.signinMethodMode,
    orgChoiceMode: app.orgChoiceMode,
    formOffset: app.formOffset,
    formBackgroundUrl: app.formBackgroundUrl,
    formBackgroundUrlMobile: app.formBackgroundUrlMobile,
    formCss: app.formCss,
    formCssMobile: app.formCssMobile,
    formSideHtml: app.formSideHtml,
    headerHtml: app.headerHtml,
    footerHtml: app.footerHtml,
    signinHtml: app.signinHtml,
    signupHtml: app.signupHtml,
    forgetHtml: app.forgetHtml,
    organizationObj: app.organizationObj,
    enablePassword: app.enablePassword,
    enableSignUp: app.enableSignUp,
    enableCodeSignin: app.enableCodeSignin,
    enableWebAuthn: app.enableWebAuthn,
  };
}

/**
 * URL-safe base64 encoder (RFC 4648 §5). Safe to use in query strings
 * without further escaping.
 */
export function encodePreviewConfig(cfg: PreviewOverrides): string {
  const json = JSON.stringify(cfg);
  // UTF-8 → base64 via modern browsers: encodeURIComponent + unescape + btoa
  const utf8 = unescape(encodeURIComponent(json));
  return btoa(utf8).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
