// explain.ts — translates a BizExpandNode tree into a human-readable
// "why allowed?" tree for the Check tester. Walker is schema-agnostic:
// it descends the engine's rewrite tree and emits one ExplanationStep
// per branch, marking which branches contain the queried user so the
// UI can render passes (✓), tried-but-failed (✗ in gray), and final
// resolved tuple references inline.
//
// Schema introspection (mapping computed_userset.relation back to the
// schema's union/intersection definition string) is OUT OF SCOPE for
// this iteration — the walker just describes operator types in NL.
// A future pass can lift relation definitions from the schema for
// richer phrasing like "viewer 通过 编辑者 → 查看者 的联合定义".

import type { BizExpandNode } from "../backend/BizBackend";

export interface ExplainQuery {
  user: string;        // e.g. "user:carol"
  relation: string;    // e.g. "viewer"
  object: string;      // e.g. "document:roadmap-2026"
}

export type StepKind =
  | "direct"           // "this" leaf — lists users directly
  | "computed"         // "通过 <relation>"
  | "ttu"              // tuple_to_userset — "<computed> from <tupleset>"
  | "union"            // 联合
  | "intersection"     // 交集
  | "difference"       // 差集
  | "leaf";            // a tuple-reference leaf marking the actual match

export interface ExplanationStep {
  kind: StepKind;
  /** "通过 viewer" / "viewer 直接成员" / "user:carol · member · group:design" etc. */
  description: string;
  /** True if this branch contains the queried user (passes). */
  pass: boolean;
  /** When kind === "leaf", the tuple reference that matched. */
  tupleRef?: string;
  /** Sub-steps for compound rewrites (computed/ttu/union/...). */
  children: ExplanationStep[];
}

const PHRASES = {
  zh: {
    direct: (rel: string, match: boolean) =>
      match ? `${rel} 直接成员包含 USER` : `${rel} 直接成员未命中`,
    computed: (relFrom: string, relTo: string) =>
      `通过 ${relFrom} → ${relTo}`,
    ttu: (computed: string, tupleset: string) =>
      `${computed} from ${tupleset}`,
    union: (rel: string) => `${rel} 通过联合定义`,
    intersection: (rel: string) => `${rel} 通过交集定义`,
    difference: (rel: string) => `${rel} 通过差集定义`,
  },
  en: {
    direct: (rel: string, match: boolean) =>
      match ? `${rel} direct members include USER` : `${rel} direct members no match`,
    computed: (relFrom: string, relTo: string) =>
      `via ${relFrom} → ${relTo}`,
    ttu: (computed: string, tupleset: string) =>
      `${computed} from ${tupleset}`,
    union: (rel: string) => `${rel} via union`,
    intersection: (rel: string) => `${rel} via intersection`,
    difference: (rel: string) => `${rel} via difference`,
  },
};

export function explainExpand(
  root: BizExpandNode,
  query: ExplainQuery,
  lang: "zh" | "en" = "zh",
): ExplanationStep[] {
  return walk(root, query.relation, query, PHRASES[lang]);
}

function walk(
  node: BizExpandNode,
  currentRelation: string,
  query: ExplainQuery,
  phrases: typeof PHRASES["zh"],
): ExplanationStep[] {
  switch (node.kind) {
    case "this": {
      const matched = !!node.users?.includes(query.user);
      const step: ExplanationStep = {
        kind: "direct",
        description: phrases.direct(currentRelation, matched).replace("USER", query.user),
        pass: matched,
        children: [],
      };
      if (matched) {
        // Add a leaf step naming the matching tuple.
        step.children.push({
          kind: "leaf",
          description: `${query.object} · ${currentRelation} · ${query.user}`,
          pass: true,
          tupleRef: query.user,
          children: [],
        });
      }
      return [step];
    }
    case "computed_userset": {
      const child = (node.children?.[0] ?? null) as BizExpandNode | null;
      const targetRel = node.computed?.relation ?? "?";
      const subSteps = child ? walk(child, targetRel, query, phrases) : [];
      const pass = subSteps.some((s) => s.pass);
      return [{
        kind: "computed",
        description: phrases.computed(currentRelation, targetRel),
        pass,
        children: subSteps,
      }];
    }
    case "tuple_to_userset": {
      const tt = node.tupleToUserset;
      const tuplesetRel = tt?.tupleset.relation ?? "?";
      const computedRel = tt?.computed.relation ?? "?";
      // children represent each "intermediate object" reached via tupleset
      // (e.g. parent folders); recurse into each.
      const subSteps = (node.children ?? []).flatMap((c) =>
        walk(c, computedRel, query, phrases),
      );
      const pass = subSteps.some((s) => s.pass);
      return [{
        kind: "ttu",
        description: phrases.ttu(computedRel, tuplesetRel),
        pass,
        children: subSteps,
      }];
    }
    case "union": {
      const subSteps = (node.children ?? []).flatMap((c) =>
        walk(c, currentRelation, query, phrases),
      );
      const pass = subSteps.some((s) => s.pass);
      return [{
        kind: "union",
        description: phrases.union(currentRelation),
        pass,
        children: subSteps,
      }];
    }
    case "intersection": {
      const subSteps = (node.children ?? []).flatMap((c) =>
        walk(c, currentRelation, query, phrases),
      );
      const pass = subSteps.length > 0 && subSteps.every((s) => s.pass);
      return [{
        kind: "intersection",
        description: phrases.intersection(currentRelation),
        pass,
        children: subSteps,
      }];
    }
    case "difference": {
      const baseSteps = node.base ? walk(node.base, currentRelation, query, phrases) : [];
      const subSteps = node.subtract ? walk(node.subtract, currentRelation, query, phrases) : [];
      const basePass = baseSteps.some((s) => s.pass);
      const subPass = subSteps.some((s) => s.pass);
      return [{
        kind: "difference",
        description: phrases.difference(currentRelation),
        pass: basePass && !subPass,
        children: [...baseSteps, ...subSteps.map((s) => ({ ...s, description: `减去: ${s.description}` }))],
      }];
    }
    default:
      // Unknown kind — render the raw kind as a leaf with pass=false.
      return [{
        kind: "leaf",
        description: `[unknown: ${node.kind}]`,
        pass: false,
        children: [],
      }];
  }
}
