import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import BizSdkTemplates from "../BizSdkTemplates";
import { buildGoSdkTemplate, buildTsSdkTemplate } from "../bizSdkTemplates";

vi.mock("../../i18n", () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: "en", setLocale: () => {} }),
}));

const params = { endpoint: "https://auth.example.com", appId: "org/my app", displayName: "My App" };

describe("SDK templates", () => {
  it("Go template substitutes placeholders and uses version polling with full-fetch fallback", () => {
    const go = buildGoSdkTemplate(params);
    expect(go).toContain('Endpoint = "https://auth.example.com"');
    expect(go).toContain('AppID    = "org/my app"');
    expect(go).not.toContain("__");
    expect(go).toContain("/api/biz-get-policy-version");
    expect(go).toContain("/api/biz-get-policies");
    expect(go).toContain("/api/biz-watch-policies"); // mentioned as optional
    expect(go).toContain("time.NewTicker");
  });

  it("TS template substitutes placeholders and uses version polling with full-fetch fallback", () => {
    const ts = buildTsSdkTemplate(params);
    expect(ts).toContain('const ENDPOINT = "https://auth.example.com"');
    expect(ts).toContain('const APP_ID = "org/my app"');
    expect(ts).not.toContain("__");
    expect(ts).toContain("/api/biz-get-policy-version");
    expect(ts).toContain("/api/biz-get-policies");
    expect(ts).toContain("setInterval");
  });

  it("falls back to the appId when displayName is missing", () => {
    expect(buildGoSdkTemplate({ endpoint: "e", appId: "o/a" })).toContain("Go SDK: o/a");
  });
});

describe("BizSdkTemplates", () => {
  it("shows Go by default and switches to TypeScript", () => {
    render(<BizSdkTemplates {...params} />);
    expect(screen.getByText(/package bizauth/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "TypeScript" }));
    expect(screen.getByText(/class BizAuthClient/)).toBeInTheDocument();
    expect(screen.queryByText(/package bizauth/)).toBeNull();
  });

  it("copies the active template", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const onCopied = vi.fn();
    render(<BizSdkTemplates {...params} onCopied={onCopied} />);
    fireEvent.click(screen.getByLabelText("authz.integration.sdk.copy"));
    await vi.waitFor(() => expect(onCopied).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).toContain("package bizauth");
  });
});
