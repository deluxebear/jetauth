import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import BizReBACOverview from "../BizReBACOverview";
import * as BizBackend from "../../backend/BizBackend";
import type { ApiResponse } from "../../backend/request";
import type { BizAuthorizationModel } from "../../backend/BizBackend";

vi.mock("../../backend/BizBackend");
vi.mock("../../i18n", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock("../Modal", () => ({
  useModal: () => ({ toast: vi.fn(), showConfirm: vi.fn() }),
}));

describe("BizReBACOverview empty state", () => {
  it("renders 3 scenario template cards when app has no schema", async () => {
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

    render(<BizReBACOverview appId="o/a" />);

    await waitFor(() => {
      expect(
        screen.getAllByRole("button", { name: /apply template/i }),
      ).toHaveLength(3);
    });
  });
});
