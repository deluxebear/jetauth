import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "../i18n";
import type { RewriteNode, TypeRestriction } from "./bizSchemaAst";

// Recursive editor for a RewriteNode tree. Every node renders its own
// kind picker, per-kind body, and (when a parent opts in) move/delete
// controls. Parents re-assemble the tree by calling `onChange` with the
// new node — path-based updates live in the parent, keeping this
// component purely local.
//
// Task 5b/c/d are implemented together in this file because the
// components all operate on RewriteNode; splitting them would force a
// context dance without clarifying any boundary. Type-restriction
// editing (spec §5.3) lives in BizTypeRestrictionsEditor below.

interface RewriteEditorProps {
  node: RewriteNode;
  onChange: (next: RewriteNode) => void;
  onDelete?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  depth?: number;
  // Some slots can't change kind to `this` (e.g. the subtract side of
  // difference doesn't take a type-restriction list).
  allowThis?: boolean;
}

type RewriteKind = RewriteNode["kind"];

const ALL_KINDS: RewriteKind[] = [
  "this",
  "computedUserset",
  "tupleToUserset",
  "union",
  "intersection",
  "difference",
];

export function BizRewriteEditor({
  node,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  depth = 0,
  allowThis = true,
}: RewriteEditorProps) {
  const { t } = useTranslation();
  const indent = Math.min(depth, 6);
  return (
    <div
      className="rounded-md border border-border bg-surface-0 p-2 flex flex-col gap-2"
      style={{ marginLeft: indent === 0 ? 0 : 8 }}
    >
      <div className="flex items-center gap-1.5 flex-wrap">
        <select
          className="px-2 py-0.5 rounded border border-border bg-surface-1 text-[12px] text-text-primary font-mono"
          value={node.kind}
          onChange={(e) => onChange(defaultForKind(e.target.value as RewriteKind))}
        >
          {ALL_KINDS.filter((k) => allowThis || k !== "this").map((k) => (
            <option key={k} value={k}>
              {t(`rebac.rewrite.${kindToKey(k)}` as any)}
            </option>
          ))}
        </select>
        <div className="flex-1" />
        {onMoveUp && (
          <button
            type="button"
            className="p-1 text-text-muted hover:text-text-primary hover:bg-surface-2 rounded"
            title={t("rebac.rewrite.moveUp")}
            onClick={onMoveUp}
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
        )}
        {onMoveDown && (
          <button
            type="button"
            className="p-1 text-text-muted hover:text-text-primary hover:bg-surface-2 rounded"
            title={t("rebac.rewrite.moveDown")}
            onClick={onMoveDown}
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            className="p-1 text-text-muted hover:text-danger hover:bg-danger/10 rounded"
            title={t("rebac.rewrite.remove" as any) || "remove"}
            onClick={onDelete}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <RewriteBody node={node} onChange={onChange} depth={depth} />
    </div>
  );
}

function RewriteBody({
  node,
  onChange,
  depth,
}: {
  node: RewriteNode;
  onChange: (next: RewriteNode) => void;
  depth: number;
}) {
  const { t } = useTranslation();
  switch (node.kind) {
    case "this":
      return (
        <p className="text-[11px] text-text-muted italic px-1">
          {t("rebac.rewrite.thisHint")}
        </p>
      );
    case "computedUserset":
      return (
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-text-muted whitespace-nowrap">
            {t("rebac.rewrite.computedUserset.relation")}
          </label>
          <input
            className="flex-1 px-2 py-0.5 rounded border border-border bg-surface-1 text-[12px] font-mono"
            placeholder="e.g. viewer"
            value={node.relation}
            onChange={(e) => onChange({ ...node, relation: e.target.value })}
          />
        </div>
      );
    case "tupleToUserset":
      return (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-text-muted w-24 shrink-0">
              {t("rebac.rewrite.ttu.targetRelation")}
            </label>
            <input
              className="flex-1 px-2 py-0.5 rounded border border-border bg-surface-1 text-[12px] font-mono"
              placeholder="e.g. viewer"
              value={node.computedUserset}
              onChange={(e) =>
                onChange({ ...node, computedUserset: e.target.value })
              }
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-text-muted w-24 shrink-0">
              {t("rebac.rewrite.ttu.fromRelation")}
            </label>
            <input
              className="flex-1 px-2 py-0.5 rounded border border-border bg-surface-1 text-[12px] font-mono"
              placeholder="e.g. parent"
              value={node.tupleset}
              onChange={(e) => onChange({ ...node, tupleset: e.target.value })}
            />
          </div>
        </div>
      );
    case "union":
    case "intersection":
      return (
        <ChildrenList
          kind={node.kind}
          children={node.children}
          onChange={(children) => {
            // Collapse to the single remaining child when the user
            // deletes the penultimate branch — a 1-child union/intersection
            // is a no-op operator and should not surface in the UI
            // (review finding N2).
            if (children.length === 1) {
              onChange(children[0]);
            } else {
              onChange({ ...node, children });
            }
          }}
          depth={depth}
        />
      );
    case "difference":
      return (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">
              {t("rebac.rewrite.diffBase")}
            </span>
            <BizRewriteEditor
              node={node.base}
              onChange={(next) => onChange({ ...node, base: next })}
              depth={depth + 1}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">
              {t("rebac.rewrite.diffSubtract")}
            </span>
            <BizRewriteEditor
              node={node.subtract}
              onChange={(next) => onChange({ ...node, subtract: next })}
              depth={depth + 1}
              // The subtract side can be any rewrite; restriction list
              // stays with the relation's base-side `this`, so no
              // restriction UI is needed here.
              allowThis={true}
            />
          </div>
        </div>
      );
  }
}

function ChildrenList({
  kind,
  children,
  onChange,
  depth,
}: {
  kind: "union" | "intersection";
  children: RewriteNode[];
  onChange: (children: RewriteNode[]) => void;
  depth: number;
}) {
  const { t } = useTranslation();
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= children.length) return;
    const next = [...children];
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  };
  const remove = (idx: number) => {
    onChange(children.filter((_, i) => i !== idx));
  };
  const update = (idx: number, n: RewriteNode) => {
    const next = [...children];
    next[idx] = n;
    onChange(next);
  };
  const add = () => {
    onChange([...children, { kind: "this" }]);
  };
  return (
    <div className="flex flex-col gap-1.5">
      {children.map((child, i) => (
        <BizRewriteEditor
          key={i}
          node={child}
          onChange={(n) => update(i, n)}
          // Allow delete down to 1 — the parent's onChange collapses
          // 1-child union/intersection to the remaining child (N2).
          onDelete={children.length > 1 ? () => remove(i) : undefined}
          onMoveUp={i > 0 ? () => move(i, -1) : undefined}
          onMoveDown={i < children.length - 1 ? () => move(i, 1) : undefined}
          depth={depth + 1}
        />
      ))}
      <button
        type="button"
        onClick={add}
        className="self-start inline-flex items-center gap-1 px-2 py-0.5 rounded border border-dashed border-border text-[11px] text-text-muted hover:text-text-primary hover:border-text-primary"
      >
        <Plus className="w-3 h-3" />
        {t("rebac.rewrite.addChild")}
        <span className="ml-1 text-[10px] opacity-60">
          {kind === "union" ? "OR" : "AND"}
        </span>
      </button>
    </div>
  );
}

function defaultForKind(kind: RewriteKind): RewriteNode {
  switch (kind) {
    case "this":
      return { kind: "this" };
    case "computedUserset":
      return { kind: "computedUserset", relation: "" };
    case "tupleToUserset":
      return { kind: "tupleToUserset", tupleset: "", computedUserset: "" };
    case "union":
      return { kind: "union", children: [{ kind: "this" }, { kind: "this" }] };
    case "intersection":
      return {
        kind: "intersection",
        children: [{ kind: "this" }, { kind: "this" }],
      };
    case "difference":
      return {
        kind: "difference",
        base: { kind: "this" },
        subtract: { kind: "this" },
      };
  }
}

function kindToKey(k: RewriteKind): string {
  switch (k) {
    case "this":
      return "this";
    case "computedUserset":
      return "computedUserset";
    case "tupleToUserset":
      return "tupleToUserset";
    case "union":
      return "union";
    case "intersection":
      return "intersection";
    case "difference":
      return "difference";
  }
}

// ── Type restrictions editor (Task 5d) ──────────────────────────────
//
// A flat list of restriction rows. Each row carries a kind selector
// (direct / wildcard / userset) and inline fields appropriate to the
// kind. Restrictions only take effect when the rewrite touches `this`
// — callers decide whether to render this component at all.

type RestrictionKind = TypeRestriction["kind"];

export function BizTypeRestrictionsEditor({
  restrictions,
  onChange,
}: {
  restrictions: TypeRestriction[];
  onChange: (next: TypeRestriction[]) => void;
}) {
  const { t } = useTranslation();
  const update = (i: number, r: TypeRestriction) =>
    onChange(restrictions.map((x, idx) => (idx === i ? r : x)));
  const remove = (i: number) =>
    onChange(restrictions.filter((_, idx) => idx !== i));
  const add = () => onChange([...restrictions, { kind: "direct", type: "" }]);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">
        {t("rebac.typeRestriction.label")}
      </div>
      {restrictions.length === 0 ? (
        <p className="text-[11px] italic text-text-muted px-1">
          {t("rebac.typeRestriction.none")}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {restrictions.map((r, i) => (
            <li key={i}>
              <RestrictionRow
                restriction={r}
                onChange={(nr) => update(i, nr)}
                onRemove={() => remove(i)}
              />
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={add}
        className="self-start inline-flex items-center gap-1 px-2 py-0.5 rounded border border-dashed border-border text-[11px] text-text-muted hover:text-text-primary hover:border-text-primary"
      >
        <Plus className="w-3 h-3" />
        {t("rebac.typeRestriction.add")}
      </button>
    </div>
  );
}

function RestrictionRow({
  restriction,
  onChange,
  onRemove,
}: {
  restriction: TypeRestriction;
  onChange: (next: TypeRestriction) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const kind = restriction.kind;
  return (
    <div className="flex items-center gap-1.5">
      <select
        className="px-1.5 py-0.5 rounded border border-border bg-surface-1 text-[12px]"
        value={kind}
        onChange={(e) =>
          onChange(defaultRestriction(e.target.value as RestrictionKind))
        }
      >
        <option value="direct">{t("rebac.typeRestriction.direct")}</option>
        <option value="wildcard">{t("rebac.typeRestriction.wildcard")}</option>
        <option value="userset">{t("rebac.typeRestriction.userset")}</option>
      </select>
      <input
        className="flex-1 min-w-0 px-1.5 py-0.5 rounded border border-border bg-surface-1 text-[12px] font-mono"
        placeholder="type"
        value={restriction.type}
        onChange={(e) => onChange({ ...restriction, type: e.target.value })}
      />
      {kind === "userset" && (
        <>
          <span className="text-text-muted text-[11px]">#</span>
          <input
            className="w-28 px-1.5 py-0.5 rounded border border-border bg-surface-1 text-[12px] font-mono"
            placeholder="relation"
            value={restriction.relation}
            onChange={(e) =>
              onChange({ ...restriction, relation: e.target.value })
            }
          />
        </>
      )}
      {kind === "direct" && (
        <>
          <span className="text-text-muted text-[11px]">with</span>
          <input
            className="w-28 px-1.5 py-0.5 rounded border border-border bg-surface-1 text-[12px] font-mono"
            placeholder="condition (optional)"
            value={restriction.condition || ""}
            onChange={(e) =>
              onChange({
                ...restriction,
                condition: e.target.value || undefined,
              })
            }
          />
        </>
      )}
      <button
        type="button"
        className="p-1 text-text-muted hover:text-danger hover:bg-danger/10 rounded"
        onClick={onRemove}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function defaultRestriction(kind: RestrictionKind): TypeRestriction {
  switch (kind) {
    case "direct":
      return { kind: "direct", type: "" };
    case "wildcard":
      return { kind: "wildcard", type: "" };
    case "userset":
      return { kind: "userset", type: "", relation: "" };
  }
}

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
