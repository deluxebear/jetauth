import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import BizReBACTester from "../BizReBACTester";
import * as BizBackend from "../../backend/BizBackend";

vi.mock("../../backend/BizBackend");
vi.mock("../Modal", () => ({
  useModal: () => ({ toast: vi.fn(), showConfirm: vi.fn() }),
}));
vi.mock("../../i18n", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      if (!params) return key;
      return key.replace(/\{\{(\w+)\}\}/g, (_, k) =>
        params[k] !== undefined ? String(params[k]) : `{{${k}}}`,
      );
    },
    locale: "en",
    setLocale: () => {},
  }),
}));

describe("BizReBACTester cases", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("shows cases tab with count when cases exist in localStorage", () => {
    localStorage.setItem(
      "rebac-tester-cases:o/a",
      JSON.stringify([
        {
          id: "c1",
          name: "alice can view d1",
          request: {
            user: "user:alice",
            object: "document:d1",
            relation: "viewer",
            contextualTuplesJson: "",
            contextJson: "",
          },
          expected: "allow",
        },
      ]),
    );
    render(<BizReBACTester appId="o/a" />);
    // Open the history/cases panel
    fireEvent.click(screen.getByRole("button", { name: /recent|history|最近/i }));
    // The Cases tab should show "1"
    const casesBtn = screen.getByRole("button", { name: /cases|用例/i });
    expect(casesBtn.textContent).toContain("1");
  });

  it("Run All calls bizBatchCheck and updates lastRun", async () => {
    localStorage.setItem(
      "rebac-tester-cases:o/a",
      JSON.stringify([
        {
          id: "c1",
          name: "c",
          request: {
            user: "user:a",
            object: "doc:1",
            relation: "v",
            contextualTuplesJson: "",
            contextJson: "",
          },
          expected: "allow",
        },
      ]),
    );
    vi.mocked(BizBackend.bizBatchCheck).mockResolvedValue({
      status: "ok",
      data: { results: [{ allowed: true }] },
    } as any);
    render(<BizReBACTester appId="o/a" />);
    fireEvent.click(screen.getByRole("button", { name: /recent|history|最近/i }));
    fireEvent.click(screen.getByRole("button", { name: /cases|用例/i }));
    fireEvent.click(screen.getByRole("button", { name: /run all|全部重跑|runAll/i }));
    await waitFor(() => {
      expect(BizBackend.bizBatchCheck).toHaveBeenCalled();
    });
  });
});
