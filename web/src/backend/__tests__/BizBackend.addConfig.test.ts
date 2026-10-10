import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../request", () => ({ request: vi.fn().mockResolvedValue({ status: "ok", msg: "" }) }));

import { request } from "../request";
import { addBizAppConfig, newBizAppConfig } from "../BizBackend";

describe("addBizAppConfig", () => {
  beforeEach(() => vi.mocked(request).mockClear());

  it("posts to the plain endpoint by default", async () => {
    await addBizAppConfig(newBizAppConfig("org", "app"));
    expect(vi.mocked(request).mock.calls[0][1]).toBe("/api/biz-add-app-config");
  });

  it("adds initDefaults=true when requested", async () => {
    await addBizAppConfig(newBizAppConfig("org", "app"), { initDefaults: true });
    expect(vi.mocked(request).mock.calls[0][1]).toBe("/api/biz-add-app-config?initDefaults=true");
  });

  it("omits the flag when initDefaults is false", async () => {
    await addBizAppConfig(newBizAppConfig("org", "app"), { initDefaults: false });
    expect(vi.mocked(request).mock.calls[0][1]).toBe("/api/biz-add-app-config");
  });
});
