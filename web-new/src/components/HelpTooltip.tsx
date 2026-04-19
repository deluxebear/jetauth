import { Info } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  content: ReactNode;
  size?: number;
  className?: string;
}

export default function HelpTooltip({ content, size = 13, className = "" }: Props) {
  // Named group `group/tip` so a parent `.group` (e.g. <details className="group">)
  // can't capture our hover — each tip only reacts to its own icon.
  return (
    <span className={`relative group/tip inline-flex items-center ${className}`}>
      <Info size={size} className="text-text-muted group-hover/tip:text-text-secondary cursor-help" />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 hidden group-hover/tip:block w-max max-w-[280px] rounded-md bg-slate-900 dark:bg-slate-700 px-2.5 py-1.5 text-[11px] font-medium text-white shadow-lg z-50 whitespace-normal leading-relaxed"
      >
        {content}
      </span>
    </span>
  );
}
