import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import OrgChoiceWidget from "../shell/OrgChoiceWidget";

vi.mock("../../i18n", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

describe("OrgChoiceWidget", () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...window.location, href: "" },
    });
  });

  it("renders nothing for None mode", () => {
    const { container } = render(<OrgChoiceWidget mode="None" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when undefined mode", () => {
    const { container } = render(<OrgChoiceWidget mode={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when URL already has an org", () => {
    const { container } = render(<OrgChoiceWidget mode="Input" currentOrg="jetems" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders Input mode input + remember checkbox", () => {
    render(<OrgChoiceWidget mode="Input" currentOrg="built-in" />);
    expect(screen.getByPlaceholderText("auth.org.selectPrompt")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("Select mode falls back to plain input when no recent orgs", () => {
    render(<OrgChoiceWidget mode="Select" currentOrg="built-in" />);
    // No <option> elements because recent is empty; an <input> is rendered
    expect(screen.getByPlaceholderText("auth.org.selectPrompt")).toBeInTheDocument();
  });

  it("Select mode renders dropdown from localStorage recent orgs", () => {
    localStorage.setItem("jetauth.recentOrgs", JSON.stringify(["jetems", "acme"]));
    render(<OrgChoiceWidget mode="Select" currentOrg="built-in" />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "jetems" })).toBeInTheDocument();
  });

  it("Input mode submit navigates to /login/<value>", () => {
    render(<OrgChoiceWidget mode="Input" currentOrg="built-in" />);
    fireEvent.change(screen.getByPlaceholderText("auth.org.selectPrompt"), {
      target: { value: "acme" },
    });
    fireEvent.submit(screen.getByPlaceholderText("auth.org.selectPrompt").closest("form")!);
    expect(window.location.href).toBe("/login/acme");
  });

  it("Remember checkbox saves org to localStorage on submit", () => {
    render(<OrgChoiceWidget mode="Input" currentOrg="built-in" />);
    fireEvent.change(screen.getByPlaceholderText("auth.org.selectPrompt"), {
      target: { value: "acme" },
    });
    fireEvent.submit(screen.getByPlaceholderText("auth.org.selectPrompt").closest("form")!);
    const saved = JSON.parse(localStorage.getItem("jetauth.recentOrgs") ?? "[]");
    expect(saved).toContain("acme");
  });
});
