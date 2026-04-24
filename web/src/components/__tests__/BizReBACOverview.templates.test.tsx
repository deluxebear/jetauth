import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import BizReBACOverview from "../BizReBACOverview";
import * as BizBackend from "../../backend/BizBackend";
import type { ApiResponse } from "../../backend/request";
import type {
  BizAuthorizationModel,
  BizWriteTuplesResponse,
  SaveAuthorizationModelResult,
} from "../../backend/BizBackend";

vi.mock("../../backend/BizBackend");

// Mirror the real t() — returns key with {{param}} substitution so
// aria-label assertions using /apply template/i still match.
const mockT = (k: string, params?: Record<string, string | number>): string => {
  const translations: Record<string, string> = {
    "rebac.overview.applyTemplateLabel": "Apply template: {{name}}",
  };
  let str = translations[k] ?? k;
  if (params) {
    for (const [pk, pv] of Object.entries(params)) {
      str = str.replace(new RegExp(`\\{\\{${pk}\\}\\}`, "g"), String(pv));
    }
  }
  return str;
};

vi.mock("../../i18n", () => ({
  useTranslation: () => ({ t: mockT }),
}));
vi.mock("../Modal", () => ({
  useModal: () => ({ toast: vi.fn(), showConfirm: vi.fn() }),
}));

/** Shared setup for the "no schema" empty state */
function setupEmptyState() {
  vi.mocked(BizBackend.getBizAuthorizationModel).mockResolvedValue({
    status: "ok",
    msg: "",
    data: undefined as unknown as BizAuthorizationModel,
  } satisfies ApiResponse<BizAuthorizationModel>);
  vi.mocked(BizBackend.countBizTuples).mockResolvedValue({
    status: "ok",
    msg: "",
    data: { count: 0 },
  } satisfies ApiResponse<{ count: number }>);
  vi.mocked(BizBackend.listBizAuthorizationModels).mockResolvedValue({
    status: "ok",
    msg: "",
    data: [],
  } satisfies ApiResponse<BizAuthorizationModel[]>);
}

describe("BizReBACOverview empty state", () => {
  it("renders 3 scenario template cards when app has no schema", async () => {
    setupEmptyState();

    render(<BizReBACOverview appId="o/a" />);

    await waitFor(() => {
      expect(
        screen.getAllByRole("button", { name: /apply template/i }),
      ).toHaveLength(3);
    });
  });

  it("calls saveBizAuthorizationModel and writeBizTuples when a template is clicked", async () => {
    setupEmptyState();

    vi.mocked(BizBackend.saveBizAuthorizationModel).mockResolvedValue({
      status: "ok",
      msg: "",
      data: {
        outcome: "advanced",
        id: "m1",
        conflicts: [],
      } as unknown as SaveAuthorizationModelResult,
    } satisfies ApiResponse<SaveAuthorizationModelResult>);
    vi.mocked(BizBackend.writeBizTuples).mockResolvedValue({
      status: "ok",
      msg: "",
      data: { written: 1, deleted: 0 },
    } satisfies ApiResponse<BizWriteTuplesResponse>);

    render(<BizReBACOverview appId="o/a" />);

    // Wait for template cards to appear
    const buttons = await screen.findAllByRole("button", { name: /apply template/i });
    fireEvent.click(buttons[0]!);

    await waitFor(() => {
      expect(BizBackend.saveBizAuthorizationModel).toHaveBeenCalledWith(
        "o/a",
        expect.stringMatching(/\S+/), // non-empty DSL
      );
      expect(BizBackend.writeBizTuples).toHaveBeenCalledWith(
        expect.objectContaining({
          appId: "o/a",
          writes: expect.arrayContaining([expect.objectContaining({ object: expect.any(String) })]),
        }),
      );
    });

    // writes array must have at least one entry
    const writeCall = vi.mocked(BizBackend.writeBizTuples).mock.calls[0]![0];
    expect((writeCall as { writes: unknown[] }).writes.length).toBeGreaterThanOrEqual(1);
  });
});
