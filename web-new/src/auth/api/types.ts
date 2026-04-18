export interface ResolvedTheme {
  themeType: string;
  colorPrimary: string;
  colorCTA: string;
  colorSuccess: string;
  colorDanger: string;
  colorWarning: string;
  darkColorPrimary: string;
  darkBackground: string;
  borderRadius: number;
  isCompact: boolean;
  isEnabled: boolean;
  fontFamily: string;
  fontFamilyMono: string;
  spacingScale: number;
}

export interface ResolvedThemePayload {
  theme: ResolvedTheme;
  css: string;
}

export interface ResolvedProvider {
  name: string;
  displayName: string;
  type: string;
  logoUrl: string;
  clientId: string;
  prompted: boolean;
  canSignUp: boolean;
  rule: string;
}

export interface SigninMethod {
  name: string;
  displayName: string;
  rule: string;
}

export interface SignupItem {
  name: string;
  visible: boolean;
  required: boolean;
  prompted: boolean;
  type: string;
  customCss: string;
  label: string;
  placeholder: string;
  options: string[];
  regex: string;
  rule: string;
  helper?: string;
  group?: string;
  validationMessage?: Record<string, string>;
  step?: number;
}

export interface SigninItem {
  name: string;
  visible: boolean;
  label: string;
  customCss: string;
  placeholder: string;
  rule: string;
  isCustom: boolean;
}

export interface AuthApplication {
  name: string;
  organization: string;
  displayName: string;
  logo: string;
  favicon: string;
  title: string;
  homepageUrl: string;
  enablePassword: boolean;
  enableSignUp: boolean;
  enableGuestSignin: boolean;
  disableSignin: boolean;
  enableAutoSignin: boolean;
  enableCodeSignin: boolean;
  enableWebAuthn: boolean;
  orgChoiceMode: string;
  signinMethodMode?: string; // "" | "classic" — "" = identifier-first default
  formOffset: number;
  formBackgroundUrl: string;
  formBackgroundUrlMobile: string;
  formCss: string;
  formCssMobile: string;
  formSideHtml: string;
  headerHtml: string;
  footerHtml: string;
  signinHtml: string;
  signupHtml: string;
  signinMethods: SigninMethod[];
  signupItems: SignupItem[];
  signinItems: SigninItem[];
  themeData?: ResolvedTheme | null;
  organizationObj?: {
    name: string;
    displayName: string;
    logo: string;
    logoDark: string;
    favicon: string;
    themeData?: ResolvedTheme | null;
    countryCodes?: string[];
    languages?: string[];
  } | null;
}

export interface AppLoginResponse {
  status: "ok" | "error";
  msg?: string;
  data: AuthApplication;
  providersResolved: ResolvedProvider[];
}

export interface SigninMethodInfo {
  name: string;        // "Password" | "Verification code" | "WebAuthn" | "Face ID" | "LDAP" | "WeChat"
  displayName: string;
  rule: string;
}

export interface ResolveSigninPayload {
  methods: SigninMethodInfo[];
  recommended: string; // method name, or "" when none
  userHint: string;    // e.g. "a***@example.com" or ""
}

export interface ResolveSigninResponse {
  status: "ok" | "error";
  msg?: string;
  data: ResolveSigninPayload;
}

export interface ResolveSigninRequest {
  application: string;
  organization?: string;
  identifier: string;
}
