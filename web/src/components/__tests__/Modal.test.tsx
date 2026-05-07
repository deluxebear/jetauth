import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { ModalProvider, useModal } from "../Modal";

vi.mock("../../i18n", () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    locale: "en",
    setLocale: () => {},
  }),
}));

// Minimal host component that exposes prompt via a button
function PromptHost({
  opts,
  onResult,
}: {
  opts: Parameters<ReturnType<typeof useModal>["prompt"]>[0];
  onResult: (v: string | null) => void;
}) {
  const modal = useModal();
  return (
    <button
      onClick={async () => {
        const result = await modal.prompt(opts);
        onResult(result);
      }}
    >
      Open Prompt
    </button>
  );
}

function renderWithModal(
  opts: Parameters<ReturnType<typeof useModal>["prompt"]>[0],
  onResult: (v: string | null) => void,
) {
  return render(
    <ModalProvider>
      <PromptHost opts={opts} onResult={onResult} />
    </ModalProvider>,
  );
}

describe("modal.prompt", () => {
  it("resolves with the typed value on confirm", async () => {
    const results: (string | null)[] = [];
    renderWithModal({ title: "Enter value" }, (v) => results.push(v));

    fireEvent.click(screen.getByRole("button", { name: "Open Prompt" }));
    // Dialog should be visible
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Enter value")).toBeTruthy();

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "hello world" } });

    // Click the confirm button (not Cancel, not Close)
    const buttons = screen.getAllByRole("button");
    const confirmBtn = buttons.find(
      (b) => b.textContent && /confirm|ok/i.test(b.textContent) && !b.getAttribute("aria-label"),
    );
    expect(confirmBtn).toBeTruthy();
    fireEvent.click(confirmBtn!);

    await waitFor(() => {
      expect(results).toHaveLength(1);
      expect(results[0]).toBe("hello world");
    });
    // Dialog should be gone
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("resolves with null when Cancel is clicked", async () => {
    const results: (string | null)[] = [];
    renderWithModal({ title: "Enter value" }, (v) => results.push(v));

    fireEvent.click(screen.getByRole("button", { name: "Open Prompt" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "some text" } });
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() => {
      expect(results).toHaveLength(1);
      expect(results[0]).toBeNull();
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("resolves with null when the X close button is clicked", async () => {
    const results: (string | null)[] = [];
    renderWithModal({ title: "Close me" }, (v) => results.push(v));

    fireEvent.click(screen.getByRole("button", { name: "Open Prompt" }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => {
      expect(results).toHaveLength(1);
      expect(results[0]).toBeNull();
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("resolves with null on Escape key in the input", async () => {
    const results: (string | null)[] = [];
    renderWithModal({ title: "Press Escape" }, (v) => results.push(v));

    fireEvent.click(screen.getByRole("button", { name: "Open Prompt" }));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "partial input" } });
    fireEvent.keyDown(input, { key: "Escape" });

    await waitFor(() => {
      expect(results).toHaveLength(1);
      expect(results[0]).toBeNull();
    });
  });

  it("resolves on Enter key with the typed value", async () => {
    const results: (string | null)[] = [];
    renderWithModal({ title: "Press Enter" }, (v) => results.push(v));

    fireEvent.click(screen.getByRole("button", { name: "Open Prompt" }));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "fast confirm" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(results).toHaveLength(1);
      expect(results[0]).toBe("fast confirm");
    });
  });

  it("enforces maxLength and shows char counter", async () => {
    renderWithModal({ title: "Capped input", maxLength: 10 }, () => {});

    fireEvent.click(screen.getByRole("button", { name: "Open Prompt" }));
    const input = screen.getByRole("textbox") as HTMLInputElement;

    // Simulate typing 15 chars — the onChange handler slices to maxLength
    act(() => {
      fireEvent.change(input, { target: { value: "hello world!!" } });
    });

    // The input's value must not exceed 10 chars (sliced in handler)
    expect(input.value.length).toBeLessThanOrEqual(10);

    // Counter should be visible
    const counter = screen.getByText(/\/10$/);
    expect(counter).toBeTruthy();
  });

  it("does NOT show char counter when maxLength is not set", async () => {
    renderWithModal({ title: "No counter" }, () => {});

    fireEvent.click(screen.getByRole("button", { name: "Open Prompt" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "abc" } });

    // No counter text matching "N/..."
    expect(screen.queryByText(/\d+\/\d+/)).toBeNull();
  });

  it("pre-fills the input with defaultValue", async () => {
    renderWithModal({ title: "Pre-filled", defaultValue: "existing text" }, () => {});

    fireEvent.click(screen.getByRole("button", { name: "Open Prompt" }));
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("existing text");
  });

  it("shows message helper text when provided", async () => {
    renderWithModal({ title: "With message", message: "Helper hint here" }, () => {});

    fireEvent.click(screen.getByRole("button", { name: "Open Prompt" }));
    expect(screen.getByText("Helper hint here")).toBeTruthy();
  });

  it("uses custom confirmLabel and cancelLabel", async () => {
    renderWithModal(
      { title: "Custom labels", confirmLabel: "Publish", cancelLabel: "Discard" },
      () => {},
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Prompt" }));
    expect(screen.getByRole("button", { name: "Publish" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Discard" })).toBeTruthy();
  });
});
