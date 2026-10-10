import { describe, expect, it } from "vitest";
import { DEFAULT_PERMISSION_MODEL, getModelSupport, parseCasbinModel } from "../casbinModel";

const ACL = `[request_definition]
r = sub, obj, act
[policy_definition]
p = sub, obj, act
[policy_effect]
e = some(where (p.eft == allow))
[matchers]
m = r.sub == p.sub && r.obj == p.obj && r.act == p.act`;

const DOMAIN = `# rbac with domains
[request_definition]
r = sub, dom, obj, act

[role_definition]
g = _, _, _

[matchers]
m = g(r.sub, p.sub, r.dom) && \\
  r.obj == p.obj`;

describe("parseCasbinModel", () => {
  it("parses sections, comments and continuations", () => {
    const s = parseCasbinModel(DOMAIN);
    expect(s.request_definition.r).toBe("sub, dom, obj, act");
    expect(s.role_definition.g).toBe("_, _, _");
    expect(s.matchers.m).toBe("g(r.sub, p.sub, r.dom) && r.obj == p.obj");
  });
  it("tolerates empty input", () => {
    expect(parseCasbinModel("")).toEqual({});
  });
});

describe("getModelSupport", () => {
  it("empty model uses the built-in default: role, no domain", () => {
    expect(getModelSupport("")).toEqual({ hasRole: true, hasDomain: false });
    expect(getModelSupport(DEFAULT_PERMISSION_MODEL)).toEqual({ hasRole: true, hasDomain: false });
  });
  it("ACL has neither", () => {
    expect(getModelSupport(ACL)).toEqual({ hasRole: false, hasDomain: false });
  });
  it("3-arg g enables domains", () => {
    expect(getModelSupport(DOMAIN)).toEqual({ hasRole: true, hasDomain: true });
  });
  it("g2 with 3 args counts", () => {
    expect(getModelSupport("[role_definition]\ng = _, _\ng2 = _, _, _")).toEqual({ hasRole: true, hasDomain: true });
  });
});
