import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AdminPreviewPane from "../AdminPreviewPane";
import type { AuthApplication } from "../../../auth/api/types";

vi.mock("../../../i18n", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

function mockApp(partial: Partial<AuthApplication>): AuthApplication {
  return {
    name: "app-test", organization: "admin", displayName: "Test",
    logo: "", favicon: "", title: "", homepageUrl: "",
    enablePassword: true, enableSignUp: true, enableGuestSignin: false,
    disableSignin: false, enableAutoSignin: false, enableCodeSignin: false,
    enableWebAuthn: false, orgChoiceMode: "None",
    formOffset: 2, formBackgroundUrl: "", formBackgroundUrlMobile: "",
    formCss: "", formCssMobile: "", formSideHtml: "",
    headerHtml: "", footerHtml: "", signinHtml: "", signupHtml: "",
    signinMethods: [], signupItems: [], signinItems: [],
    themeData: null, organizationObj: null,
    ...partial,
  };
}

describe("AdminPreviewPane", () => {
  it("renders the iframe with short preview=1 src", () => {
    const app = mockApp({ displayName: "Test" });
    const { container } = render(<AdminPreviewPane application={app} />);
    const iframe = container.querySelector("iframe");
    expect(iframe).not.toBeNull();
    const src = iframe!.getAttribute("src")!;
    // Short URL — config goes over postMessage, not the URL
    expect(src).toContain("preview=1");
    expect(src).not.toContain("previewConfig=");
  });

  it("changes src when mode toggle clicked", () => {
    const app = mockApp({ displayName: "Test" });
    const { container } = render(<AdminPreviewPane application={app} />);
    const iframe1Src = container.querySelector("iframe")!.getAttribute("src")!;
    expect(iframe1Src).toContain("/login/");

    fireEvent.click(screen.getByText("adminPreview.mode.signup"));
    const iframe2Src = container.querySelector("iframe")!.getAttribute("src")!;
    expect(iframe2Src).toContain("/signup/");
  });

  it("changes iframe width when device toggles", () => {
    const app = mockApp({});
    const { container } = render(<AdminPreviewPane application={app} />);
    const iframe = container.querySelector("iframe")!;
    expect(iframe.className).toContain("w-full");

    fireEvent.click(screen.getByLabelText("adminPreview.device.mobile"));
    const iframe2 = container.querySelector("iframe")!;
    expect(iframe2.className).toContain("w-[375px]");
  });

  it("shows a 'Show preview' button when initiallyCollapsed", () => {
    render(<AdminPreviewPane application={mockApp({})} initiallyCollapsed />);
    expect(screen.getByText("Show live preview")).toBeInTheDocument();
  });

  it("expands on 'Show preview' click", () => {
    const { container } = render(<AdminPreviewPane application={mockApp({})} initiallyCollapsed />);
    fireEvent.click(screen.getByText("Show live preview"));
    expect(container.querySelector("iframe")).not.toBeNull();
  });
});
