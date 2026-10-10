import { describe, expect, it } from "vitest";
import { validatePermissionForm } from "../permissionValidation";

const rbac = { hasRole: true, hasDomain: false };
const acl = { hasRole: false, hasDomain: false };
const dom = { hasRole: true, hasDomain: true };
const ok = { users: ["a/u"], resources: ["app"], actions: ["Read"] };

describe("validatePermissionForm", () => {
  it("accepts a complete permission", () => {
    expect(validatePermissionForm(ok, rbac)).toBeNull();
  });
  it("requires a user or role", () => {
    expect(validatePermissionForm({ ...ok, users: [] }, rbac)).toBe("permissions.validation.noSubject");
    expect(validatePermissionForm({ ...ok, users: [], roles: ["a/r"] }, rbac)).toBeNull();
  });
  it("groups do not count as a subject", () => {
    expect(validatePermissionForm({ ...ok, users: [], groups: ["g"] } as any, rbac)).toBe("permissions.validation.noSubject");
  });
  it("roles do not count when the model has no role definition", () => {
    expect(validatePermissionForm({ ...ok, users: [], roles: ["a/r"] }, acl)).toBe("permissions.validation.noSubject");
  });
  it("requires resources and actions", () => {
    expect(validatePermissionForm({ ...ok, resources: [] }, rbac)).toBe("permissions.validation.noResources");
    expect(validatePermissionForm({ ...ok, actions: undefined }, rbac)).toBe("permissions.validation.noActions");
  });
  it("rejects domains without a domain-aware model", () => {
    expect(validatePermissionForm({ ...ok, domains: ["d"] }, rbac)).toBe("permissions.validation.domainsUnsupported");
    expect(validatePermissionForm({ ...ok, domains: ["d"] }, dom)).toBeNull();
  });
  it("skips model-dependent rules while the model is loading", () => {
    expect(validatePermissionForm({ ...ok, domains: ["d"], users: [], roles: ["r"] }, null)).toBeNull();
  });
});
