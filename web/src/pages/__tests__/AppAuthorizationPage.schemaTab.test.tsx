/**
 * C4: schema-tab list ↔ detail URL routing test.
 *
 * Renders AppAuthorizationPage at ?tab=schema (no modelId).  The page should
 * show the BizSchemaVersionList; clicking a model row pushes &modelId=<id>
 * into the URL, which then renders BizSchemaEditor's back-link.
 */
import { render, screen, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AppAuthorizationPage from "../AppAuthorizationPage";
import * as BizBackend from "../../backend/BizBackend";

// ── Heavy-weight component stubs ──────────────────────────────────────────────
// Keep these stubs thin — they must accept any props the real component does
// so TypeScript is happy, but they render just enough to be queryable.
vi.mock("../../components/BizReBACOverview", () => ({ default: () => <div data-testid="stub-overview" /> }));
vi.mock("../../components/BizTupleManager", () => ({ default: () => <div data-testid="stub-tuples" /> }));
vi.mock("../../components/BizReBACBrowser", () => ({ default: () => <div data-testid="stub-browser" /> }));
vi.mock("../../components/BizReBACTester", () => ({ default: () => <div data-testid="stub-tester" /> }));
vi.mock("../../components/BizAssertionList", () => ({ default: () => <div data-testid="stub-assertions" /> }));
vi.mock("../../components/BizAuditList", () => ({ default: () => <div data-testid="stub-audit" /> }));
vi.mock("../../components/BizIntegrationTab", () => ({ default: () => <div data-testid="stub-integration" /> }));
vi.mock("../../components/BizAppResourceTab", () => ({ default: () => <div data-testid="stub-resources" /> }));
vi.mock("../../components/DataTable", () => ({
  default: () => <div data-testid="stub-datatable" />,
  useTablePrefs: () => ({ columns: [], setColumns: () => {} }),
  ColumnsMenu: () => null,
}));
vi.mock("../../components/BizSchemaEditor", () => ({
  default: ({ onBack }: { onBack?: () => void }) => (
    <div data-testid="stub-schema-editor">
      <button onClick={onBack}>← rebac.schema.back</button>
    </div>
  ),
}));

// ── Backend mocks ─────────────────────────────────────────────────────────────
vi.mock("../../backend/BizBackend");
vi.mock("../../backend/ApplicationBackend", () => ({
  getApplication: () => Promise.resolve({ status: "ok", data: null }),
}));
vi.mock("../../utils/appIcon", () => ({ pickAppIcon: () => "" }));
vi.mock("../../utils/download", () => ({ downloadFile: vi.fn() }));

// ── i18n / Modal ──────────────────────────────────────────────────────────────
vi.mock("../../i18n", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock("../../components/Modal", () => ({
  useModal: () => ({ toast: vi.fn(), showConfirm: vi.fn(), prompt: vi.fn() }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderPage(initialUrl: string) {
  const qc = makeQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <Routes>
          <Route
            path="/authorization/:owner/:appName"
            element={<AppAuthorizationPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("AppAuthorizationPage — schema tab URL routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // App config — rebac model type so schema tab is shown.
    vi.mocked(BizBackend.getBizAppConfig).mockResolvedValue({
      status: "ok",
      data: {
        id: "admin/test_app",
        owner: "admin",
        appName: "test_app",
        displayName: "Test App",
        modelType: "rebac",
        currentAuthorizationModelId: "m7",
      } as any,
    });

    // Roles / permissions (sidebar counts).
    vi.mocked(BizBackend.getBizRoles).mockResolvedValue({ status: "ok", data: [] } as any);
    vi.mocked(BizBackend.getBizPermissions).mockResolvedValue({ status: "ok", data: [] } as any);

    // Schema version list — the row the test will click.
    vi.mocked(BizBackend.listBizAuthorizationModels).mockResolvedValue({
      status: "ok",
      data: [
        {
          id: "m7",
          owner: "admin",
          appName: "test_app",
          description: "v7 description",
          schemaHash: "h7",
          schemaDsl: "model\n  schema 1.1\n",
          schemaJson: "{}",
          createdTime: new Date().toISOString(),
          createdBy: "admin",
        },
      ],
    } as any);

    // Other ReBAC calls that are touched on mount — silent no-ops.
    vi.mocked(BizBackend.getBizReBACStats).mockResolvedValue({ status: "ok", data: null } as any);
    vi.mocked(BizBackend.getBizAuthorizationModel).mockResolvedValue({ status: "ok", data: null } as any);
  });

  it("renders schema version list when ?tab=schema and no modelId", async () => {
    renderPage("/authorization/admin/test_app?tab=schema");

    // BizSchemaVersionList renders version descriptions once loaded.
    await waitFor(
      () => expect(screen.getByText("v7 description")).toBeInTheDocument(),
      { timeout: 3000 },
    );

    // The detail editor must NOT be visible yet (no modelId in URL).
    expect(screen.queryByTestId("stub-schema-editor")).not.toBeInTheDocument();
  });

  it("clicking a model row navigates to detail (modelId in URL)", async () => {
    renderPage("/authorization/admin/test_app?tab=schema");

    // Wait for the version list to appear.
    await waitFor(
      () => expect(screen.getByText("v7 description")).toBeInTheDocument(),
      { timeout: 3000 },
    );

    // Click the row — BizSchemaVersionList calls onSelect(id) which sets
    // the modelId search param.
    await act(async () => {
      screen.getByText("v7 description").click();
    });

    // After the click the editor stub should be visible.
    await waitFor(
      () => expect(screen.getByTestId("stub-schema-editor")).toBeInTheDocument(),
      { timeout: 3000 },
    );
  });
});
