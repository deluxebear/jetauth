import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import BizReBACTester from "../BizReBACTester";
import * as BizBackend from "../../backend/BizBackend";

vi.mock("../../backend/BizBackend");
vi.mock("../Modal", () => ({
  useModal: () => ({
    toast: vi.fn(),
    showConfirm: vi.fn(),
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showInfo: vi.fn(),
    prompt: vi.fn(),
  }),
}));
vi.mock("../../i18n", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    locale: "en",
    setLocale: () => {},
  }),
}));
vi.mock("../BizDecisionPathGraph", () => ({ default: () => null }));

describe("BizReBACTester shortcut + mode toggle", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("⌘+Enter on window triggers bizCheck when form is valid", async () => {
    vi.mocked(BizBackend.bizCheck).mockResolvedValue({
      status: "ok",
      data: { allowed: true, resolution: "direct" },
    } as any);
    vi.mocked(BizBackend.bizExpand).mockResolvedValue({
      status: "ok",
      data: { root: { kind: "leaf", users: ["user:alice"] } },
    } as any);

    render(<BizReBACTester appId="admin/app" />);

    // Fill the three required fields using React's native input setter
    // so React's synthetic onChange fires and state updates correctly
    // (avoids importing fireEvent which triggers heap issues with this component).
    function setInputValue(el: HTMLElement, value: string) {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set;
      nativeSetter?.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }

    setInputValue(screen.getByPlaceholderText("user:alice"), "user:alice");
    setInputValue(screen.getByPlaceholderText("document:d1"), "document:d1");
    setInputValue(screen.getByPlaceholderText("viewer"), "viewer");

    // Wait for formValid to make the shortcut do something.
    await waitFor(() => {
      const runBtn = screen.getByText("rebac.tester.run");
      expect((runBtn as HTMLButtonElement).disabled).toBe(false);
    }, { timeout: 2000 });

    // Fire Cmd+Enter on window — the component's keydown handler is attached to window.
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true })
    );

    await waitFor(() => {
      expect(BizBackend.bizCheck).toHaveBeenCalled();
    }, { timeout: 3000 });
  });

  it("Switching to list-objects mode and running calls bizListObjects", async () => {
    vi.mocked(BizBackend.bizListObjects).mockResolvedValue({
      status: "ok",
      data: { objects: ["document:d1", "document:d2"] },
    } as any);

    render(<BizReBACTester appId="admin/app" />);

    // Click the "list-objects" operation pill and wait for the UI to update.
    screen.getByText("list-objects").click();
    // The placeholder for the object input changes when mode switches to "list-objects".
    await waitFor(() => {
      expect(screen.getByPlaceholderText("document")).toBeInTheDocument();
    }, { timeout: 2000 });

    // Fill form fields using React's native input setter so synthetic
    // onChange fires and state updates correctly.
    function setInputValue(el: HTMLElement, value: string) {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set;
      nativeSetter?.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }

    setInputValue(screen.getByPlaceholderText("user:alice"), "user:alice");
    setInputValue(screen.getByPlaceholderText("document"), "document");
    setInputValue(screen.getByPlaceholderText("viewer"), "viewer");

    // Wait for formValid to enable the run button.
    await waitFor(() => {
      const runBtn = screen.getByText("rebac.tester.run");
      expect((runBtn as HTMLButtonElement).disabled).toBe(false);
    }, { timeout: 2000 });

    screen.getByText("rebac.tester.run").click();

    await waitFor(() => {
      expect(BizBackend.bizListObjects).toHaveBeenCalledWith(
        expect.objectContaining({
          appId: "admin/app",
          objectType: "document",
          relation: "viewer",
          user: "user:alice",
        })
      );
    }, { timeout: 3000 });
  });
});
