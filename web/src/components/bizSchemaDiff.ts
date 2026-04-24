// Pure diff helpers for the Schema Change Plan modal. Two independent
// concerns bundled here because both are small and both are consumed
// by the same caller:
//
//   - diffSchemas: structural diff over the AST (types/relations
//     added/removed). Drives the red banner for destructive changes
//     and the conflict-tuple categorization in the Plan.
//   - diffLines: naive line-level text diff for the DSL side-by-side
//     view. LCS-based; good enough for <500-line schemas.

import type { SchemaAST } from "./bizSchemaAst";

export interface SchemaStructuralDiff {
  typesAdded: string[];
  typesRemoved: string[];
  /** "type#relation" keys. */
  relationsAdded: string[];
  relationsRemoved: string[];
  isDestructive: boolean;
}

export function diffSchemas(
  before: SchemaAST,
  after: SchemaAST,
): SchemaStructuralDiff {
  const beforeTypes = new Map(before.types.map((t) => [t.name, t]));
  const afterTypes = new Map(after.types.map((t) => [t.name, t]));

  const typesAdded: string[] = [];
  const typesRemoved: string[] = [];
  for (const name of afterTypes.keys())
    if (!beforeTypes.has(name)) typesAdded.push(name);
  for (const name of beforeTypes.keys())
    if (!afterTypes.has(name)) typesRemoved.push(name);

  const relationsAdded: string[] = [];
  const relationsRemoved: string[] = [];

  for (const [typeName, td] of afterTypes) {
    const priorRelations = new Set(
      beforeTypes.get(typeName)?.relations.map((r) => r.name) ?? [],
    );
    for (const r of td.relations) {
      if (!priorRelations.has(r.name))
        relationsAdded.push(`${typeName}#${r.name}`);
    }
  }
  for (const [typeName, td] of beforeTypes) {
    const nextRelations = new Set(
      afterTypes.get(typeName)?.relations.map((r) => r.name) ?? [],
    );
    for (const r of td.relations) {
      if (!nextRelations.has(r.name))
        relationsRemoved.push(`${typeName}#${r.name}`);
    }
  }

  return {
    typesAdded,
    typesRemoved,
    relationsAdded,
    relationsRemoved,
    isDestructive: typesRemoved.length > 0 || relationsRemoved.length > 0,
  };
}

// ── Line diff (LCS) ──────────────────────────────────────────────────

export type LineDiffKind = "context" | "added" | "removed";

export interface DiffLine {
  kind: LineDiffKind;
  text: string;
  /** 0-based index in the "before" text; undefined for added lines */
  beforeLine?: number;
  /** 0-based index in the "after" text; undefined for removed lines */
  afterLine?: number;
}

export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  // trim trailing empty line produced by a trailing newline
  if (a.length > 0 && a[a.length - 1] === "") a.pop();
  if (b.length > 0 && b[b.length - 1] === "") b.pop();

  const m = a.length;
  const n = b.length;
  // LCS DP table of size (m+1)*(n+1)
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push({ kind: "context", text: a[i], beforeLine: i, afterLine: j });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ kind: "removed", text: a[i], beforeLine: i });
      i++;
    } else {
      out.push({ kind: "added", text: b[j], afterLine: j });
      j++;
    }
  }
  while (i < m) {
    out.push({ kind: "removed", text: a[i], beforeLine: i });
    i++;
  }
  while (j < n) {
    out.push({ kind: "added", text: b[j], afterLine: j });
    j++;
  }
  return out;
}
