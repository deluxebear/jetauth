import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import BizReBACTester from "../BizReBACTester";
import * as BizBackend from "../../backend/BizBackend";
import type { ApiResponse } from "../../backend/request";
import type { BizCheckResponse } from "../../backend/BizBackend";

vi.mock("../../backend/BizBackend");
vi.mock("../Modal", () => ({
  useModal: () => ({ toast: vi.fn(), showConfirm: vi.fn() }),
}));
vi.mock("../../i18n", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

describe("ReBAC a11y smoke", () => {
  it("Tester history-toggle button has an accessible name", () => {
    vi.mocked(BizBackend.bizCheck).mockResolvedValue({ status: "ok" } as ApiResponse<BizCheckResponse>);
    render(<BizReBACTester appId="o/a" />);
    const historyBtn = screen.getByRole("button", { name: /recent|history|最近/i });
    expect(historyBtn).toBeInTheDocument();
  });

  it("Tester run button has an accessible name and visible focus ring class", () => {
    render(<BizReBACTester appId="o/a" />);
    const runBtn = screen.getByRole("button", { name: /check|测试|验证/i });
    expect(runBtn.className).toMatch(/focus-visible:ring-2/);
  });
});
