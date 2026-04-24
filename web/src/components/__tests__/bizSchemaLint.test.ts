import { describe, it, expect } from "vitest";
import { lintSchema, type LintWarning } from "../bizSchemaLint";
import type { SchemaAST } from "../bizSchemaAst";

function ast(overrides: Partial<SchemaAST>): SchemaAST {
  return { schemaVersion: "1.1", types: [], ...overrides };
}

describe("lintSchema", () => {
  it("flags a non-user type with no relations as orphan", () => {
    const warnings: LintWarning[] = lintSchema(
      ast({
        types: [
          { id: "t1", name: "user", relations: [] },
          { id: "t2", name: "stranger", relations: [] },
        ],
      }),
    );
    // `user` is conventionally subject-only; skip it.
    expect(
      warnings.some(
        (w) => w.rule === "orphan-type" && w.target === "stranger",
      ),
    ).toBe(true);
    expect(
      warnings.some((w) => w.rule === "orphan-type" && w.target === "user"),
    ).toBe(false);
  });

  it("flags a relation with [this] but no typeRestrictions", () => {
    const warnings = lintSchema(
      ast({
        types: [
          {
            id: "t1",
            name: "document",
            relations: [
              {
                id: "r1",
                name: "viewer",
                rewrite: { kind: "this" },
                typeRestrictions: [],
              },
            ],
          },
        ],
      }),
    );
    expect(
      warnings.some(
        (w) =>
          w.rule === "missing-subject-type" &&
          w.target === "document#viewer",
      ),
    ).toBe(true);
  });

  it("flags missing-subject-type even when `this` is nested inside union", () => {
    const warnings = lintSchema(
      ast({
        types: [
          {
            id: "t1",
            name: "document",
            relations: [
              {
                id: "r1",
                name: "viewer",
                rewrite: {
                  kind: "union",
                  children: [
                    { kind: "this" },
                    { kind: "computedUserset", relation: "editor" },
                  ],
                },
                typeRestrictions: [],
              },
            ],
          },
        ],
      }),
    );
    expect(
      warnings.some(
        (w) =>
          w.rule === "missing-subject-type" &&
          w.target === "document#viewer",
      ),
    ).toBe(true);
  });

  it("does NOT flag missing-subject-type when rewrite is purely computed_userset (no this)", () => {
    const warnings = lintSchema(
      ast({
        types: [
          {
            id: "t1",
            name: "document",
            relations: [
              {
                id: "r1",
                name: "viewer",
                rewrite: { kind: "computedUserset", relation: "editor" },
                typeRestrictions: [],
              },
            ],
          },
        ],
      }),
    );
    expect(
      warnings.some((w) => w.rule === "missing-subject-type"),
    ).toBe(false);
  });

  it("returns empty array for a well-formed schema", () => {
    const warnings = lintSchema(
      ast({
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
            ],
          },
        ],
      }),
    );
    expect(warnings).toEqual([]);
  });
});
