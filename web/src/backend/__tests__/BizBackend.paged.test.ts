import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../request", () => ({
  request: vi.fn().mockResolvedValue({ status: "ok", msg: "", data: [{ name: "r1" }], data2: 42 }),
}));

import { request } from "../request";
import { getBizRolesPaged, getBizPermissionsPaged } from "../BizBackend";

describe("paged biz lists", () => {
  beforeEach(() => vi.mocked(request).mockClear());

  it("builds the roles query and reads total from data2", async () => {
    const res = await getBizRolesPaged("org", "app", {
      page: 2, pageSize: 20, field: "name", value: "ad", sortField: "name", sortOrder: "ascend", scopeKind: "app",
    });
    const url = vi.mocked(request).mock.calls[0][1] as string;
    expect(url).toContain("/api/biz-get-roles?organization=org&appName=app&");
    expect(url).toContain("p=2");
    expect(url).toContain("pageSize=20");
    expect(url).toContain("scopeKind=app");
    expect(url).toContain("sortOrder=ascend");
    expect(res.total).toBe(42);
    expect(res.data).toHaveLength(1);
  });

  it("omits empty optional params for permissions", async () => {
    await getBizPermissionsPaged("org", "app", { page: 1, pageSize: 10, effect: "Deny", isEnabled: "true" });
    const url = vi.mocked(request).mock.calls[0][1] as string;
    expect(url).toContain("effect=Deny");
    expect(url).toContain("isEnabled=true");
    expect(url).not.toContain("field=");
    expect(url).not.toContain("sortField=");
  });
});
