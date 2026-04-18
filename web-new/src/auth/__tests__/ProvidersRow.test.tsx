import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ProvidersRow from "../signin/ProvidersRow";
import type { ResolvedProvider, AuthApplication } from "../api/types";

vi.mock("../../i18n", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

const mockApp = { name: "app-test", organization: "admin" } as AuthApplication;

function makeProvider(name: string, type = "GitHub"): ResolvedProvider {
  return {
    name,
    displayName: name,
    type,
    logoUrl: `/providers/${type.toLowerCase()}.svg`,
    clientId: `client-${name}`,
    prompted: false,
    canSignUp: true,
    rule: "",
  };
}

describe("ProvidersRow", () => {
  let assignSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    assignSpy = vi.fn();
    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...window.location, assign: assignSpy, origin: "http://localhost:7001" },
    });
  });

  it("renders nothing when providers is empty", () => {
    const { container } = render(<ProvidersRow application={mockApp} providers={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders one button per provider with correct logo", () => {
    const providers = [makeProvider("gh", "GitHub"), makeProvider("go", "Google")];
    render(<ProvidersRow application={mockApp} providers={providers} />);
    const imgs = screen.getAllByRole("img", { hidden: true });
    expect(imgs.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("gh")).toBeInTheDocument();
    expect(screen.getByText("go")).toBeInTheDocument();
  });

  it("navigates to OAuth URL on click", () => {
    const p = makeProvider("gh", "GitHub");
    render(<ProvidersRow application={mockApp} providers={[p]} />);
    fireEvent.click(screen.getByRole("button", { name: /gh/i }));
    expect(assignSpy).toHaveBeenCalledTimes(1);
    const url = assignSpy.mock.calls[0][0] as string;
    expect(url).toContain("/api/login/oauth/authorize/gh");
    expect(url).toContain("client_id=client-gh");
  });

  it("collapses providers beyond 3 into a More menu", () => {
    const providers = [
      makeProvider("p1"), makeProvider("p2"), makeProvider("p3"),
      makeProvider("p4"), makeProvider("p5"),
    ];
    render(<ProvidersRow application={mockApp} providers={providers} />);
    expect(screen.getByText("auth.providers.moreMenu (2)")).toBeInTheDocument();
    // First 3 are visible as direct buttons
    expect(screen.getByText("p1")).toBeInTheDocument();
    expect(screen.getByText("p2")).toBeInTheDocument();
    expect(screen.getByText("p3")).toBeInTheDocument();
  });
});
