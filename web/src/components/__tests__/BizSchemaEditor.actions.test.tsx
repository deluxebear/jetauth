import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import BizSchemaEditor from "../BizSchemaEditor";
import * as BizBackend from "../../backend/BizBackend";

vi.mock("../../backend/BizBackend");

vi.mock("../../i18n", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    locale: "en",
    setLocale: () => {},
  }),
}));

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

// Stub heavy sub-components to avoid CodeMirror/SVG heap pressure.
vi.mock("../BizSchemaDslEditor", () => ({
  default: () => <div data-testid="dsl-editor" />,
}));
vi.mock("../BizSchemaChangePlan", () => ({ default: () => null }));
vi.mock("../BizSchemaVisualEditor", () => ({ default: () => null }));
vi.mock("../BizSchemaTypeGraph", () => ({ default: () => null }));

const BASE_MODEL = {
  id: "m1",
  schemaDsl: "model\n  schema 1.1\n\ntype user\n",
  schemaJson: '{"schema_version":"1.1","type_definitions":[{"type":"user","relations":{}}]}',
  description: "v1",
  createdTime: "2026-05-01T00:00:00Z",
  createdBy: "admin",
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: dry-run returns "unchanged" so the debounce effect
  // settles quickly and doesn't accumulate micro-tasks.
  vi.mocked(BizBackend.saveBizAuthorizationModel).mockResolvedValue({
    status: "ok",
    data: { outcome: "unchanged" },
  } as any);
});

describe("BizSchemaEditor actions", () => {
  it("Validate button calls saveBizAuthorizationModel with dryRun:true", async () => {
    vi.mocked(BizBackend.getBizAuthorizationModel).mockResolvedValue({
      status: "ok",
      data: { ...BASE_MODEL, id: "m1" },
    } as any);
    vi.mocked(BizBackend.getBizAppConfig).mockResolvedValue({
      status: "ok",
      data: { currentAuthorizationModelId: "m9" },
    } as any);
    vi.mocked(BizBackend.listBizAuthorizationModels).mockResolvedValue({
      status: "ok",
      data: [BASE_MODEL],
    } as any);
    const saveSpy = vi.mocked(BizBackend.saveBizAuthorizationModel);

    render(<BizSchemaEditor appId="admin/app" modelId="m1" />);

    // Wait for the component to finish loading (header actions become visible).
    await waitFor(
      () => expect(screen.getByText("rebac.schema.validate")).toBeInTheDocument(),
      { timeout: 3000 }
    );

    // Click the Validate button (avoid importing fireEvent which triggers OOM
    // in this worker via a transitive heap spike with CodeMirror-adjacent deps).
    screen.getByText("rebac.schema.validate").click();

    await waitFor(() => {
      // handleValidate calls saveBizAuthorizationModel with dryRun: true.
      const dryRunCalls = saveSpy.mock.calls.filter(
        (args) => (args[2] as any)?.dryRun === true
      );
      expect(dryRunCalls.length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });

  it("Rollback button is hidden when modelId equals the active model id", async () => {
    // Both modelId and activeId are "m7" — this IS the active model.
    // The Rollback button should not appear.
    vi.mocked(BizBackend.getBizAuthorizationModel).mockResolvedValue({
      status: "ok",
      data: { ...BASE_MODEL, id: "m7" },
    } as any);
    vi.mocked(BizBackend.getBizAppConfig).mockResolvedValue({
      status: "ok",
      data: { currentAuthorizationModelId: "m7" },
    } as any);
    vi.mocked(BizBackend.listBizAuthorizationModels).mockResolvedValue({
      status: "ok",
      data: [BASE_MODEL],
    } as any);

    render(<BizSchemaEditor appId="admin/app" modelId="m7" mode="view" />);

    await waitFor(
      () => expect(screen.getByText("rebac.schema.validate")).toBeInTheDocument(),
      { timeout: 3000 }
    );

    expect(screen.queryByText("rebac.schema.rollback")).not.toBeInTheDocument();
  });
});
