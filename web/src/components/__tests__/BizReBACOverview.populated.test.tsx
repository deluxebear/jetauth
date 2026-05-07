import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import BizReBACOverview from "../BizReBACOverview";
import * as BizBackend from "../../backend/BizBackend";

vi.mock("../../backend/BizBackend");
vi.mock("../../i18n", () => ({
  useTranslation: () => ({
    t: (k: string) => k,
  }),
}));
vi.mock("../Modal", () => ({
  useModal: () => ({ toast: vi.fn(), showConfirm: vi.fn() }),
}));

describe("BizReBACOverview (populated)", () => {
  it("renders four hero stats and both info cards when stats are present", async () => {
    vi.mocked(BizBackend.getBizReBACStats).mockResolvedValue({
      status: "ok",
      data: {
        tupleCount: 482910,
        todayDelta: 1284,
        checkQpsLastHour: 5112,
        modelCount: 7,
        activeModelId: "model-7",
        lastUpdated: new Date().toISOString(),
        typeDistribution: [
          { type: "document", count: 232000 },
          { type: "folder", count: 135000 },
        ],
        recentWrites: [
          {
            op: "write",
            user: "user:carol",
            relation: "viewer",
            object: "document:roadmap-2026",
            at: new Date().toISOString(),
          },
        ],
      },
    } as any);
    vi.mocked(BizBackend.getBizAuthorizationModel).mockResolvedValue({
      status: "ok",
      data: {
        id: "model-7",
        owner: "admin",
        appName: "drive_prod",
        schemaDsl: "model\n  schema 1.1\n\ntype user\n",
        schemaJson: JSON.stringify({ schema_version: "1.1", type_definitions: [{ type: "user", relations: {}, metadata: null }] }),
        schemaHash: "abc",
        createdTime: new Date().toISOString(),
        createdBy: "test-user",
      },
    } as any);

    vi.mocked(BizBackend.listBizAssertions).mockResolvedValue({
      status: "ok",
      data: [
        { id: "a1", lastActual: true,  expected: true,  owner: "admin", appName: "drive_prod", object: "document:r1", relation: "viewer", user: "user:alice", createdTime: new Date().toISOString() },
        { id: "a2", lastActual: false, expected: true,  owner: "admin", appName: "drive_prod", object: "document:r1", relation: "viewer", user: "user:bob",   createdTime: new Date().toISOString() },
      ],
    } as any);

    render(<BizReBACOverview appId="admin/drive_prod" />);
    await waitFor(() => {
      expect(screen.getAllByText(/482,910/).length).toBeGreaterThanOrEqual(1);
    });
    // Hero tiles: v7 (active model)
    expect(screen.getByText(/v7/)).toBeInTheDocument();
    // Recent writes card present
    expect(screen.getByText(/carol/)).toBeInTheDocument();
    expect(screen.getByText(/roadmap-2026/)).toBeInTheDocument();
    // Type distribution card present
    expect(screen.getByText("document")).toBeInTheDocument();
    expect(screen.getByText("folder")).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();
  });
});
