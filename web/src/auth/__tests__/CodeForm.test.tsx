import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import CodeForm from "../signin/CodeForm";

vi.mock("../../i18n", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

const mockPost = vi.fn();
vi.mock("../../api/client", () => ({
  api: { post: (...args: unknown[]) => mockPost(...args) },
}));

describe("CodeForm", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockPost.mockReset();
    mockPost.mockResolvedValue({ status: "ok" });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the 'Send code' button when not yet sent", () => {
    render(
      <CodeForm
        identifier="alice"
        destType="email"
        destValue="alice@example.com"
        application="app-built-in"
        organization="built-in"
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /auth\.code\.sendToEmail/ })).toBeInTheDocument();
  });

  it("calls send-verification-code on click, then shows the code input + countdown", async () => {
    render(
      <CodeForm
        identifier="alice"
        destType="email"
        destValue="alice@example.com"
        application="app-built-in"
        organization="built-in"
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /auth\.code\.sendToEmail/ }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    const [url, body] = mockPost.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe("/api/send-verification-code");
    expect(body.dest).toBe("alice@example.com");
    expect(body.type).toBe("email");

    // Code input appears
    await waitFor(() => {
      expect(screen.getByPlaceholderText("auth.code.codePlaceholder")).toBeInTheDocument();
    });

    // Resend is disabled with countdown
    const resendBtn = screen.getByRole("button", { name: /auth\.code\.resend/ });
    expect(resendBtn.hasAttribute("disabled")).toBe(true);
  });

  it("submits the code to onSubmit", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <CodeForm
        identifier="alice"
        destType="email"
        destValue="alice@example.com"
        application="app-built-in"
        organization="built-in"
        onSubmit={onSubmit}
        onBack={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /auth\.code\.sendToEmail/ }));
    await waitFor(() => screen.getByPlaceholderText("auth.code.codePlaceholder"));

    const input = screen.getByPlaceholderText("auth.code.codePlaceholder");
    fireEvent.change(input, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "auth.code.submit" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("123456"));
  });

  it("re-enables resend button after 60s countdown", async () => {
    render(
      <CodeForm
        identifier="alice"
        destType="email"
        destValue="alice@example.com"
        application="app-built-in"
        organization="built-in"
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /auth\.code\.sendToEmail/ }));
    await waitFor(() => screen.getByPlaceholderText("auth.code.codePlaceholder"));

    // Advance 60 seconds one tick at a time so React flushes between each
    for (let i = 0; i < 60; i++) {
      await act(async () => {
        vi.advanceTimersByTime(1_000);
      });
    }

    const resend = screen.getByRole("button", { name: /auth\.code\.resend/ });
    expect(resend.hasAttribute("disabled")).toBe(false);
  });

  it("invokes onBack when back button clicked", () => {
    const onBack = vi.fn();
    render(
      <CodeForm
        identifier="alice"
        destType="email"
        destValue="alice@example.com"
        application="app-built-in"
        organization="built-in"
        onSubmit={vi.fn()}
        onBack={onBack}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "auth.password.backButton" }));
    expect(onBack).toHaveBeenCalled();
  });

  it("displays error when send fails", async () => {
    mockPost.mockRejectedValueOnce(new Error("offline"));
    render(
      <CodeForm
        identifier="alice"
        destType="email"
        destValue="alice@example.com"
        application="app-built-in"
        organization="built-in"
        onSubmit={vi.fn()}
        onBack={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /auth\.code\.sendToEmail/ }));
    await waitFor(() => expect(screen.getByText(/offline|auth\.code\.sendError/)).toBeInTheDocument());
  });
});
