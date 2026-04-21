import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import WebAuthnForm from "../signin/WebAuthnForm";

// Mock i18n
vi.mock("../../i18n", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

// Mock @simplewebauthn/browser
const mockStartAuthentication = vi.fn();
vi.mock("@simplewebauthn/browser", () => ({
  startAuthentication: (...args: unknown[]) => mockStartAuthentication(...args),
}));

// Mock API client
const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
vi.mock("../../api/client", () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
  },
}));

const defaultProps = {
  identifier: "alice@example.com",
  userHint: "a***@example.com",
  application: "myapp",
  organization: "myorg",
  onSuccess: vi.fn(),
  onBack: vi.fn(),
};

describe("WebAuthnForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: browser supports WebAuthn
    Object.defineProperty(window, "PublicKeyCredential", {
      value: function PublicKeyCredential() {},
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    // Reset PublicKeyCredential
    Object.defineProperty(window, "PublicKeyCredential", {
      value: undefined,
      configurable: true,
      writable: true,
    });
  });

  it("renders the Sign in with passkey button when supported", () => {
    render(<WebAuthnForm {...defaultProps} />);
    expect(
      screen.getByRole("button", { name: /auth\.webauthn\.button/i }),
    ).toBeInTheDocument();
  });

  it("click → calls startAuthentication → calls api.post finish → onSuccess", async () => {
    const fakeOptions = { challenge: "abc123" };
    const fakeAssertion = { id: "cred-id", response: {} };
    mockApiGet.mockResolvedValue(fakeOptions);
    mockStartAuthentication.mockResolvedValue(fakeAssertion);
    mockApiPost.mockResolvedValue({ status: "ok" });

    const onSuccess = vi.fn();
    render(<WebAuthnForm {...defaultProps} onSuccess={onSuccess} />);

    fireEvent.click(screen.getByRole("button", { name: /auth\.webauthn\.button/i }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());

    // Verify begin was called with org + identifier params
    expect(mockApiGet).toHaveBeenCalledWith(
      expect.stringContaining("/api/webauthn/signin/begin"),
    );
    expect(mockApiGet).toHaveBeenCalledWith(
      expect.stringContaining("owner=myorg"),
    );
    expect(mockApiGet).toHaveBeenCalledWith(
      expect.stringContaining("name=alice%40example.com"),
    );

    // Verify startAuthentication received the server options
    expect(mockStartAuthentication).toHaveBeenCalledWith(
      expect.objectContaining({ optionsJSON: fakeOptions }),
    );

    // Verify finish was called with assertion
    expect(mockApiPost).toHaveBeenCalledWith(
      "/api/webauthn/signin/finish",
      fakeAssertion,
    );
  });

  it("displays auth.webauthn.failed when flow throws an error", async () => {
    mockApiGet.mockRejectedValue(new Error("network error"));

    render(<WebAuthnForm {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /auth\.webauthn\.button/i }));

    await waitFor(() =>
      expect(screen.getByText("network error")).toBeInTheDocument(),
    );
  });

  it("shows unsupported message instead of button when PublicKeyCredential is unavailable", () => {
    // Remove WebAuthn support
    Object.defineProperty(window, "PublicKeyCredential", {
      value: undefined,
      configurable: true,
      writable: true,
    });

    render(<WebAuthnForm {...defaultProps} />);
    expect(screen.getByText("auth.webauthn.unsupported")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /auth\.webauthn\.button/i }),
    ).not.toBeInTheDocument();
  });

  it("calls onBack when back button is clicked", () => {
    const onBack = vi.fn();
    render(<WebAuthnForm {...defaultProps} onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: "auth.password.backButton" }));
    expect(onBack).toHaveBeenCalled();
  });
});
