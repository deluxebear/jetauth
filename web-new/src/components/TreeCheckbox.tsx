import { useState, useCallback, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Check, Minus } from "lucide-react";

export interface TreeNode {
  key: string;
  label: string;
  children?: TreeNode[];
}

interface TreeCheckboxProps {
  tree: TreeNode[];
  checked: string[];
  onChange: (checked: string[]) => void;
}

export default function TreeCheckbox({ tree, checked, onChange }: TreeCheckboxProps) {
  // Default expand: "all" node is expanded so first-level groups are visible
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["all"]));

  const getAllLeaves = (nodes: TreeNode[]): string[] =>
    nodes.flatMap((n) => (n.children?.length ? getAllLeaves(n.children) : [n.key]));

  const allLeaves = getAllLeaves(tree);

  const getLeavesUnder = (node: TreeNode): string[] =>
    node.children?.length ? getAllLeaves(node.children) : [node.key];

  const getCheckState = (node: TreeNode): "checked" | "unchecked" | "partial" => {
    if (checked.includes("all") && node.key === "all") return "checked";
    if (checked.includes("all")) return "checked";
    const leaves = getLeavesUnder(node);
    if (leaves.length === 0) return checked.includes(node.key) ? "checked" : "unchecked";
    const checkedCount = leaves.filter((l) => checked.includes(l)).length;
    if (checkedCount === 0) return "unchecked";
    if (checkedCount === leaves.length) return "checked";
    return "partial";
  };

  const toggleNode = (node: TreeNode) => {
    if (node.key === "all") {
      const allChecked = checked.includes("all") || allLeaves.every((l) => checked.includes(l));
      onChange(allChecked ? [] : ["all"]);
      return;
    }
    let next = checked.filter((c) => c !== "all");
    const leaves = getLeavesUnder(node);
    const state = getCheckState(node);
    if (state === "checked") {
      const toRemove = new Set([...leaves, node.key]);
      next = next.filter((c) => !toRemove.has(c));
    } else {
      const toAdd = node.children?.length ? [...leaves, node.key] : [node.key];
      const existing = new Set(next);
      toAdd.forEach((k) => existing.add(k));
      next = Array.from(existing);
    }
    if (allLeaves.every((l) => next.includes(l))) {
      onChange(["all"]);
    } else {
      onChange(next);
    }
  };

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderNode = (node: TreeNode, depth: number = 0): ReactNode => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expanded.has(node.key);
    const state = getCheckState(node);

    return (
      <div key={node.key}>
        <div
          className="flex items-center gap-1.5 py-1 px-1 rounded-md hover:bg-surface-2/50 transition-colors"
          style={{ paddingLeft: `${depth * 20 + 4}px` }}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleExpand(node.key)}
              className="text-text-muted hover:text-text-secondary p-0.5 shrink-0"
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <span className="w-[22px] shrink-0" />
          )}
          <button
            type="button"
            onClick={() => toggleNode(node)}
            className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border-[1.5px] transition-colors ${
              state === "checked"
                ? "border-accent bg-accent text-white"
                : state === "partial"
                  ? "border-accent bg-accent/30 text-accent"
                  : "border-border bg-surface-2 hover:border-text-muted"
            }`}
          >
            {state === "checked" && <Check size={12} strokeWidth={3} />}
            {state === "partial" && <Minus size={12} strokeWidth={3} />}
          </button>
          <span
            onClick={() => toggleNode(node)}
            className="text-[13px] text-text-primary select-none cursor-pointer"
          >
            {node.label}
          </span>
        </div>
        {hasChildren && isExpanded && (
          <div>{node.children!.map((child) => renderNode(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-lg border border-border bg-surface-2 px-2 py-2 max-h-[400px] overflow-y-auto">
      {tree.map((node) => renderNode(node, 0))}
    </div>
  );
}
