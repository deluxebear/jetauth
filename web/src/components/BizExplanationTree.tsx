// Renders the output of explainExpand() — a hierarchical "why allowed?"
// list with green checkmarks on the matching path and gray dimmed
// branches on tried-but-failed alternatives.

import { CheckCircle2, MinusCircle } from "lucide-react";
import type { ExplanationStep } from "../utils/explain";

interface Props {
  steps: ExplanationStep[];
  /** Indentation level — set automatically on recursion. */
  depth?: number;
}

export default function BizExplanationTree({ steps, depth = 0 }: Props) {
  if (steps.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1.5">
      {steps.map((step, i) => (
        <ExplanationItem key={i} step={step} depth={depth} />
      ))}
    </ul>
  );
}

function ExplanationItem({ step, depth }: { step: ExplanationStep; depth: number }) {
  const indent = depth * 18; // px per level
  const passColor = step.pass ? "text-success" : "text-text-muted/60";
  const Icon = step.pass ? CheckCircle2 : MinusCircle;
  return (
    <li>
      <div
        className={`flex items-start gap-2 text-[12px] ${passColor}`}
        style={{ paddingLeft: indent }}
      >
        <Icon className={`w-3.5 h-3.5 shrink-0 mt-[2px] ${step.pass ? "" : "opacity-50"}`} />
        <span className={step.kind === "leaf" ? "font-mono text-text-secondary" : ""}>
          {step.description}
        </span>
      </div>
      {step.children.length > 0 && (
        <div className="mt-1">
          <BizExplanationTree steps={step.children} depth={depth + 1} />
        </div>
      )}
    </li>
  );
}
