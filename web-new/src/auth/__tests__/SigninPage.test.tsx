import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SigninPage from "../signin/SigninPage";
import type { AuthApplication, ResolvedProvider } from "../api/types";

vi.mock("../../i18n", () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    locale: "en",
    setLocale: vi.fn(),
    locales: [],
  }),
}));

vi.mock("../../theme", () => ({
  useTheme: () => ({
    theme: "light",
    toggle: vi.fn(),
    applyOrgTheme: vi.fn(),
    clearOrgTheme: vi.fn(),
  }),
}));

vi.mock("../api/resolveSigninMethods", () => ({
  resolveSigninMethods: vi.fn().mockResolvedValue({
    methods: [{ name: "Password", displayName: "Password", rule: "All" }],
    recommended: "Password",
    userHint: "a***@example.com",
  }),
}));

vi.mock("../../api/client", () => ({
  api: {
    post: vi.fn().mockResolvedValue({ status: "ok" }),
  },
}));

const mockApp: AuthApplication = {
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
  signupItems: [],
  signinItems: [],
  themeData: null,
  organizationObj: null,
};

const mockProviders: ResolvedProvider[] = [];

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("SigninPage", () => {
  it("advances from identifier step to password step after resolve succeeds", async () => {
    renderWithRouter(<SigninPage application={mockApp} providers={mockProviders} />);

    const input = screen.getByPlaceholderText("auth.identifier.placeholder");
    fireEvent.change(input, { target: { value: "alice@example.com" } });
    fireEvent.click(
      screen.getByRole("button", { name: "auth.identifier.continueButton" })
    );

    await waitFor(() => {
      expect(screen.queryByPlaceholderText("auth.identifier.placeholder")).toBeNull();
      expect(screen.getByPlaceholderText("auth.password.placeholder")).toBeInTheDocument();
    });
  });

  it("goes back to identifier step when password step back button clicked", async () => {
    renderWithRouter(<SigninPage application={mockApp} providers={mockProviders} />);

    fireEvent.change(screen.getByPlaceholderText("auth.identifier.placeholder"), {
      target: { value: "alice" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "auth.identifier.continueButton" })
    );

    await waitFor(() => screen.getByPlaceholderText("auth.password.placeholder"));

    fireEvent.click(screen.getByRole("button", { name: "auth.password.backButton" }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("auth.identifier.placeholder")).toBeInTheDocument();
    });
  });
});
