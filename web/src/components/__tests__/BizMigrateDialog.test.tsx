import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import BizMigrateDialog from "../BizMigrateDialog";
import * as BizBackend from "../../backend/BizBackend";

vi.mock("../../i18n", () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: "en", setLocale: () => {} }),
}));

vi.mock("../../backend/BizBackend", () => ({
  migrateBizFromPermission: vi.fn(),
}));

const counts = (create: number, update = 0, skip = 0, failed = 0) => ({ total: create + update + skip + failed, create, update, skip, failed });

const baseReport = (over: Partial<BizBackend.BizMigrationReport> = {}): BizBackend.BizMigrationReport => ({
  appId: "org/app", sourceOrganization: "org", onConflict: "skip", dryRun: true,
  roles: counts(2), permissions: counts(1, 0, 0, 1),
  memberAdds: 3, granteeAdds: 4, inheritanceAdds: 1,
  issues: [{ kind: "unmappable", entity: "permission", name: "p1", field: "domains", message: "domains ignored" }],
  applied: false, synced: false, policyCount: 0,
  ...over,
});

describe("BizMigrateDialog", () => {
  beforeEach(() => vi.mocked(BizBackend.migrateBizFromPermission).mockReset());

  it("requires a dry-run preview before import is enabled, then imports with the same policy", async () => {
    const onImported = vi.fn();
    vi.mocked(BizBackend.migrateBizFromPermission)
      .mockResolvedValueOnce({ status: "ok", msg: "", data: baseReport() })
      .mockResolvedValueOnce({ status: "ok", msg: "", data: baseReport({ dryRun: false, applied: true, synced: true }) });

    render(<BizMigrateDialog appId="org/app" onClose={vi.fn()} onImported={onImported} />);
    const confirm = screen.getByRole("button", { name: "bizMigrate.confirm" });
    expect(confirm).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "bizMigrate.preview" }));
    await screen.findByTestId("bizMigrateReport");
    expect(BizBackend.migrateBizFromPermission).toHaveBeenLastCalledWith("org/app", { dryRun: true, onConflict: "skip" });
    expect(screen.getByText(/domains ignored/)).toBeInTheDocument();
    expect(confirm).toBeEnabled();

    fireEvent.click(confirm);
    await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1));
    expect(BizBackend.migrateBizFromPermission).toHaveBeenLastCalledWith("org/app", { dryRun: false, onConflict: "skip" });
  });

  it("invalidates the preview when the conflict policy changes", async () => {
    vi.mocked(BizBackend.migrateBizFromPermission).mockResolvedValue({ status: "ok", msg: "", data: baseReport() });
    render(<BizMigrateDialog appId="org/app" onClose={vi.fn()} onImported={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "bizMigrate.preview" }));
    await screen.findByTestId("bizMigrateReport");

    fireEvent.click(screen.getByLabelText("bizMigrate.conflict.overwrite"));
    expect(screen.queryByTestId("bizMigrateReport")).toBeNull();
    expect(screen.getByRole("button", { name: "bizMigrate.confirm" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "bizMigrate.preview" }));
    await screen.findByTestId("bizMigrateReport");
    expect(BizBackend.migrateBizFromPermission).toHaveBeenLastCalledWith("org/app", { dryRun: true, onConflict: "overwrite" });
  });

  it("keeps import disabled when there is nothing to write and shows server errors", async () => {
    vi.mocked(BizBackend.migrateBizFromPermission)
      .mockResolvedValueOnce({ status: "ok", msg: "", data: baseReport({ roles: counts(0, 0, 2), permissions: counts(0), memberAdds: 0, granteeAdds: 0, inheritanceAdds: 0, issues: null }) })
      .mockResolvedValueOnce({ status: "error", msg: "boom", data: undefined as unknown as BizBackend.BizMigrationReport });
    render(<BizMigrateDialog appId="org/app" onClose={vi.fn()} onImported={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "bizMigrate.preview" }));
    await screen.findByText("bizMigrate.nothingToDo");
    expect(screen.getByText("bizMigrate.noIssues")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "bizMigrate.confirm" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "bizMigrate.preview" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("boom");
  });
});
