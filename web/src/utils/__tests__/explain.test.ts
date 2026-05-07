import { describe, it, expect } from "vitest";
import { explainExpand } from "../explain";
import type { BizExpandNode } from "../../backend/BizBackend";

describe("explainExpand", () => {
  it("direct this — match", () => {
    const root: BizExpandNode = { kind: "this", users: ["user:alice"] };
    const steps = explainExpand(root, { user: "user:alice", relation: "viewer", object: "document:r1" });
    expect(steps).toHaveLength(1);
    expect(steps[0].pass).toBe(true);
    expect(steps[0].kind).toBe("direct");
    expect(steps[0].children[0]?.kind).toBe("leaf");
  });

  it("direct this — no match", () => {
    const root: BizExpandNode = { kind: "this", users: ["user:bob"] };
    const steps = explainExpand(root, { user: "user:alice", relation: "viewer", object: "document:r1" });
    expect(steps[0].pass).toBe(false);
    expect(steps[0].children).toHaveLength(0);
  });

  it("union — passes when any child matches", () => {
    const root: BizExpandNode = {
      kind: "union",
      children: [
        { kind: "this", users: ["user:bob"] },
        { kind: "this", users: ["user:alice"] },
      ],
    };
    const steps = explainExpand(root, { user: "user:alice", relation: "viewer", object: "document:r1" });
    expect(steps[0].kind).toBe("union");
    expect(steps[0].pass).toBe(true);
    expect(steps[0].children).toHaveLength(2);
    expect(steps[0].children[0].pass).toBe(false);
    expect(steps[0].children[1].pass).toBe(true);
  });

  it("intersection — fails unless all children match", () => {
    const root: BizExpandNode = {
      kind: "intersection",
      children: [
        { kind: "this", users: ["user:alice"] },
        { kind: "this", users: ["user:bob"] },
      ],
    };
    const steps = explainExpand(root, { user: "user:alice", relation: "editor", object: "document:r1" });
    expect(steps[0].kind).toBe("intersection");
    expect(steps[0].pass).toBe(false);
  });

  it("computed_userset — descends into child", () => {
    const root: BizExpandNode = {
      kind: "computed_userset",
      computed: { relation: "editor" },
      children: [{ kind: "this", users: ["user:alice"] }],
    };
    const steps = explainExpand(root, { user: "user:alice", relation: "viewer", object: "document:r1" });
    expect(steps[0].kind).toBe("computed");
    expect(steps[0].pass).toBe(true);
    expect(steps[0].description).toContain("viewer");
    expect(steps[0].description).toContain("editor");
  });

  it("tuple_to_userset — passes when any intermediate matches", () => {
    const root: BizExpandNode = {
      kind: "tuple_to_userset",
      tupleToUserset: {
        tupleset: { relation: "parent" },
        computed: { relation: "editor" },
      },
      children: [
        { kind: "this", users: ["user:alice"] },
      ],
    };
    const steps = explainExpand(root, { user: "user:alice", relation: "viewer", object: "document:r1" });
    expect(steps[0].kind).toBe("ttu");
    expect(steps[0].pass).toBe(true);
    expect(steps[0].description).toMatch(/from.*parent/);
  });

  it("difference — passes when base matches and subtract does not", () => {
    const root: BizExpandNode = {
      kind: "difference",
      base: { kind: "this", users: ["user:alice"] },
      subtract: { kind: "this", users: ["user:bob"] },
    };
    const steps = explainExpand(root, { user: "user:alice", relation: "viewer", object: "document:r1" });
    expect(steps[0].kind).toBe("difference");
    expect(steps[0].pass).toBe(true);
  });

  it("difference — fails when subtract includes the user", () => {
    const root: BizExpandNode = {
      kind: "difference",
      base: { kind: "this", users: ["user:alice"] },
      subtract: { kind: "this", users: ["user:alice"] },
    };
    const steps = explainExpand(root, { user: "user:alice", relation: "viewer", object: "document:r1" });
    expect(steps[0].kind).toBe("difference");
    expect(steps[0].pass).toBe(false);
  });

  it("unknown kind — returns leaf with pass=false", () => {
    const root: BizExpandNode = { kind: "unknown_future_kind" };
    const steps = explainExpand(root, { user: "user:alice", relation: "viewer", object: "document:r1" });
    expect(steps[0].kind).toBe("leaf");
    expect(steps[0].pass).toBe(false);
    expect(steps[0].description).toContain("unknown_future_kind");
  });
});
