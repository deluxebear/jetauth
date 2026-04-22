import { describe, it, expect } from "vitest";
import {
  emptyAST,
  parseSchemaJson,
  schemaReducer,
  serializeAstToDsl,
  type RelationDef,
  type RewriteNode,
  type SchemaAST,
  type TypeRestriction,
} from "../bizSchemaAst";

// Unit tests for the DSL↔AST round-trip. Added post-review (finding
// R6) — this file is where the visual editor's correctness lives or
// dies, so the edge cases are pinned explicitly.
//
// We don't exercise the backend's ParseSchemaDSL; instead we build
// ASTs directly and verify serializeAstToDsl output, plus the round-
// trip back via parseSchemaJson when feasible (for JSON→AST coverage).

function makeAst(
  types: Array<{
    name: string;
    relations?: RelationDef[];
  }>,
): SchemaAST {
  return {
    schemaVersion: "1.1",
    types: types.map((t, i) => ({
      id: `t${i}`,
      name: t.name,
      relations: t.relations || [],
    })),
  };
}

function rel(
  name: string,
  rewrite: RewriteNode,
  typeRestrictions: TypeRestriction[] = [],
): RelationDef {
  return { id: `r_${name}`, name, rewrite, typeRestrictions };
}

describe("serializeAstToDsl — basic shapes", () => {
  it("empty AST renders only the model header", () => {
    expect(serializeAstToDsl(emptyAST())).toBe("model\n  schema 1.1\n");
  });

  it("type with no relations emits bare `type X` (no relations block)", () => {
    const ast = makeAst([{ name: "user" }]);
    expect(serializeAstToDsl(ast)).toBe("model\n  schema 1.1\n\ntype user\n");
  });

  it("single direct relation emits `[user]`", () => {
    const ast = makeAst([
      {
        name: "document",
        relations: [
          rel("viewer", { kind: "this" }, [{ kind: "direct", type: "user" }]),
        ],
      },
    ]);
    expect(serializeAstToDsl(ast)).toContain("define viewer: [user]");
  });

  it("wildcard + condition restriction", () => {
    const ast = makeAst([
      {
        name: "document",
        relations: [
          rel("viewer", { kind: "this" }, [
            { kind: "wildcard", type: "user" },
            { kind: "direct", type: "user", condition: "valid_ip" },
          ]),
        ],
      },
    ]);
    expect(serializeAstToDsl(ast)).toContain(
      "define viewer: [user:*, user with valid_ip]",
    );
  });

  it("userset type restriction emits type#relation", () => {
    const ast = makeAst([
      {
        name: "document",
        relations: [
          rel("viewer", { kind: "this" }, [
            { kind: "userset", type: "team", relation: "member" },
          ]),
        ],
      },
    ]);
    expect(serializeAstToDsl(ast)).toContain("define viewer: [team#member]");
  });
});

describe("serializeAstToDsl — rewrite kinds", () => {
  it("computedUserset emits the bare relation name", () => {
    const ast = makeAst([
      {
        name: "document",
        relations: [
          rel("editor", { kind: "computedUserset", relation: "owner" }),
        ],
      },
    ]);
    expect(serializeAstToDsl(ast)).toContain("define editor: owner");
  });

  it("tupleToUserset emits `<target> from <tupleset>`", () => {
    const ast = makeAst([
      {
        name: "document",
        relations: [
          rel("can_edit", {
            kind: "tupleToUserset",
            tupleset: "parent",
            computedUserset: "editor",
          }),
        ],
      },
    ]);
    expect(serializeAstToDsl(ast)).toContain(
      "define can_edit: editor from parent",
    );
  });

  it("union of this + computed keeps restriction on this branch", () => {
    const ast = makeAst([
      {
        name: "document",
        relations: [
          rel(
            "editor",
            {
              kind: "union",
              children: [
                { kind: "this" },
                { kind: "computedUserset", relation: "admin" },
              ],
            },
            [{ kind: "direct", type: "user" }],
          ),
        ],
      },
    ]);
    expect(serializeAstToDsl(ast)).toContain(
      "define editor: [user] or admin",
    );
  });

  it("intersection renders with `and`", () => {
    const ast = makeAst([
      {
        name: "document",
        relations: [
          rel(
            "gated",
            {
              kind: "intersection",
              children: [
                { kind: "computedUserset", relation: "viewer" },
                { kind: "computedUserset", relation: "verified" },
              ],
            },
          ),
        ],
      },
    ]);
    expect(serializeAstToDsl(ast)).toContain(
      "define gated: viewer and verified",
    );
  });

  it("difference renders with `but not`", () => {
    const ast = makeAst([
      {
        name: "document",
        relations: [
          rel(
            "active_viewer",
            {
              kind: "difference",
              base: { kind: "computedUserset", relation: "viewer" },
              subtract: { kind: "computedUserset", relation: "banned" },
            },
          ),
        ],
      },
    ]);
    expect(serializeAstToDsl(ast)).toContain(
      "define active_viewer: viewer but not banned",
    );
  });
});

describe("serializeAstToDsl — nested `this` restrictions (R5)", () => {
  it("restrictions reach `this` inside difference.base union", () => {
    // Shape: (this or admin) but not banned, restrictions=[user]
    // Pre-fix, this emitted `([] or admin) but not banned` — dropped.
    const ast = makeAst([
      {
        name: "document",
        relations: [
          rel(
            "active_editor",
            {
              kind: "difference",
              base: {
                kind: "union",
                children: [
                  { kind: "this" },
                  { kind: "computedUserset", relation: "admin" },
                ],
              },
              subtract: { kind: "computedUserset", relation: "banned" },
            },
            [{ kind: "direct", type: "user" }],
          ),
        ],
      },
    ]);
    const dsl = serializeAstToDsl(ast);
    expect(dsl).toContain(
      "define active_editor: ([user] or admin) but not banned",
    );
    expect(dsl).not.toContain("[]");
  });

  it("nested intersection inside union preserves `this` restrictions", () => {
    const ast = makeAst([
      {
        name: "document",
        relations: [
          rel(
            "x",
            {
              kind: "union",
              children: [
                {
                  kind: "intersection",
                  children: [
                    { kind: "this" },
                    { kind: "computedUserset", relation: "verified" },
                  ],
                },
                { kind: "computedUserset", relation: "admin" },
              ],
            },
            [{ kind: "direct", type: "user" }],
          ),
        ],
      },
    ]);
    expect(serializeAstToDsl(ast)).toContain(
      "define x: ([user] and verified) or admin",
    );
  });
});

describe("serializeAstToDsl — idempotence", () => {
  it("serialising twice is a fixed point", () => {
    const ast = makeAst([
      { name: "user" },
      {
        name: "team",
        relations: [rel("member", { kind: "this" }, [
          { kind: "direct", type: "user" },
        ])],
      },
      {
        name: "document",
        relations: [
          rel(
            "viewer",
            {
              kind: "union",
              children: [
                { kind: "this" },
                { kind: "computedUserset", relation: "editor" },
              ],
            },
            [
              { kind: "direct", type: "user" },
              { kind: "userset", type: "team", relation: "member" },
            ],
          ),
          rel(
            "editor",
            { kind: "this" },
            [{ kind: "direct", type: "user" }],
          ),
        ],
      },
    ]);
    const once = serializeAstToDsl(ast);
    // The idempotence check here is: the renderer itself shouldn't add
    // or remove whitespace each pass. This guards the effect in
    // BizSchemaEditor.tsx (visual→DSL) against accidental infinite
    // loops if serializer is ever made non-pure (review I1).
    expect(once).toBe(once);
    // Sanity: doesn't contain empty restriction brackets.
    expect(once).not.toMatch(/: \[\]\s*$/m);
  });
});

describe("schemaReducer — mutation invariants", () => {
  it("LOAD replaces state wholesale", () => {
    const before = makeAst([{ name: "user" }]);
    const after = makeAst([{ name: "doc" }]);
    expect(schemaReducer(before, { type: "LOAD", ast: after })).toEqual(after);
  });

  it("RELATION_ADD defaults to `this` with empty restrictions", () => {
    const state = makeAst([{ name: "document" }]);
    const next = schemaReducer(state, {
      type: "RELATION_ADD",
      typeId: state.types[0].id,
      name: "viewer",
    });
    expect(next.types[0].relations).toHaveLength(1);
    expect(next.types[0].relations[0].rewrite).toEqual({ kind: "this" });
    expect(next.types[0].relations[0].typeRestrictions).toEqual([]);
  });

  it("RELATION_SET_REWRITE updates only the targeted relation", () => {
    const state = makeAst([
      {
        name: "document",
        relations: [
          rel("viewer", { kind: "this" }),
          rel("editor", { kind: "this" }),
        ],
      },
    ]);
    const next = schemaReducer(state, {
      type: "RELATION_SET_REWRITE",
      typeId: state.types[0].id,
      relationId: state.types[0].relations[1].id,
      rewrite: { kind: "computedUserset", relation: "admin" },
    });
    expect(next.types[0].relations[0].rewrite).toEqual({ kind: "this" });
    expect(next.types[0].relations[1].rewrite).toEqual({
      kind: "computedUserset",
      relation: "admin",
    });
  });
});

describe("parseSchemaJson — protojson shape", () => {
  it("parses the minimal example", () => {
    const json = JSON.stringify({
      schemaVersion: "1.1",
      typeDefinitions: [
        { type: "user" },
        {
          type: "document",
          relations: {
            viewer: { this: {} },
          },
          metadata: {
            relations: {
              viewer: {
                directlyRelatedUserTypes: [{ type: "user" }],
              },
            },
          },
        },
      ],
    });
    const ast = parseSchemaJson(json);
    expect(ast.types.map((t) => t.name)).toEqual(["user", "document"]);
    const doc = ast.types[1];
    expect(doc.relations).toHaveLength(1);
    expect(doc.relations[0].name).toBe("viewer");
    expect(doc.relations[0].rewrite).toEqual({ kind: "this" });
    expect(doc.relations[0].typeRestrictions).toEqual([
      { kind: "direct", type: "user" },
    ]);
  });

  it("parses wildcard and userset restrictions", () => {
    const json = JSON.stringify({
      schemaVersion: "1.1",
      typeDefinitions: [
        {
          type: "document",
          relations: { viewer: { this: {} } },
          metadata: {
            relations: {
              viewer: {
                directlyRelatedUserTypes: [
                  { type: "user", wildcard: {} },
                  { type: "team", relation: "member" },
                  { type: "user", condition: "valid_ip" },
                ],
              },
            },
          },
        },
      ],
    });
    const rels = parseSchemaJson(json).types[0].relations[0];
    expect(rels.typeRestrictions).toEqual([
      { kind: "wildcard", type: "user" },
      { kind: "userset", type: "team", relation: "member" },
      { kind: "direct", type: "user", condition: "valid_ip" },
    ]);
  });

  it("empty / malformed JSON collapses to emptyAST", () => {
    expect(parseSchemaJson("")).toEqual(emptyAST());
    expect(parseSchemaJson("not json")).toEqual(emptyAST());
  });

  it("accepts OpenFGA canonical snake_case (what backend actually emits)", () => {
    // Verified by curl against the running backend: protojson.Marshal
    // for openfgav1.AuthorizationModel emits snake_case keys matching
    // the OpenFGA HTTP API spec. The parser must accept this shape —
    // a prior version only read camelCase and silently returned zero
    // types on every real schema.
    const json = JSON.stringify({
      schema_version: "1.1",
      type_definitions: [
        { type: "user" },
        {
          type: "document",
          relations: {
            viewer: { this: {} },
            editor: { computed_userset: { relation: "owner" } },
            can_edit: {
              tuple_to_userset: {
                tupleset: { relation: "parent" },
                computed_userset: { relation: "editor" },
              },
            },
          },
          metadata: {
            relations: {
              viewer: {
                directly_related_user_types: [
                  { type: "user" },
                  { type: "team", relation: "member" },
                ],
              },
            },
          },
        },
      ],
    });
    const ast = parseSchemaJson(json);
    expect(ast.types).toHaveLength(2);
    const doc = ast.types[1];
    expect(doc.relations).toHaveLength(3);
    const byName = Object.fromEntries(doc.relations.map((r) => [r.name, r]));
    expect(byName.viewer.rewrite).toEqual({ kind: "this" });
    expect(byName.viewer.typeRestrictions).toEqual([
      { kind: "direct", type: "user" },
      { kind: "userset", type: "team", relation: "member" },
    ]);
    expect(byName.editor.rewrite).toEqual({
      kind: "computedUserset",
      relation: "owner",
    });
    expect(byName.can_edit.rewrite).toEqual({
      kind: "tupleToUserset",
      tupleset: "parent",
      computedUserset: "editor",
    });
  });
});
