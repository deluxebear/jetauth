import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TopBar from "../shell/TopBar";

const mockToggleTheme = vi.fn();
const mockSetLocale = vi.fn();

vi.mock("../../theme", () => ({
  useTheme: () => ({
    theme: "light",
    toggle: mockToggleTheme,
    applyOrgTheme: vi.fn(),
    clearOrgTheme: vi.fn(),
  }),
}));

vi.mock("../../i18n", () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    locale: "en",
    setLocale: mockSetLocale,
    locales: [
      { value: "en", label: "English" },
      { value: "zh", label: "简体中文" },
    ],
  }),
}));

describe("TopBar", () => {
  it("renders theme toggle and language button", () => {
    render(<TopBar />);
    expect(screen.getAllByRole("button").length).toBeGreaterThanOrEqual(2);
  });

  it("calls theme toggle on click", () => {
    render(<TopBar />);
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]); // theme toggle is first
    expect(mockToggleTheme).toHaveBeenCalled();
  });
});
