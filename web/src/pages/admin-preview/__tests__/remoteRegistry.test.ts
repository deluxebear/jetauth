import { describe, expect, it } from "vitest";
import { validateRegistryPayload } from "../remoteRegistry";

describe("validateRegistryPayload", () => {
  it("accepts a bare array of valid manifests", () => {
    const got = validateRegistryPayload([
      {
        id: "acme-brand",
        version: "1.0.0",
        name: "Acme",
        description: "",
        preview: "<svg></svg>",
        config: { template: "split-hero" },
      },
    ]);
    expect(got).toHaveLength(1);
    expect(got[0].id).toBe("acme-brand");
  });

  it("accepts a wrapper object { manifests: [...] }", () => {
    const got = validateRegistryPayload({
      manifests: [
        {
          id: "acme",
          version: "1.0.0",
          name: "Acme",
          description: "",
          preview: "<svg/>",
          config: {},
        },
      ],
    });
    expect(got).toHaveLength(1);
  });

  it("drops manifests missing required fields instead of failing the whole payload", () => {
    const got = validateRegistryPayload([
      { id: "ok", version: "1.0.0", name: "OK", description: "", preview: "", config: {} },
      { id: "bad" }, // missing version + name + config
    ]);
    expect(got).toHaveLength(1);
    expect(got[0].id).toBe("ok");
  });

  it("rejects the whole payload when nothing valid remains", () => {
    expect(() =>
      validateRegistryPayload([{ id: "only-one-and-its-bad" }]),
    ).toThrow(/no valid manifests/);
  });

  it("refuses manifest ids with bad characters (id is a cache key + persistence key)", () => {
    const got = validateRegistryPayload([
      { id: "valid-id", version: "1.0.0", name: "OK", description: "", preview: "", config: {} },
      { id: "Bad ID!", version: "1.0.0", name: "Bad", description: "", preview: "", config: {} },
    ]);
    expect(got.map((m) => m.id)).toEqual(["valid-id"]);
  });

  it("drops manifests that try to sneak <script> through an HTML field", () => {
    expect(() =>
      validateRegistryPayload([
        {
          id: "evil",
          version: "1.0.0",
          name: "Evil",
          description: "",
          preview: "",
          config: { signinHtml: "<script>alert(1)</script>" },
        },
      ]),
    ).toThrow(/no valid manifests/);
  });

  it("drops manifests with javascript: in an HTML field", () => {
    expect(() =>
      validateRegistryPayload([
        {
          id: "evil",
          version: "1.0.0",
          name: "Evil",
          description: "",
          preview: "",
          config: { headerHtml: "<a href=\"javascript:alert(1)\">click</a>" },
        },
      ]),
    ).toThrow(/no valid manifests/);
  });

  it("strips unknown config keys (forward-compat with future schemas)", () => {
    const got = validateRegistryPayload([
      {
        id: "future",
        version: "2.0.0",
        name: "Future",
        description: "",
        preview: "",
        config: {
          template: "full-bleed",
          newFieldNotYetSupported: "surprise",
        },
      },
    ]);
    expect(got).toHaveLength(1);
    expect((got[0].config as Record<string, unknown>).newFieldNotYetSupported).toBeUndefined();
    expect(got[0].config.template).toBe("full-bleed");
  });

  it("rejects payloads that aren't an array or wrapper", () => {
    expect(() => validateRegistryPayload("not json")).toThrow();
    expect(() => validateRegistryPayload({ stuff: [] })).toThrow();
  });
});
