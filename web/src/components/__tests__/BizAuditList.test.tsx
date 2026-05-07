import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import BizAuditList from "../BizAuditList";
import * as BizBackend from "../../backend/BizBackend";

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

describe("BizAuditList", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("renders write + delete events from listBizTupleAudit", async () => {
    vi.spyOn(BizBackend, "listBizTupleAudit").mockResolvedValue({
      status: "ok",
      data: {
        events: [
          { id: 1, owner: "admin", appName: "drive_prod", op: "write",
            object: "document:r1", relation: "viewer", user: "user:carol",
            actorUser: "admin", atTime: "2026-05-07T10:00:00Z" },
          { id: 2, owner: "admin", appName: "drive_prod", op: "delete",
            object: "document:r2", relation: "editor", user: "user:dave",
            actorUser: "admin", atTime: "2026-05-07T10:01:00Z" },
        ],
        offset: 0,
        limit: 50,
      },
    } as any);

    render(<BizAuditList appId="admin/drive_prod" />);
    await waitFor(() => expect(screen.getByText(/carol/)).toBeInTheDocument());
    expect(screen.getByText(/dave/)).toBeInTheDocument();
  });

  it("filter chip change triggers a new fetch", async () => {
    const spy = vi.spyOn(BizBackend, "listBizTupleAudit").mockResolvedValue({
      status: "ok",
      data: { events: [], offset: 0, limit: 50 },
    } as any);

    render(<BizAuditList appId="admin/drive_prod" />);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    // Initial call: no op filter (because filter === "all").
    expect(spy.mock.calls[0]?.[1]).toEqual({});

    // Click the "write" chip.
    fireEvent.click(screen.getByText(/^● write$|^write$/));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(spy.mock.calls[1]?.[1]).toEqual({ op: "write" });
  });
});
