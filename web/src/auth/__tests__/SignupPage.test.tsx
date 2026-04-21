import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SignupPage from "../signup/SignupPage";
import type { AuthApplication } from "../api/types";

// --- Mocks ---

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

const mockApiPost = vi.fn().mockResolvedValue({ status: "ok" });

vi.mock("../../api/client", () => ({
  api: {
    post: (...args: unknown[]) => mockApiPost(...args),
  },
}));

// Stub shell components to avoid deep render complexity
vi.mock("../shell/TopBar", () => ({
  default: () => <div data-testid="topbar" />,
}));

vi.mock("../shell/BrandingLayer", () => ({
  default: ({ displayName }: { displayName?: string }) => (
    <div data-testid="branding">{displayName}</div>
  ),
}));

// --- Helpers ---

function makeItem(
  name: string,
  type: string,
  required = true,
  label?: string
) {
  return {
    name,
    label: label ?? name,
    type,
    required,
    visible: true,
    prompted: false,
    customCss: "",
    placeholder: "",
    options: [] as string[],
    regex: "",
    rule: "",
  };
}

// --- Fixture ---

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
  signupItems: [
    makeItem("Email", "email"),
    makeItem("Password", "password"),
    makeItem("Confirm password", "confirm-password"),
    makeItem("Agreement", "agreement", true, "I agree to the {terms}"),
  ],
  signinItems: [],
  themeData: null,
  organizationObj: null,
};

function renderPage(app: AuthApplication = mockApp) {
  return render(
    <MemoryRouter>
      <SignupPage application={app} />
    </MemoryRouter>
  );
}

// --- Tests ---

describe("SignupPage", () => {
  beforeEach(() => {
    mockApiPost.mockReset();
    mockApiPost.mockResolvedValue({ status: "ok" });
  });

  it("renders first-step fields based on signupItems", () => {
    renderPage();

    // All 4 items fit in one step (≤ 6 required), so all should render on step 0
    const emailInput = document.querySelector("input[type='email']");
    expect(emailInput).not.toBeNull();

    // Password + Confirm password fields
    const pwdInputs = document.querySelectorAll("input[type='password']");
    expect(pwdInputs.length).toBeGreaterThanOrEqual(2);

    // Agreement checkbox
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("blocks Next when required field is empty and shows error", async () => {
    renderPage();

    // Submit the form directly (bypasses native HTML5 validation in JSDOM)
    const form = document.querySelector("form")!;
    fireEvent.submit(form);

    // Errors object will be non-empty, so api.post should NOT have been called.
    // validateCurrentStep sets errors → re-render shows error <p> elements.
    await waitFor(() => {
      // Error <p> elements have className "text-[12px] text-danger"
      const allPs = Array.from(document.querySelectorAll("p"));
      const errorPs = allPs.filter((p) =>
        p.className.includes("text-danger") ||
        p.textContent === "auth.signup.requiredError"
      );
      expect(errorPs.length).toBeGreaterThan(0);
    });

    // api.post should NOT have been called
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it("submits when all required fields are filled (single-step form)", async () => {
    renderPage();

    // Fill Email
    const emailInput = document.querySelector("input[type='email']") as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: "alice@example.com" } });

    // Fill Password (first password input)
    const pwdInputs = document.querySelectorAll("input[type='password']");
    fireEvent.change(pwdInputs[0], { target: { value: "Secret123!" } });

    // Fill Confirm password (second password input)
    fireEvent.change(pwdInputs[1], { target: { value: "Secret123!" } });

    // Check Agreement
    fireEvent.click(screen.getByRole("checkbox"));

    // Submit
    fireEvent.click(screen.getByRole("button", { name: /auth\.signup\.submitButton/i }));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(
        "/api/signup",
        expect.objectContaining({
          application: "app-test",
          organization: "admin",
          email: "alice@example.com",
          password: "Secret123!",
        })
      );
    });
  });

  it("advances to next step when schema has multiple steps", async () => {
    // 8 required items → autoSplitThreshold=6 → split into 2 steps (4 each)
    const multiStepApp: AuthApplication = {
      ...mockApp,
      signupItems: [
        makeItem("Email", "email"),
        makeItem("Password", "password"),
        makeItem("Confirm password", "confirm-password"),
        makeItem("First name", "text"),
        makeItem("Last name", "text"),
        makeItem("Phone", "phone"),
        makeItem("Affiliation", "text"),
        makeItem("Agreement", "agreement", true, "I agree to the {terms}"),
      ],
    };

    renderPage(multiStepApp);

    // Step indicator should appear (has multiple steps); t() returns key
    expect(screen.getByText(/auth\.signup\.stepOf/)).toBeInTheDocument();

    // "Next" button should be visible (not submit label yet)
    const nextBtn = screen.getByRole("button", { name: /auth\.signup\.nextButton/i });
    expect(nextBtn).toBeInTheDocument();

    // Fill step 1 fields (4 items in first half: Email, Password, Confirm, First name)
    const emailInput = document.querySelector("input[type='email']") as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: "bob@example.com" } });

    const pwdInputs = document.querySelectorAll("input[type='password']");
    fireEvent.change(pwdInputs[0], { target: { value: "Pass123!" } });
    fireEvent.change(pwdInputs[1], { target: { value: "Pass123!" } });

    // First name is a text input
    const allTextInputs = document.querySelectorAll("input[type='text']");
    if (allTextInputs[0]) {
      fireEvent.change(allTextInputs[0], { target: { value: "Bob" } });
    }

    // Click Next
    fireEvent.click(nextBtn);

    await waitFor(() => {
      // Back button appears → we've advanced to step 2
      expect(screen.getByRole("button", { name: /auth\.signup\.backButton/i })).toBeInTheDocument();
    });
  });

  it("goes back to step 1 when Back button is clicked on step 2", async () => {
    const multiStepApp: AuthApplication = {
      ...mockApp,
      signupItems: [
        makeItem("Email", "email"),
        makeItem("Password", "password"),
        makeItem("Confirm password", "confirm-password"),
        makeItem("First name", "text"),
        makeItem("Last name", "text"),
        makeItem("Phone", "phone"),
        makeItem("Affiliation", "text"),
        makeItem("Agreement", "agreement", true, "I agree to the {terms}"),
      ],
    };

    renderPage(multiStepApp);

    // Fill and advance to step 2
    const emailInput = document.querySelector("input[type='email']") as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: "carol@example.com" } });

    const pwdInputs = document.querySelectorAll("input[type='password']");
    fireEvent.change(pwdInputs[0], { target: { value: "Pass123!" } });
    fireEvent.change(pwdInputs[1], { target: { value: "Pass123!" } });

    const allTextInputs = document.querySelectorAll("input[type='text']");
    if (allTextInputs[0]) {
      fireEvent.change(allTextInputs[0], { target: { value: "Carol" } });
    }

    fireEvent.click(screen.getByRole("button", { name: /auth\.signup\.nextButton/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /auth\.signup\.backButton/i })).toBeInTheDocument();
    });

    // Click Back
    fireEvent.click(screen.getByRole("button", { name: /auth\.signup\.backButton/i }));

    await waitFor(() => {
      // Back button gone → we're on step 1 again
      expect(screen.queryByRole("button", { name: /auth\.signup\.backButton/i })).toBeNull();
      // Email input visible again
      const email = document.querySelector("input[type='email']");
      expect(email).not.toBeNull();
    });
  });

  it("shows global error when api returns non-ok status", async () => {
    mockApiPost.mockResolvedValue({ status: "error", msg: "Email already taken" });

    renderPage();

    // Fill all fields
    const emailInput = document.querySelector("input[type='email']") as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: "taken@example.com" } });

    const pwdInputs = document.querySelectorAll("input[type='password']");
    fireEvent.change(pwdInputs[0], { target: { value: "Secret123!" } });
    fireEvent.change(pwdInputs[1], { target: { value: "Secret123!" } });
    fireEvent.click(screen.getByRole("checkbox"));

    fireEvent.click(screen.getByRole("button", { name: /auth\.signup\.submitButton/i }));

    await waitFor(() => {
      expect(screen.getByText("Email already taken")).toBeInTheDocument();
    });
  });
});
