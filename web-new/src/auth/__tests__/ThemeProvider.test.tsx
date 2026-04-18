import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider, useAuthTheme } from "../ThemeProvider";

vi.mock("../api/getResolvedTheme", () => ({
  getResolvedTheme: vi.fn().mockResolvedValue({
    theme: {
      themeType: "default",
      colorPrimary: "#00FF00",
      colorCTA: "#FF8800",
      colorSuccess: "",
      colorDanger: "",
      colorWarning: "",
      darkColorPrimary: "#88FFBB",
      darkBackground: "#0F1117",
      borderRadius: 10,
      isCompact: false,
      isEnabled: true,
      fontFamily: "Inter",
      fontFamilyMono: "JetBrains Mono",
      spacingScale: 1,
    },
    css: ":root {\n  --color-primary: #00FF00;\n  --color-cta: #FF8800;\n}\n",
  }),
}));

function ProbeTheme() {
  const t = useAuthTheme();
  return <div data-testid="probe">{t?.colorPrimary ?? "loading"}</div>;
}

describe("ThemeProvider", () => {
  it("loads resolved theme and exposes it via useAuthTheme", async () => {
    render(
      <ThemeProvider appId="admin/app-test">
        <ProbeTheme />
      </ThemeProvider>
    );
    expect(screen.getByTestId("probe").textContent).toBe("loading");
    await waitFor(() => {
      expect(screen.getByTestId("probe").textContent).toBe("#00FF00");
    });
  });

  it("injects a <style> tag with the CSS payload", async () => {
    render(
      <ThemeProvider appId="admin/app-test">
        <div />
      </ThemeProvider>
    );
    await waitFor(() => {
      const style = document.querySelector("style[data-auth-theme]");
      expect(style?.textContent).toContain("--color-primary: #00FF00");
    });
  });

  it("gracefully returns null theme when the fetch fails", async () => {
    const { getResolvedTheme } = await import("../api/getResolvedTheme");
    vi.mocked(getResolvedTheme).mockRejectedValueOnce(new Error("network down"));

    render(
      <ThemeProvider appId="admin/app-test">
        <ProbeTheme />
      </ThemeProvider>
    );
    // Probe should stay "loading" (theme remains null) — no crash.
    await waitFor(() => {
      expect(screen.getByTestId("probe").textContent).toBe("loading");
    });
  });
});
