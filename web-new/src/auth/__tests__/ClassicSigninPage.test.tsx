import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ClassicSigninPage from "../signin/ClassicSigninPage";
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

const apiPostMock = vi.fn().mockResolvedValue({ status: "ok" });
vi.mock("../../api/client", () => ({
  api: {
    post: (...args: unknown[]) => apiPostMock(...args),
    get: vi.fn().mockResolvedValue({}),
  },
}));

// Helper to build a minimal mock app
function makeApp(overrides: Partial<AuthApplication> = {}): AuthApplication {
  return {
    name: "app-classic",
    organization: "acme",
    displayName: "Acme",
    logo: "",
    favicon: "",
    title: "",
    homepageUrl: "",
    enablePassword: true,
    enableSignUp: false,
    enableGuestSignin: false,
    disableSignin: false,
    enableAutoSignin: false,
    enableCodeSignin: false,
    enableWebAuthn: false,
    orgChoiceMode: "None",
    signinMethodMode: "classic",
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
    ...overrides,
  };
}

const noProviders: ResolvedProvider[] = [];

function renderPage(app: AuthApplication, providers = noProviders) {
  return render(
    <MemoryRouter>
      <ClassicSigninPage application={app} providers={providers} />
    </MemoryRouter>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ClassicSigninPage — tab rendering", () => {
  it("renders only Password tab when only enablePassword is true", () => {
    renderPage(makeApp({ enablePassword: true, enableCodeSignin: false, enableWebAuthn: false }));
    // No tablist rendered when there's only one tab
    expect(screen.queryByRole("tablist")).toBeNull();
    // Password form should be visible (username input present)
    expect(screen.getByPlaceholderText("auth.classic.usernameLabel")).toBeInTheDocument();
  });

  it("renders multiple tabs when enablePassword and enableCodeSignin are both true", () => {
    renderPage(makeApp({ enablePassword: true, enableCodeSignin: true }));
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    // Both tabs should appear
    expect(screen.getByRole("tab", { name: "auth.classic.tabPassword" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "auth.classic.tabCode" })).toBeInTheDocument();
    // WebAuthn tab should NOT appear
    expect(screen.queryByRole("tab", { name: "auth.classic.tabWebAuthn" })).toBeNull();
  });

  it("renders WebAuthn tab when enableWebAuthn is true", () => {
    renderPage(makeApp({ enablePassword: false, enableWebAuthn: true }));
    // Only one tab → no tablist, but WebAuthn body visible
    expect(screen.queryByRole("tablist")).toBeNull();
    // In JSDOM, window.PublicKeyCredential is undefined so the unsupported
    // message is shown. Either the supported button or the unsupported message
    // proves the WebAuthn body is rendered.
    const hasButton = screen.queryByRole("button", { name: "auth.webauthn.button" });
    const hasUnsupported = screen.queryByText("auth.webauthn.unsupported");
    expect(hasButton ?? hasUnsupported).toBeTruthy();
  });

  it("renders Face ID tab when signinMethods contains Face ID", () => {
    renderPage(
      makeApp({
        enablePassword: true,
        signinMethods: [{ name: "Face ID", displayName: "Face ID", rule: "All" }],
      }),
    );
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "auth.classic.tabFace" })).toBeInTheDocument();
  });
});

describe("ClassicSigninPage — tab switching", () => {
  it("switching to Code tab changes the form body", () => {
    renderPage(makeApp({ enablePassword: true, enableCodeSignin: true }));

    // Initially on Password tab — password placeholder visible
    expect(screen.getByPlaceholderText("auth.password.placeholder")).toBeInTheDocument();

    // Click the Code tab
    fireEvent.click(screen.getByRole("tab", { name: "auth.classic.tabCode" }));

    // Password input should be gone; send button should appear
    expect(screen.queryByPlaceholderText("auth.password.placeholder")).toBeNull();
    // The send-code button text contains the sendToEmail or sendToPhone key
    // (depending on username — here it's empty so it uses "phone" label)
    expect(screen.getByRole("button", { name: /auth\.code\.send/ })).toBeInTheDocument();
  });

  it("switching back to Password tab restores the password form", () => {
    renderPage(makeApp({ enablePassword: true, enableCodeSignin: true }));

    // Switch to Code
    fireEvent.click(screen.getByRole("tab", { name: "auth.classic.tabCode" }));
    // Switch back to Password
    fireEvent.click(screen.getByRole("tab", { name: "auth.classic.tabPassword" }));

    expect(screen.getByPlaceholderText("auth.password.placeholder")).toBeInTheDocument();
  });
});

describe("ClassicSigninPage — password submit", () => {
  it("calls api.post with signinMethod=Password and the typed username", async () => {
    apiPostMock.mockResolvedValueOnce({ status: "ok", data: undefined });

    // Assign window.location.href to avoid JSDOM errors
    Object.defineProperty(window, "location", {
      writable: true,
      value: { href: "", assign: vi.fn() },
    });

    renderPage(makeApp({ enablePassword: true }));

    // Type username
    fireEvent.change(screen.getByPlaceholderText("auth.classic.usernameLabel"), {
      target: { value: "alice@example.com" },
    });
    // Type password
    fireEvent.change(screen.getByPlaceholderText("auth.password.placeholder"), {
      target: { value: "secret123" },
    });

    // Submit
    fireEvent.click(screen.getByRole("button", { name: "auth.password.submitButton" }));

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith(
        "/api/login",
        expect.objectContaining({
          username: "alice@example.com",
          password: "secret123",
          signinMethod: "Password",
        }),
      );
    });
  });

  it("shows error message when api.post returns status error", async () => {
    apiPostMock.mockResolvedValueOnce({ status: "error", msg: "Invalid credentials" });

    renderPage(makeApp({ enablePassword: true }));

    fireEvent.change(screen.getByPlaceholderText("auth.classic.usernameLabel"), {
      target: { value: "bob" },
    });
    fireEvent.change(screen.getByPlaceholderText("auth.password.placeholder"), {
      target: { value: "wrong" },
    });

    fireEvent.click(screen.getByRole("button", { name: "auth.password.submitButton" }));

    await waitFor(() => {
      expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
    });
  });
});
