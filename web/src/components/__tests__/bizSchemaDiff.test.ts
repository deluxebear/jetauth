import { describe, it, expect } from "vitest";
import {
  diffSchemas,
  diffLines,
  type SchemaStructuralDiff,
} from "../bizSchemaDiff";
import type { SchemaAST } from "../bizSchemaAst";

const astA: SchemaAST = {
  schemaVersion: "1.1",
  types: [
    { id: "t1", name: "user", relations: [] },
    {
      id: "t2",
      name: "document",
      relations: [
        {
          id: "r1",
          name: "viewer",
          rewrite: { kind: "this" },
          typeRestrictions: [{ kind: "direct", type: "user" }],
        },
        {
          id: "r2",
          name: "editor",
          rewrite: { kind: "this" },
          typeRestrictions: [{ kind: "direct", type: "user" }],
        },
      ],
    },
  ],
};

const astB: SchemaAST = {
  schemaVersion: "1.1",
  types: [
    { id: "t1", name: "user", relations: [] },
    {
      id: "t2",
      name: "document",
      relations: [
        {
          id: "r1",
          name: "viewer",
          rewrite: { kind: "this" },
          typeRestrictions: [{ kind: "direct", type: "user" }],
        },
        // editor removed
        {
          id: "r3",
          name: "reviewer",
          rewrite: { kind: "this" },
          typeRestrictions: [{ kind: "direct", type: "user" }],
        },
      ],
    },
    {
      id: "t3",
      name: "folder",
      relations: [
        {
          id: "r4",
          name: "owner",
          rewrite: { kind: "this" },
          typeRestrictions: [{ kind: "direct", type: "user" }],
        },
      ],
    },
  ],
};

describe("diffSchemas", () => {
  it("reports added types, removed relations, added relations", () => {
    const d: SchemaStructuralDiff = diffSchemas(astA, astB);
    expect(d.typesAdded).toEqual(["folder"]);
    expect(d.typesRemoved).toEqual([]);
    expect(d.relationsRemoved).toEqual(["document#editor"]);
    expect(d.relationsAdded.sort()).toEqual(
      ["document#reviewer", "folder#owner"].sort(),
    );
  });

  it("isDestructive is true when any type or relation is removed", () => {
    const d = diffSchemas(astA, astB);
    expect(d.isDestructive).toBe(true);
  });

  it("isDestructive is false for pure additions", () => {
    const d = diffSchemas(astA, {
      ...astA,
      types: [
        ...astA.types,
        {
          id: "tnew",
          name: "newtype",
          relations: [
            {
              id: "rnew",
              name: "some",
              rewrite: { kind: "this" },
              typeRestrictions: [{ kind: "direct", type: "user" }],
            },
          ],
        },
      ],
    });
    expect(d.isDestructive).toBe(false);
    expect(d.typesAdded).toEqual(["newtype"]);
  });

  it("returns all-empty diff for identical schemas", () => {
    const d = diffSchemas(astA, astA);
    expect(d.typesAdded).toEqual([]);
    expect(d.typesRemoved).toEqual([]);
    expect(d.relationsAdded).toEqual([]);
    expect(d.relationsRemoved).toEqual([]);
    expect(d.isDestructive).toBe(false);
  });
});

describe("diffLines", () => {
  it("marks added and removed lines", () => {
    const out = diffLines("a\nb\nc\n", "a\nc\nd\n");
    const removed = out.filter((l) => l.kind === "removed").map((l) => l.text);
    const added = out.filter((l) => l.kind === "added").map((l) => l.text);
    expect(removed).toContain("b");
    expect(added).toContain("d");
  });

  it("all-context for identical text", () => {
    const out = diffLines("x\ny\n", "x\ny\n");
    expect(out.every((l) => l.kind === "context")).toBe(true);
    expect(out.map((l) => l.text)).toEqual(["x", "y"]);
  });

  it("handles empty strings", () => {
    expect(diffLines("", "")).toEqual([]);
    const onlyAdded = diffLines("", "a\nb\n");
    expect(onlyAdded.every((l) => l.kind === "added")).toBe(true);
    expect(onlyAdded.map((l) => l.text)).toEqual(["a", "b"]);
    const onlyRemoved = diffLines("a\nb\n", "");
    expect(onlyRemoved.every((l) => l.kind === "removed")).toBe(true);
  });
});
