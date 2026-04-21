import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import BrandingLayer from "../shell/BrandingLayer";

describe("BrandingLayer", () => {
  it("renders org logo when provided", () => {
    render(
      <BrandingLayer
        logo="/logo.png"
        logoDark="/logo-dark.png"
        displayName="Acme Corp"
      />
    );
    const img = screen.getByAltText("Acme Corp");
    expect(img.getAttribute("src")).toBe("/logo.png");
  });

  it("falls back to display name when logo absent", () => {
    render(<BrandingLayer displayName="JetAuth" />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("JetAuth")).toBeInTheDocument();
  });

  it("applies dark logo when theme is dark", () => {
    render(
      <BrandingLayer
        logo="/logo.png"
        logoDark="/logo-dark.png"
        displayName="Acme"
        theme="dark"
      />
    );
    const img = screen.getByAltText("Acme");
    expect(img.getAttribute("src")).toBe("/logo-dark.png");
  });
});
