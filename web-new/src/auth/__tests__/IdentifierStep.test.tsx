import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import IdentifierStep from "../signin/IdentifierStep";

vi.mock("../../i18n", () => ({
  useTranslation: () => ({ t: (k: string) => k, locale: "en", setLocale: vi.fn(), locales: [] }),
}));

describe("IdentifierStep", () => {
  it("calls onSubmit with the trimmed identifier", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<IdentifierStep onSubmit={onSubmit} />);

    const input = screen.getByPlaceholderText("auth.identifier.placeholder");
    fireEvent.change(input, { target: { value: "  alice@example.com  " } });

    const button = screen.getByRole("button", { name: "auth.identifier.continueButton" });
    fireEvent.click(button);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith("alice@example.com");
    });
  });

  it("disables the button when identifier is empty", () => {
    const onSubmit = vi.fn();
    render(<IdentifierStep onSubmit={onSubmit} />);
    const button = screen.getByRole("button", { name: "auth.identifier.continueButton" });
    expect(button.hasAttribute("disabled")).toBe(true);
  });

  it("shows loading state during async submit", async () => {
    let resolver: (() => void) | null = null;
    const onSubmit = vi.fn().mockReturnValue(new Promise<void>((r) => { resolver = r; }));
    render(<IdentifierStep onSubmit={onSubmit} />);

    const input = screen.getByPlaceholderText("auth.identifier.placeholder");
    fireEvent.change(input, { target: { value: "bob" } });
    fireEvent.click(screen.getByRole("button", { name: "auth.identifier.continueButton" }));

    await waitFor(() => {
      expect(screen.getByRole("button").hasAttribute("disabled")).toBe(true);
    });
    resolver?.();
  });

  it("displays error prop when provided", () => {
    render(<IdentifierStep onSubmit={vi.fn()} error="user not found" />);
    expect(screen.getByText("user not found")).toBeInTheDocument();
  });
});
