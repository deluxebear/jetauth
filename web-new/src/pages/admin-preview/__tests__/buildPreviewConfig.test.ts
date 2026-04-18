import { describe, it, expect } from "vitest";
import { buildPreviewConfig, encodePreviewConfig } from "../buildPreviewConfig";
import type { AuthApplication } from "../../../auth/api/types";

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

describe("buildPreviewConfig", () => {
  it("includes theme + layout fields", () => {
    const cfg = buildPreviewConfig(mockApp({ formOffset: 3, displayName: "Acme" }));
    expect(cfg.formOffset).toBe(3);
    expect(cfg.displayName).toBe("Acme");
  });

  it("excludes identity + secret fields", () => {
    const cfg = buildPreviewConfig(mockApp({}));
    expect("name" in cfg).toBe(false);
    expect("organization" in cfg).toBe(false);
    expect("clientSecret" in (cfg as Record<string, unknown>)).toBe(false);
  });
});

describe("encodePreviewConfig", () => {
  it("produces URL-safe base64 (no + / =)", () => {
    const enc = encodePreviewConfig(buildPreviewConfig(mockApp({ displayName: "Ácme 中文?" })));
    expect(enc).not.toMatch(/[+/=]/);
  });

  it("round-trips via atob + JSON.parse", () => {
    const cfg = buildPreviewConfig(mockApp({ displayName: "Round Trip" }));
    const enc = encodePreviewConfig(cfg);
    const b64 = enc.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = decodeURIComponent(escape(atob(b64)));
    expect(JSON.parse(decoded).displayName).toBe("Round Trip");
  });

  it("handles unicode without crashing", () => {
    const enc = encodePreviewConfig(buildPreviewConfig(mockApp({ displayName: "测试" })));
    expect(enc.length).toBeGreaterThan(0);
  });
});
