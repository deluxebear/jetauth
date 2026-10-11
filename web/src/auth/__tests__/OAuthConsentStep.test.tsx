import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import OAuthConsentStep from "../OAuthConsentStep";
import { buildOAuthErrorRedirectUrl, isConsentRequired } from "../authPost";

vi.mock("../../i18n", () => ({
  useTranslation: () => ({ t: (k: string) => k, locale: "en", setLocale: vi.fn(), locales: [] }),
}));

vi.mock("../../theme", () => ({
  useTheme: () => ({ theme: "light", toggle: vi.fn(), applyOrgTheme: vi.fn(), clearOrgTheme: vi.fn() }),
}));

const mockPost = vi.fn();
vi.mock("../../api/client", () => ({
  api: { post: (...args: unknown[]) => mockPost(...args) },
}));

const application = {
  name: "notes",
  displayName: "Notes",
  logo: "",
  customScopes: [
    { scope: "files:read", displayName: "Read your files", description: "List and download files" },
    { scope: "files:write", displayName: "Change your files" },
    { scope: "admin:all", displayName: "Not requested" },
  ],
};

const params = new URLSearchParams({
  client_id: "cid-123",
  redirect_uri: "https://client.example/cb",
  response_type: "code",
  scope: "openid files:read files:write",
  state: "xyz",
  code_challenge: "chal",
});

describe("OAuthConsentStep", () => {
  let replaceSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    mockPost.mockReset();
    replaceSpy = vi.fn();
    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...window.location, replace: replaceSpy },
    });
  });

  it("lists only the custom scopes this request asks for", () => {
    render(<OAuthConsentStep application={application} searchParams={params} />);
    expect(screen.getByText("Read your files")).toBeInTheDocument();
    expect(screen.getByText("List and download files")).toBeInTheDocument();
    expect(screen.getByText("Change your files")).toBeInTheDocument();
    expect(screen.queryByText("Not requested")).toBeNull();
  });

  it("grants the requested scopes and redirects with the code", async () => {
    mockPost.mockResolvedValueOnce({ status: "ok", data: "code-abc" });
    render(<OAuthConsentStep application={application} searchParams={params} />);
    fireEvent.click(screen.getByRole("button", { name: "oauth.consent.allow" }));

    await waitFor(() => expect(replaceSpy).toHaveBeenCalledWith("https://client.example/cb?code=code-abc&state=xyz"));
    const [url, body] = mockPost.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe("/api/grant-consent");
    expect(body).toMatchObject({
      application: "admin/notes",
      grantedScopes: ["files:read", "files:write"],
      clientId: "cid-123",
      redirectUri: "https://client.example/cb",
      scope: "openid files:read files:write",
      state: "xyz",
      challenge: "chal",
    });
  });

  it("shows the server error and stays on the page when granting fails", async () => {
    mockPost.mockResolvedValueOnce({ status: "error", msg: "Please login first" });
    render(<OAuthConsentStep application={application} searchParams={params} />);
    fireEvent.click(screen.getByRole("button", { name: "oauth.consent.allow" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Please login first"));
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it("denies by redirecting back with access_denied", () => {
    render(<OAuthConsentStep application={application} searchParams={params} />);
    fireEvent.click(screen.getByRole("button", { name: "oauth.consent.deny" }));
    expect(replaceSpy).toHaveBeenCalledWith("https://client.example/cb?error=access_denied&state=xyz");
    expect(mockPost).not.toHaveBeenCalled();
  });
});

describe("consent helpers", () => {
  it("detects the consent-required login response", () => {
    expect(isConsentRequired({ data: { required: true } })).toBe(true);
    expect(isConsentRequired({ data: "a-code" })).toBe(false);
    expect(isConsentRequired({ data: null })).toBe(false);
    expect(isConsentRequired({})).toBe(false);
  });

  it("builds error redirects that keep existing query params", () => {
    expect(buildOAuthErrorRedirectUrl("https://c/cb?x=1", "access_denied", "")).toBe("https://c/cb?x=1&error=access_denied");
  });
});
