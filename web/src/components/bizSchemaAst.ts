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
      return action.ast;
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

// The DSL puts type restrictions inside the square brackets that
// accompany `this` / a bare `[...]` list. Other rewrites (union,
// intersection, etc.) don't take restrictions; the list is emitted
// only when the rewrite evaluates to a direct `this`.
function renderRelationBody(rel: RelationDef): string {
  return renderRewriteWithRestrictions(rel.rewrite, rel.typeRestrictions);
}

function renderRewriteWithRestrictions(
  node: RewriteNode,
  restrictions: TypeRestriction[],
): string {
  if (node.kind === "this") {
    return renderRestrictions(restrictions);
  }
  if (node.kind === "union" || node.kind === "intersection") {
    // `this` as one branch of a union/intersection carries the
    // restriction list in its slot; other branches emit normally.
    const kw = node.kind === "union" ? " or " : " and ";
    const parts = node.children.map((c) =>
      c.kind === "this"
        ? renderRestrictions(restrictions)
        : renderRewriteAtom(c),
    );
    return parts.join(kw);
  }
  if (node.kind === "difference") {
    const base =
      node.base.kind === "this"
        ? renderRestrictions(restrictions)
        : renderRewriteAtom(node.base);
    return `${base} but not ${renderRewriteAtom(node.subtract)}`;
  }
  return renderRewriteAtom(node);
}

function renderRewriteAtom(node: RewriteNode): string {
  switch (node.kind) {
    case "this":
      return "[]";
    case "computedUserset":
      return node.relation || "_unset_";
    case "tupleToUserset":
      return `${node.computedUserset || "_unset_"} from ${node.tupleset || "_unset_"}`;
    case "union":
      return `(${node.children.map(renderRewriteAtom).join(" or ")})`;
    case "intersection":
      return `(${node.children.map(renderRewriteAtom).join(" and ")})`;
    case "difference":
      return `(${renderRewriteAtom(node.base)} but not ${renderRewriteAtom(node.subtract)})`;
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

interface RawTypeDef {
  type?: string;
  relations?: Record<string, RawUserset>;
  metadata?: {
    relations?: Record<string, RawRelationMetadata>;
  };
}

interface RawRelationMetadata {
  directlyRelatedUserTypes?: RawRelationReference[];
}

interface RawRelationReference {
  type?: string;
  relation?: string;
  wildcard?: Record<string, unknown>;
  condition?: string;
}

interface RawObjectRelation {
  object?: string;
  relation?: string;
}

interface RawUserset {
  this?: Record<string, unknown>;
  computedUserset?: RawObjectRelation;
  tupleToUserset?: {
    tupleset?: RawObjectRelation;
    computedUserset?: RawObjectRelation;
  };
  union?: { child?: RawUserset[] };
  intersection?: { child?: RawUserset[] };
  difference?: { base?: RawUserset; subtract?: RawUserset };
}

export function parseSchemaJson(jsonText: string): SchemaAST {
  if (!jsonText.trim()) return emptyAST();
  let raw: RawModel;
  try {
    raw = JSON.parse(jsonText) as RawModel;
  } catch {
    return emptyAST();
  }

  const types: TypeDef[] = (raw.typeDefinitions || []).map((td) => {
    const relationsMap = td.relations || {};
    const metaRelations = td.metadata?.relations || {};
    const relations: RelationDef[] = Object.keys(relationsMap).map((name) => ({
      id: newId(),
      name,
      rewrite: parseUserset(relationsMap[name]),
      typeRestrictions: (
        metaRelations[name]?.directlyRelatedUserTypes || []
      ).map(parseRelationReference),
    }));
    return {
      id: newId(),
      name: td.type || "",
      relations,
    };
  });

  const ast: SchemaAST = {
    schemaVersion: "1.1",
    types,
  };
  if (raw.conditions && Object.keys(raw.conditions).length > 0) {
    ast.rawConditionsJson = JSON.stringify(raw.conditions);
  }
  return ast;
}

function parseUserset(u: RawUserset | undefined): RewriteNode {
  if (!u) return { kind: "this" };
  if (u.this !== undefined) return { kind: "this" };
  if (u.computedUserset) {
    return {
      kind: "computedUserset",
      relation: u.computedUserset.relation || "",
    };
  }
  if (u.tupleToUserset) {
    return {
      kind: "tupleToUserset",
      tupleset: u.tupleToUserset.tupleset?.relation || "",
      computedUserset: u.tupleToUserset.computedUserset?.relation || "",
    };
  }
  if (u.union) {
    return { kind: "union", children: (u.union.child || []).map(parseUserset) };
  }
  if (u.intersection) {
    return {
      kind: "intersection",
      children: (u.intersection.child || []).map(parseUserset),
    };
  }
  if (u.difference) {
    return {
      kind: "difference",
      base: parseUserset(u.difference.base),
      subtract: parseUserset(u.difference.subtract),
    };
  }
  // Empty or unknown oneof — treat as `this` so the AST stays well-formed.
  return { kind: "this" };
}

function parseRelationReference(ref: RawRelationReference): TypeRestriction {
  const type = ref.type || "";
  if (ref.wildcard !== undefined) {
    return { kind: "wildcard", type };
  }
  if (ref.relation) {
    return { kind: "userset", type, relation: ref.relation };
  }
  return ref.condition
    ? { kind: "direct", type, condition: ref.condition }
    : { kind: "direct", type };
}

// Short display strings for the rewrite placeholder (Task 5b replaces
// this with a real editor). Kept here so Task 5a's component is a pure
// renderer — no switch statements in JSX.
export function formatRewriteSummary(node: RewriteNode): string {
  switch (node.kind) {
    case "this":
      return "this";
    case "computedUserset":
      return `computed_userset(${node.relation || "?"})`;
    case "tupleToUserset":
      return `tuple_to_userset(${node.tupleset || "?"} → ${node.computedUserset || "?"})`;
    case "union":
      return `union [${node.children.length}]`;
    case "intersection":
      return `intersection [${node.children.length}]`;
    case "difference":
      return "difference";
  }
}

export function formatTypeRestrictionSummary(r: TypeRestriction): string {
  switch (r.kind) {
    case "direct":
      return r.condition ? `${r.type} with ${r.condition}` : r.type;
    case "wildcard":
      return `${r.type}:*`;
    case "userset":
      return `${r.type}#${r.relation}`;
  }
}
