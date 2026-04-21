import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PasswordForm from "../signin/PasswordForm";

vi.mock("../../i18n", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

describe("PasswordForm", () => {
  it("calls onSubmit with the password", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <PasswordForm
        identifier="alice@example.com"
        userHint="a***@example.com"
        onSubmit={onSubmit}
        onBack={vi.fn()}
      />
    );

    const pwInput = screen.getByPlaceholderText("auth.password.placeholder");
    fireEvent.change(pwInput, { target: { value: "secret123" } });
    fireEvent.click(screen.getByRole("button", { name: "auth.password.submitButton" }));

    // PasswordForm passes a second `extras` arg (undefined when showRememberMe is off).
    await waitFor(() =>
      expect(onSubmit.mock.calls[0]?.[0]).toBe("secret123"),
    );
  });

  it("shows user hint when provided", () => {
    render(
      <PasswordForm
        identifier="alice"
        userHint="a***@example.com"
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />
    );
    expect(screen.getByText(/a\*\*\*@example\.com/)).toBeInTheDocument();
  });

  it("falls back to raw identifier when no hint", () => {
    render(<PasswordForm identifier="charlie" onSubmit={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText("charlie")).toBeInTheDocument();
  });

  it("toggles password visibility on eye click", () => {
    render(<PasswordForm identifier="x" onSubmit={vi.fn()} onBack={vi.fn()} />);
    const pwInput = screen.getByPlaceholderText("auth.password.placeholder") as HTMLInputElement;
    expect(pwInput.type).toBe("password");
    const toggle = screen.getByLabelText("auth.password.showPassword");
    fireEvent.click(toggle);
    expect(pwInput.type).toBe("text");
  });

  it("invokes onBack when back button clicked", () => {
    const onBack = vi.fn();
    render(<PasswordForm identifier="x" onSubmit={vi.fn()} onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: "auth.password.backButton" }));
    expect(onBack).toHaveBeenCalled();
  });

  it("displays error prop", () => {
    render(
      <PasswordForm
        identifier="x"
        onSubmit={vi.fn()}
        onBack={vi.fn()}
        error="wrong password"
      />
    );
    expect(screen.getByText("wrong password")).toBeInTheDocument();
  });
});
