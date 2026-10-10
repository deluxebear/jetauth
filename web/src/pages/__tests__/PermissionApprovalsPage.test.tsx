import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const toast = vi.fn();
const prompt = vi.fn();
const refetch = vi.fn();

vi.mock("../../i18n", () => ({
  useTranslation: () => ({ t: (k: string) => k, locale: "en", setLocale: vi.fn(), locales: [] }),
}));

vi.mock("../../components/Modal", () => ({
  useModal: () => ({ toast, prompt, showConfirm: vi.fn() }),
}));

const pendingItems = [
  { owner: "org1", name: "perm-a", displayName: "A", resources: ["app1"], actions: ["Read"], submitter: "bob", createdTime: "2026-01-01T00:00:00Z", state: "Pending" },
];

vi.mock("../../hooks/useEntityList", () => ({
  useEntityList: () => ({
    items: pendingItems, total: 1, page: 1, pageSize: 10, loading: false, fetching: false,
    setPage: vi.fn(), setPageSize: vi.fn(), sortState: { field: "", order: "" }, filterState: { field: "", value: "" },
    handleSort: vi.fn(), handleFilter: vi.fn(), refetch,
  }),
}));

const approvePermission = vi.fn();
const rejectPermission = vi.fn();
const getPermissionsBySubmitter = vi.fn();

vi.mock("../../backend/PermissionBackend", () => ({
  getPendingPermissions: vi.fn(),
  getPermissionsBySubmitter: (...a: unknown[]) => getPermissionsBySubmitter(...a),
  approvePermission: (...a: unknown[]) => approvePermission(...a),
  rejectPermission: (...a: unknown[]) => rejectPermission(...a),
}));

import PermissionApprovalsPage from "../PermissionApprovalsPage";

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><PermissionApprovalsPage /></MemoryRouter>
    </QueryClientProvider>
  );
}

function setAccount(account: Record<string, unknown>) {
  localStorage.setItem("account", JSON.stringify(account));
}

describe("PermissionApprovalsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    approvePermission.mockResolvedValue({ status: "ok", msg: "", data: null });
    rejectPermission.mockResolvedValue({ status: "ok", msg: "", data: null });
    getPermissionsBySubmitter.mockResolvedValue({ status: "ok", msg: "", data: [] });
  });

  it("lets an org admin approve a pending permission", async () => {
    setAccount({ owner: "org1", name: "admin1", isAdmin: true });
    renderPage();
    const btn = screen.getByRole("button", { name: /permissions\.approve/ });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    await waitFor(() => expect(approvePermission).toHaveBeenCalledWith("org1", "perm-a"));
    expect(refetch).toHaveBeenCalled();
  });

  it("asks for a reason before rejecting", async () => {
    setAccount({ owner: "built-in", name: "admin" });
    prompt.mockResolvedValue("too broad");
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /permissions\.reject/ }));
    await waitFor(() => expect(rejectPermission).toHaveBeenCalledWith("org1", "perm-a", "too broad"));
  });

  it("does not reject when the prompt is cancelled", async () => {
    setAccount({ owner: "built-in", name: "admin" });
    prompt.mockResolvedValue(null);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /permissions\.reject/ }));
    await waitFor(() => expect(prompt).toHaveBeenCalled());
    expect(rejectPermission).not.toHaveBeenCalled();
  });

  it("disables approval controls for non-admins", () => {
    setAccount({ owner: "org1", name: "bob", isAdmin: false });
    renderPage();
    expect(screen.getByRole("button", { name: /permissions\.approve/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /permissions\.reject/ })).toBeDisabled();
  });

  it("disables approval for admins of a different organization", () => {
    setAccount({ owner: "org2", name: "admin2", isAdmin: true });
    renderPage();
    expect(screen.getByRole("button", { name: /permissions\.approve/ })).toBeDisabled();
  });

  it("loads my submissions on the second tab", async () => {
    setAccount({ owner: "org1", name: "bob" });
    getPermissionsBySubmitter.mockResolvedValue({
      status: "ok", msg: "",
      data: [{ owner: "org1", name: "mine-1", displayName: "", resources: [], actions: [], submitter: "bob", createdTime: "", state: "Rejected", rejectReason: "nope" }],
    });
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "permissions.approvals.mineTab" }));
    await waitFor(() => expect(screen.getByText("mine-1")).toBeInTheDocument());
    expect(screen.getByText("nope")).toBeInTheDocument();
  });
});
