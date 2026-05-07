import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import BizAssertionList from "../BizAssertionList";
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

describe("BizAssertionList", () => {
  it("renders rows from listBizAssertions", async () => {
    vi.spyOn(BizBackend, "listBizAssertions").mockResolvedValue({
      status: "ok",
      data: [{
        id: "a1", owner: "admin", appName: "drive_prod",
        object: "document:r1", relation: "viewer", user: "user:carol",
        expected: true, createdTime: new Date().toISOString(),
      }],
    } as any);
    render(<BizAssertionList appId="admin/drive_prod" />);
    await waitFor(() => expect(screen.getByText(/carol/)).toBeInTheDocument());
  });

  it("runs all assertions and shows pass/fail counts", async () => {
    vi.spyOn(BizBackend, "listBizAssertions").mockResolvedValue({
      status: "ok",
      data: [{
        id: "a1", owner: "admin", appName: "drive_prod",
        object: "document:r1", relation: "viewer", user: "user:carol",
        expected: true, createdTime: new Date().toISOString(),
      } as any],
    } as any);
    vi.spyOn(BizBackend, "runBizAssertions").mockResolvedValue({
      status: "ok",
      data: [{
        id: "a1", object: "document:r1", relation: "viewer",
        user: "user:carol", expected: true, actual: true, pass: true,
      }],
    } as any);
    render(<BizAssertionList appId="admin/drive_prod" />);
    await waitFor(() => expect(screen.getByText(/carol/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/runAll/));
    await waitFor(() => expect(screen.getByLabelText(/pass/)).toBeInTheDocument());
  });
});
