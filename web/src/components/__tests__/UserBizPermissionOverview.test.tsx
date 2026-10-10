import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import UserBizPermissionOverview from "../UserBizPermissionOverview";
import * as BizBackend from "../../backend/BizBackend";

vi.mock("../../backend/BizBackend");
vi.mock("../../i18n", () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: "en", setLocale: () => {} }),
}));

const cfg = (appName: string, modelType: "casbin" | "rebac" = "casbin") =>
  ({ owner: "org", appName, displayName: appName, modelType }) as unknown as BizBackend.BizAppConfig;

const ok = <T,>(data: T) => ({ status: "ok" as const, msg: "", data });

function renderIt() {
  return render(
    <MemoryRouter>
      <UserBizPermissionOverview userOwner="org" userName="alice" />
    </MemoryRouter>,
  );
}

describe("UserBizPermissionOverview", () => {
  beforeEach(() => vi.resetAllMocks());

  it("lists roles, resources and actions for a casbin app", async () => {
    vi.mocked(BizBackend.getBizAppConfigs).mockResolvedValue(ok([cfg("crm")]));
    vi.mocked(BizBackend.bizGetUserPermissions).mockResolvedValue(
      ok({ roles: ["org/editor"], allowedResources: ["/orders/*"], allowedActions: ["read"], properties: {} }),
    );
    renderIt();
    await waitFor(() => expect(screen.getByText("editor")).toBeInTheDocument());
    expect(screen.getByText("/orders/*")).toBeInTheDocument();
    expect(screen.getByText("read")).toBeInTheDocument();
    expect(BizBackend.bizGetUserPermissions).toHaveBeenCalledWith("org/crm", "org/alice");
  });

  it("skips ReBAC apps without calling the permission endpoint", async () => {
    vi.mocked(BizBackend.getBizAppConfigs).mockResolvedValue(ok([cfg("graph", "rebac")]));
    renderIt();
    await waitFor(() => expect(screen.getByText("authz.userBizPerms.rebacNotSupported")).toBeInTheDocument());
    expect(BizBackend.bizGetUserPermissions).not.toHaveBeenCalled();
  });

  it("isolates a failing app from the others", async () => {
    vi.mocked(BizBackend.getBizAppConfigs).mockResolvedValue(ok([cfg("a"), cfg("b")]));
    vi.mocked(BizBackend.bizGetUserPermissions).mockImplementation(async (appId: string) =>
      appId === "org/a"
        ? { status: "error", msg: "boom", data: undefined as never }
        : ok({ roles: ["r1"], allowedResources: [], allowedActions: [], properties: {} }),
    );
    renderIt();
    await waitFor(() => expect(screen.getByText(/boom/)).toBeInTheDocument());
    expect(screen.getByText("r1")).toBeInTheDocument();
  });

  it("shows the empty state when there are no configs", async () => {
    vi.mocked(BizBackend.getBizAppConfigs).mockResolvedValue(ok([]));
    renderIt();
    await waitFor(() => expect(screen.getByText("authz.userBizPerms.noApps")).toBeInTheDocument());
  });
});
