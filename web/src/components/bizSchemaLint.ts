// Static analysis on the in-memory SchemaAST. Pure function; returns a
// flat list of advisory warnings (non-blocking). The DSL editor renders
// these in a side panel; they do not prevent save. Rule ids are stable
// so we can i18n each and suppress per-rule in the future.

import type { SchemaAST, RewriteNode } from "./bizSchemaAst";

export type LintRule =
  | "orphan-type"
  | "missing-subject-type"
  | "single-this-no-union";

export interface LintWarning {
  rule: LintRule;
  /** "typeName" or "typeName#relationName" — human-readable key */
  target: string;
}

/** Types conventionally treated as subject-only. `user` in every ReBAC
 *  schema we've seen is the canonical example — it has no relations
 *  because it only appears on the right-hand side of tuples. */
const SUBJECT_ONLY_TYPES = new Set(["user"]);

export function lintSchema(ast: SchemaAST): LintWarning[] {
  const warnings: LintWarning[] = [];

  // Rule: orphan-type — a non-subject type with no relations.
  for (const td of ast.types) {
    if (td.relations.length === 0 && !SUBJECT_ONLY_TYPES.has(td.name)) {
      warnings.push({ rule: "orphan-type", target: td.name });
    }
  }

  // Rule: missing-subject-type — a relation whose rewrite has a `this`
  // branch but no typeRestrictions. Such a relation admits no tuples
  // directly (type check rejects them), so it's almost always a mistake.
  for (const td of ast.types) {
    for (const rd of td.relations) {
      if (hasThisBranch(rd.rewrite) && rd.typeRestrictions.length === 0) {
        warnings.push({
          rule: "missing-subject-type",
          target: `${td.name}#${rd.name}`,
        });
      }
    }
  }

  return warnings;
}

function hasThisBranch(node: RewriteNode): boolean {
  switch (node.kind) {
    case "this":
      return true;
    case "union":
    case "intersection":
      return node.children.some(hasThisBranch);
    case "difference":
      return hasThisBranch(node.base) || hasThisBranch(node.subtract);
    default:
      return false;
  }
}
