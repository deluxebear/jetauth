/**
 * W6 a11y audit — axe-core assertions against key auth surfaces.
 *
 * Scope: structural a11y (labels, roles, names, semantic markup). We
 * suppress color-contrast because happy-dom does not resolve CSS custom
 * properties, which makes every CSS-var-driven color appear as the
 * browser default and produce false positives. Real color-contrast
 * auditing requires a real browser (deferred to Playwright follow-up).
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { axe } from "vitest-axe";
import type { AxeResults } from "axe-core";
// Type augmentation for toHaveNoViolations lives in setup-axe.ts.

import SigninPage from "../auth/signin/SigninPage";
import ClassicSigninPage from "../auth/signin/ClassicSigninPage";
import SignupPage from "../auth/signup/SignupPage";
import ForgotPasswordPage from "../auth/signin/ForgotPasswordPage";
import AdminPreviewPane from "../pages/admin-preview/AdminPreviewPane";
import type { AuthApplication, ResolvedProvider } from "../auth/api/types";

// --- Mocks (match shape used by existing tests) ----------------------------

vi.mock("../i18n", () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    locale: "en",
    setLocale: vi.fn(),
    locales: [],
  }),
}));

vi.mock("../theme", () => ({
  useTheme: () => ({
    theme: "light",
    toggle: vi.fn(),
    applyOrgTheme: vi.fn(),
    clearOrgTheme: vi.fn(),
  }),
}));

vi.mock("../auth/api/resolveSigninMethods", () => ({
  resolveSigninMethods: vi.fn().mockResolvedValue({
    methods: [{ name: "Password", displayName: "Password", rule: "All" }],
    recommended: "Password",
    userHint: "a***@example.com",
  }),
}));

vi.mock("../api/client", () => ({
  api: {
    post: vi.fn().mockResolvedValue({ status: "ok" }),
    get: vi.fn().mockResolvedValue({ status: "ok" }),
  },
}));

// --- Fixture ---------------------------------------------------------------

function makeApp(partial: Partial<AuthApplication> = {}): AuthApplication {
  return {
    name: "app-test",
    organization: "admin",
    displayName: "Test App",
    logo: "",
    favicon: "",
    title: "",
    homepageUrl: "",
    enablePassword: true,
    enableSignUp: true,
    enableGuestSignin: false,
    disableSignin: false,
    enableAutoSignin: false,
    enableCodeSignin: false,
    enableWebAuthn: false,
    orgChoiceMode: "None",
    formOffset: 2,
    formBackgroundUrl: "",
    formBackgroundUrlMobile: "",
    formCss: "",
    formCssMobile: "",
    formSideHtml: "",
    headerHtml: "",
    footerHtml: "",
    signinHtml: "",
    signupHtml: "",
    signinMethods: [],
    signupItems: [
      {
        name: "Email",
        label: "Email",
        type: "email",
        required: true,
        visible: true,
        prompted: false,
        customCss: "",
        placeholder: "",
        options: [],
        regex: "",
        rule: "",
      },
      {
        name: "Password",
        label: "Password",
        type: "password",
        required: true,
        visible: true,
        prompted: false,
        customCss: "",
        placeholder: "",
        options: [],
        regex: "",
        rule: "",
      },
      {
        name: "Confirm password",
        label: "Confirm password",
        type: "confirm-password",
        required: true,
        visible: true,
        prompted: false,
        customCss: "",
        placeholder: "",
        options: [],
        regex: "",
        rule: "",
      },
    ],
    signinItems: [],
    themeData: null,
    organizationObj: null,
    ...partial,
  };
}

const emptyProviders: ResolvedProvider[] = [];

// Axe options: disable color-contrast (CSS vars aren't resolved in happy-dom;
// see header comment). region is informational; suppress so pages without a
// <main> landmark pass while still surfacing structural issues.
const axeOpts = {
  // iframes: false — AdminPreviewPane renders an iframe that happy-dom
  // cannot introspect; without this axe throws "Respondable target must
  // be a frame in the current window". The iframe's contents are the same
  // SigninPage we already audit directly, so nothing is lost.
  iframes: false,
  rules: {
    "color-contrast": { enabled: false },
    region: { enabled: false },
  },
};

async function auditUi(ui: React.ReactElement): Promise<AxeResults> {
  const { container } = render(<MemoryRouter>{ui}</MemoryRouter>);
  return await axe(container, axeOpts);
}

// --- Tests -----------------------------------------------------------------

describe("a11y audit (axe-core)", () => {
  it("SigninPage has no axe violations", async () => {
    const results = await auditUi(
      <SigninPage application={makeApp()} providers={emptyProviders} />
    );
    expect(results).toHaveNoViolations();
  });

  it("ClassicSigninPage has no axe violations", async () => {
    const results = await auditUi(
      <ClassicSigninPage application={makeApp()} providers={emptyProviders} />
    );
    expect(results).toHaveNoViolations();
  });

  it("SignupPage has no axe violations", async () => {
    const results = await auditUi(<SignupPage application={makeApp()} />);
    expect(results).toHaveNoViolations();
  });

  it("ForgotPasswordPage has no axe violations", async () => {
    const results = await auditUi(<ForgotPasswordPage application={makeApp()} />);
    expect(results).toHaveNoViolations();
  });

  it("AdminPreviewPane (expanded) has no axe violations", async () => {
    const results = await auditUi(
      <AdminPreviewPane application={makeApp()} initiallyCollapsed={false} />
    );
    expect(results).toHaveNoViolations();
  });
});
