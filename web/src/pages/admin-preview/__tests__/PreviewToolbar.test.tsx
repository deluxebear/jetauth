import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PreviewToolbar from "../PreviewToolbar";

vi.mock("../../../i18n", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

describe("PreviewToolbar", () => {
  const defaultProps = {
    mode: "signin" as const,
    device: "desktop" as const,
    theme: "light" as const,
    onModeChange: vi.fn(),
    onDeviceChange: vi.fn(),
    onThemeChange: vi.fn(),
  };

  it("renders all three button groups", () => {
    render(<PreviewToolbar {...defaultProps} />);
    // 3 mode + 2 device + 2 theme = 7 buttons
    expect(screen.getAllByRole("button").length).toBe(7);
  });

  it("calls onModeChange when mode button clicked", () => {
    const onModeChange = vi.fn();
    render(<PreviewToolbar {...defaultProps} onModeChange={onModeChange} />);
    fireEvent.click(screen.getByText("adminPreview.mode.signup"));
    expect(onModeChange).toHaveBeenCalledWith("signup");
  });

  it("calls onDeviceChange when device button clicked", () => {
    const onDeviceChange = vi.fn();
    render(<PreviewToolbar {...defaultProps} onDeviceChange={onDeviceChange} />);
    fireEvent.click(screen.getByLabelText("adminPreview.device.mobile"));
    expect(onDeviceChange).toHaveBeenCalledWith("mobile");
  });

  it("calls onThemeChange when theme button clicked", () => {
    const onThemeChange = vi.fn();
    render(<PreviewToolbar {...defaultProps} onThemeChange={onThemeChange} />);
    fireEvent.click(screen.getByLabelText("Dark"));
    expect(onThemeChange).toHaveBeenCalledWith("dark");
  });

  it("highlights the active option in each group", () => {
    render(
      <PreviewToolbar
        {...defaultProps}
        mode="signup"
        device="mobile"
        theme="dark"
      />
    );
    const signupBtn = screen.getByText("adminPreview.mode.signup");
    expect(signupBtn.className).toContain("bg-accent");

    const mobileBtn = screen.getByLabelText("adminPreview.device.mobile");
    expect(mobileBtn.className).toContain("bg-accent");

    const darkBtn = screen.getByLabelText("Dark");
    expect(darkBtn.className).toContain("bg-accent");
  });
});
