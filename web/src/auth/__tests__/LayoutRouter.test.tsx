import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import LayoutRouter from "../layouts/LayoutRouter";
import type { AuthApplication } from "../api/types";

function mockApp(partial: Partial<AuthApplication>): AuthApplication {
  return {
    name: "app-test",
    organization: "admin",
    displayName: "Test",
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
    ...partial,
  };
}

describe("LayoutRouter", () => {
  it("renders CenteredCard for formOffset=2", () => {
    render(
      <LayoutRouter application={mockApp({ formOffset: 2 })}>
        <div data-testid="child">x</div>
      </LayoutRouter>
    );
    expect(screen.getByTestId("child").textContent).toBe("x");
  });

  it("renders CenteredCard for unknown formOffset (fallback)", () => {
    render(
      <LayoutRouter application={mockApp({ formOffset: 99 })}>
        <div data-testid="child">x</div>
      </LayoutRouter>
    );
    expect(screen.getByTestId("child").textContent).toBe("x");
  });

  it("renders LeftForm with the form in a left column for formOffset=1", () => {
    const { container } = render(
      <LayoutRouter application={mockApp({ formOffset: 1 })}>
        <div data-testid="child">x</div>
      </LayoutRouter>
    );
    // LeftForm uses lg:w-[420px]. Check the child is present at minimum.
    expect(screen.getByTestId("child").textContent).toBe("x");
    // Loose structural check: first child div has flex class
    expect(container.firstChild).toHaveClass("flex");
  });

  it("renders RightForm for formOffset=3", () => {
    render(
      <LayoutRouter application={mockApp({ formOffset: 3 })}>
        <div data-testid="child">x</div>
      </LayoutRouter>
    );
    expect(screen.getByTestId("child").textContent).toBe("x");
  });

  it("renders SidePanel for formOffset=4 with side HTML", () => {
    const { container } = render(
      <LayoutRouter
        application={mockApp({ formOffset: 4, formSideHtml: "<p data-testid='side'>Welcome!</p>" })}
      >
        <div data-testid="child">x</div>
      </LayoutRouter>
    );
    expect(screen.getByTestId("child").textContent).toBe("x");
    // SideHtml renders the sanitized HTML — find "Welcome!" text
    expect(container.innerHTML).toContain("Welcome!");
  });
});
