// bizSchemaAst — in-memory AST for the ReBAC schema visual editor.
//
// The AST mirrors the OpenFGA v1.1 protojson shape but is framed for
// editing in React: every node carries a client-side UUID so list
// operations stay stable across renders, and the RewriteNode /
// TypeRestriction discriminated unions trade protobuf oneof-repetition
// for code that TypeScript can exhaustively narrow.
//
// This file is pure — no React, no I/O — so it can be unit tested and
// consumed by both the visual editor (Task 5) and the DSL↔AST bridge
// (Task 6) without circular imports.

// ── Rewrite AST ─────────────────────────────────────────────────────

export type RewriteNode =
  | { kind: "this" }
  | { kind: "computedUserset"; relation: string }
  | {
      kind: "tupleToUserset";
      tupleset: string; // the "from X" relation name (ObjectRelation.relation)
      computedUserset: string; // the target relation on the referenced type
    }
  | { kind: "union"; children: RewriteNode[] }
  | { kind: "intersection"; children: RewriteNode[] }
  | { kind: "difference"; base: RewriteNode; subtract: RewriteNode };

// ── Type-restriction AST ───────────────────────────────────────────
//
// Corresponds to OpenFGA's RelationReference. A relation's set of
// "directlyRelatedUserTypes" is an array of these; each says what kinds
// of users may appear as subjects in a `this`-backed tuple.

export type TypeRestriction =
  | { kind: "direct"; type: string; condition?: string } // user, user with cond
  | { kind: "wildcard"; type: string } // user:*
  | { kind: "userset"; type: string; relation: string }; // team#member

// ── Top-level AST ───────────────────────────────────────────────────

export interface RelationDef {
  id: string;
  name: string;
  rewrite: RewriteNode;
  typeRestrictions: TypeRestriction[];
}

export interface TypeDef {
  id: string;
  name: string;
  relations: RelationDef[];
}

export interface SchemaAST {
  schemaVersion: "1.1";
  types: TypeDef[];
  // Conditions are preserved round-trip but not yet edited here (Task 5d).
  rawConditionsJson?: string;
}

// ── Reducer ────────────────────────────────────────────────────────

export type SchemaAction =
  | { type: "LOAD"; ast: SchemaAST }
  | { type: "TYPE_ADD"; name: string }
  | { type: "TYPE_REMOVE"; typeId: string }
  | { type: "TYPE_RENAME"; typeId: string; name: string }
  | { type: "RELATION_ADD"; typeId: string; name: string }
  | { type: "RELATION_REMOVE"; typeId: string; relationId: string }
  | {
      type: "RELATION_RENAME";
      typeId: string;
      relationId: string;
      name: string;
    }
  | {
      type: "RELATION_SET_REWRITE";
      typeId: string;
      relationId: string;
      rewrite: RewriteNode;
    }
  | {
      type: "RELATION_SET_RESTRICTIONS";
      typeId: string;
      relationId: string;
      restrictions: TypeRestriction[];
    };

export function emptyAST(): SchemaAST {
  return { schemaVersion: "1.1", types: [] };
}

// Tiny stand-in for crypto.randomUUID to keep the file environment-agnostic
// (happy-dom in Vitest doesn't expose crypto.randomUUID in every browser
// shape). Collisions would only matter inside a single tab's session.
function newId(): string {
  return (
    Math.random().toString(36).slice(2, 10) +
    "-" +
    Date.now().toString(36)
  );
}

export function schemaReducer(
  state: SchemaAST,
  action: SchemaAction,
): SchemaAST {
  switch (action.type) {
    case "LOAD":
      // Defensive shallow copy so a future caller that mutates the
      // passed-in AST (e.g. for test fixtures) can't leak changes
      // into reducer state (review finding N5).
      return { ...action.ast, types: action.ast.types };
    case "TYPE_ADD":
      return {
        ...state,
        types: [
          ...state.types,
          { id: newId(), name: action.name, relations: [] },
        ],
      };
    case "TYPE_REMOVE":
      return {
        ...state,
        types: state.types.filter((t) => t.id !== action.typeId),
      };
    case "TYPE_RENAME":
      return {
        ...state,
        types: state.types.map((t) =>
          t.id === action.typeId ? { ...t, name: action.name } : t,
        ),
      };
    case "RELATION_ADD":
      return {
        ...state,
        types: state.types.map((t) =>
          t.id === action.typeId
            ? {
                ...t,
                relations: [
                  ...t.relations,
                  {
                    id: newId(),
                    name: action.name,
                    // Default new relations to `this` with no type
                    // restrictions — the admin still has to add at
                    // least one allowed subject type before save (Task
                    // 6 will surface this as a validation error).
                    rewrite: { kind: "this" },
                    typeRestrictions: [],
                  },
                ],
              }
            : t,
        ),
      };
    case "RELATION_REMOVE":
      return {
        ...state,
        types: state.types.map((t) =>
          t.id === action.typeId
            ? {
                ...t,
                relations: t.relations.filter(
                  (r) => r.id !== action.relationId,
                ),
              }
            : t,
        ),
      };
    case "RELATION_RENAME":
      return {
        ...state,
        types: state.types.map((t) =>
          t.id === action.typeId
            ? {
                ...t,
                relations: t.relations.map((r) =>
                  r.id === action.relationId ? { ...r, name: action.name } : r,
                ),
              }
            : t,
        ),
      };
    case "RELATION_SET_REWRITE":
      return {
        ...state,
        types: state.types.map((t) =>
          t.id === action.typeId
            ? {
                ...t,
                relations: t.relations.map((r) =>
                  r.id === action.relationId
                    ? { ...r, rewrite: action.rewrite }
                    : r,
                ),
              }
            : t,
        ),
      };
    case "RELATION_SET_RESTRICTIONS":
      return {
        ...state,
        types: state.types.map((t) =>
          t.id === action.typeId
            ? {
                ...t,
                relations: t.relations.map((r) =>
                  r.id === action.relationId
                    ? { ...r, typeRestrictions: action.restrictions }
                    : r,
                ),
              }
            : t,
        ),
      };
  }
}

// ── AST → DSL serialiser ────────────────────────────────────────────
//
// Emits OpenFGA v1.1 DSL from the AST. This is the "AST → DSL" side of
// the bidirectional sync that Task 6 wires; writing it here as a pure
// function means both tabs of the schema editor can call it without
// pulling React into the bridge.
//
// The grammar is small but strict:
//
//   model
//     schema 1.1
//
//   type user
//
//   type document
//     relations
//       define viewer: [user, team#member, user:* with valid_ip]
//       define editor: viewer or admin but not banned
//       define can_edit: viewer from parent
//
// Precedence: the spec only defines associativity for "or" / "and";
// difference ("but not") binds to exactly two operands. When emitting
// nested operators we parenthesise aggressively to avoid ambiguity.

export function serializeAstToDsl(ast: SchemaAST): string {
  const lines: string[] = ["model", "  schema 1.1", ""];
  for (const td of ast.types) {
    lines.push(`type ${td.name}`);
    if (td.relations.length > 0) {
      lines.push("  relations");
      for (const rel of td.relations) {
        lines.push(`    define ${rel.name}: ${renderRelationBody(rel)}`);
      }
    }
    lines.push("");
  }
  // Trim trailing blank line for a tidy final string.
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n") + "\n";
}

function renderRelationBody(rel: RelationDef): string {
  return renderRewriteWithRestrictions(rel.rewrite, rel.typeRestrictions, true);
}

// renderRewriteWithRestrictions emits DSL for a rewrite tree. Because
// OpenFGA's `directly_related_user_types` is a flat list attached to
// the relation (not per-node), every `this` encountered during the
// walk — no matter how deep — gets the same restriction list. That's
// why restrictions thread through every branch rather than only the
// top-level `this` (review finding R5: a prior version short-circuited
// only on direct children of `difference`, silently dropping
// restrictions from shapes like `(this or admin) but not banned`).
//
// `topLevel` controls parenthesisation: OpenFGA DSL mixes `or`/`and`/
// `but not` with a defined precedence, but the safe authoring rule is
// to parenthesise any nested composite — that's what the parser round-
// trips through without ambiguity.
function renderRewriteWithRestrictions(
  node: RewriteNode,
  restrictions: TypeRestriction[],
  topLevel: boolean,
): string {
  switch (node.kind) {
    case "this":
      return renderRestrictions(restrictions);
    case "computedUserset":
      return node.relation || "_unset_";
    case "tupleToUserset":
      return `${node.computedUserset || "_unset_"} from ${node.tupleset || "_unset_"}`;
    case "union": {
      const body = node.children
        .map((c) => renderRewriteWithRestrictions(c, restrictions, false))
        .join(" or ");
      return topLevel ? body : `(${body})`;
    }
    case "intersection": {
      const body = node.children
        .map((c) => renderRewriteWithRestrictions(c, restrictions, false))
        .join(" and ");
      return topLevel ? body : `(${body})`;
    }
    case "difference": {
      const base = renderRewriteWithRestrictions(node.base, restrictions, false);
      const subtract = renderRewriteWithRestrictions(
        node.subtract,
        restrictions,
        false,
      );
      const body = `${base} but not ${subtract}`;
      return topLevel ? body : `(${body})`;
    }
  }
}

function renderRestrictions(restrictions: TypeRestriction[]): string {
  if (restrictions.length === 0) return "[]";
  const parts = restrictions.map((r) => {
    switch (r.kind) {
      case "direct":
        return r.condition ? `${r.type} with ${r.condition}` : r.type;
      case "wildcard":
        return `${r.type}:*`;
      case "userset":
        return `${r.type}#${r.relation}`;
    }
  });
  return `[${parts.join(", ")}]`;
}

// ── schemaJson (protojson) → AST ───────────────────────────────────
//
// `schemaJson` is whatever protojson spits out for
// openfgav1.AuthorizationModel — see object/biz_rebac_schema.go. Keys
// are camelCase, oneof fields appear as whichever variant was set.
//
// This parser is permissive by design: unknown fields are dropped, and
// malformed sub-trees collapse to a `this` rewrite with no restrictions
// rather than throwing. Malformed schemas originate from a parseable
// DSL (the backend always validates before storing), so hard-failing
// here would only bite on hand-authored JSON.

interface RawModel {
  schemaVersion?: string;
  typeDefinitions?: RawTypeDef[];
  conditions?: Record<string, unknown>;
}

// The backend protojson.Marshal emits OpenFGA's canonical JSON which
// is snake_case (type_definitions, directly_related_user_types,
// computed_userset, …), matching the OpenFGA HTTP API spec. Some
// SDKs and hand-authored files use camelCase instead. The parser
// accepts either by consulting both spellings at every lookup — pick
// helper below hides the fork.
function pick<T>(obj: Record<string, unknown>, ...keys: string[]): T | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined) return v as T;
  }
  return undefined;
}

export function parseSchemaJson(jsonText: string): SchemaAST {
  if (!jsonText.trim()) return emptyAST();
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(jsonText) as Record<string, unknown>;
  } catch {
    return emptyAST();
  }

  const typeDefs =
    pick<unknown[]>(raw, "type_definitions", "typeDefinitions") || [];
  const types: TypeDef[] = typeDefs.map((tdAny) => {
    const td = (tdAny as Record<string, unknown>) || {};
    const relationsMap =
      (td.relations as Record<string, Record<string, unknown>>) || {};
    const metadata = (td.metadata as Record<string, unknown>) || {};
    const metaRelations =
      (metadata.relations as Record<string, Record<string, unknown>>) || {};
    const relations: RelationDef[] = Object.keys(relationsMap).map((name) => {
      const meta = metaRelations[name] || {};
      const directUserTypes =
        (pick<unknown[]>(
          meta,
          "directly_related_user_types",
          "directlyRelatedUserTypes",
        ) as unknown[]) || [];
      return {
        id: newId(),
        name,
        rewrite: parseUserset(relationsMap[name]),
        typeRestrictions: directUserTypes.map((ref) =>
          parseRelationReference((ref as Record<string, unknown>) || {}),
        ),
      };
    });
    return {
      id: newId(),
      name: (td.type as string) || "",
      relations,
    };
  });

  const ast: SchemaAST = { schemaVersion: "1.1", types };
  const conditions = raw.conditions as Record<string, unknown> | undefined;
  if (conditions && Object.keys(conditions).length > 0) {
    ast.rawConditionsJson = JSON.stringify(conditions);
  }
  return ast;
}

function parseUserset(u: Record<string, unknown> | undefined): RewriteNode {
  if (!u) return { kind: "this" };
  if (u.this !== undefined) return { kind: "this" };

  const computedUserset = pick<Record<string, unknown>>(
    u,
    "computed_userset",
    "computedUserset",
  );
  if (computedUserset) {
    return {
      kind: "computedUserset",
      relation: (computedUserset.relation as string) || "",
    };
  }

  const ttu = pick<Record<string, unknown>>(u, "tuple_to_userset", "tupleToUserset");
  if (ttu) {
    const tuplesetRef =
      (pick<Record<string, unknown>>(ttu, "tupleset") as
        | Record<string, unknown>
        | undefined) || {};
    const cuRef =
      (pick<Record<string, unknown>>(ttu, "computed_userset", "computedUserset") as
        | Record<string, unknown>
        | undefined) || {};
    return {
      kind: "tupleToUserset",
      tupleset: (tuplesetRef.relation as string) || "",
      computedUserset: (cuRef.relation as string) || "",
    };
  }

  const union = u.union as Record<string, unknown> | undefined;
  if (union) {
    const children = (union.child as unknown[]) || [];
    return {
      kind: "union",
      children: children.map((c) =>
        parseUserset((c as Record<string, unknown>) || {}),
      ),
    };
  }

  const intersection = u.intersection as Record<string, unknown> | undefined;
  if (intersection) {
    const children = (intersection.child as unknown[]) || [];
    return {
      kind: "intersection",
      children: children.map((c) =>
        parseUserset((c as Record<string, unknown>) || {}),
      ),
    };
  }

  const difference = u.difference as Record<string, unknown> | undefined;
  if (difference) {
    return {
      kind: "difference",
      base: parseUserset(difference.base as Record<string, unknown>),
      subtract: parseUserset(difference.subtract as Record<string, unknown>),
    };
  }

  // Empty or unknown oneof — treat as `this` so the AST stays well-formed.
  return { kind: "this" };
}

function parseRelationReference(ref: Record<string, unknown>): TypeRestriction {
  const type = (ref.type as string) || "";
  if (ref.wildcard !== undefined) {
    return { kind: "wildcard", type };
  }
  if (typeof ref.relation === "string" && ref.relation) {
    return { kind: "userset", type, relation: ref.relation };
  }
  if (typeof ref.condition === "string" && ref.condition) {
    return { kind: "direct", type, condition: ref.condition };
  }
  return { kind: "direct", type };
}

