import type { RewriteNode } from "./bizSchemaAst";

// Helper: does this rewrite tree touch `this` anywhere? Used by the
// caller to decide whether type restrictions are meaningful for this
// relation.
export function rewriteTouchesThis(n: RewriteNode): boolean {
  switch (n.kind) {
    case "this":
      return true;
    case "computedUserset":
    case "tupleToUserset":
      return false;
    case "union":
    case "intersection":
      return n.children.some(rewriteTouchesThis);
    case "difference":
      return rewriteTouchesThis(n.base) || rewriteTouchesThis(n.subtract);
  }
}
