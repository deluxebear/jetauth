import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import BizTupleManager from "../BizTupleManager";
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
vi.mock("../BizTupleBulkGrantWizard", () => ({ default: () => null }));

const SINGLE_TUPLE = {
  id: 1,
  owner: "admin",
  appName: "drive_prod",
  object: "document:d1",
  relation: "viewer",
  user: "user:alice",
  createdTime: new Date().toISOString(),
};

describe("BizTupleManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Schema not required for these tests.
    vi.mocked(BizBackend.getBizAuthorizationModel).mockResolvedValue({
      status: "ok",
      data: undefined,
    } as any);
  });

  it("switching facet to object_type and typing search prefix calls readBizTuples with object filter ending in ':'", async () => {
    const readSpy = vi.mocked(BizBackend.readBizTuples).mockResolvedValue({
      status: "ok",
      data: { tuples: [SINGLE_TUPLE], total: 1 },
    } as any);

    render(<BizTupleManager appId="admin/drive_prod" />);

    // Wait for initial load — at least one call.
    await waitFor(() => expect(readSpy).toHaveBeenCalled(), { timeout: 2000 });

    // Switch to object_type facet.
    screen.getByText("object_type").click();

    // Type "document" in the search box using React's native setter.
    const searchInput = screen.getByPlaceholderText("rebac.tuples.searchPlaceholder");
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;
    nativeSetter?.call(searchInput, "document");
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));

    // The component should call readBizTuples with object = "document:"
    // (the component appends ":" when facet === "object_type" and search doesn't end with ":").
    await waitFor(() => {
      const filteredCalls = readSpy.mock.calls.filter((args) => {
        const filter = args[1] as { object?: string };
        return filter?.object === "document:";
      });
      expect(filteredCalls.length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });

  it("pagination footer is hidden when total <= page limit", async () => {
    vi.mocked(BizBackend.readBizTuples).mockResolvedValue({
      status: "ok",
      // total = 1, which is <= 50 (PAGE_SIZE) → no pagination
      data: { tuples: [SINGLE_TUPLE], total: 1 },
    } as any);

    render(<BizTupleManager appId="admin/drive_prod" />);

    // Wait for data to render (the tuple row should appear).
    await waitFor(() => {
      expect(screen.getByText(/alice/)).toBeInTheDocument();
    }, { timeout: 3000 });

    // Pagination buttons (‹ and ›) should not be present.
    expect(screen.queryByText("‹")).not.toBeInTheDocument();
    expect(screen.queryByText("›")).not.toBeInTheDocument();
  });
});
