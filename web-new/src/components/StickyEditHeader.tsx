import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

/**
 * Sticky header bar for all edit pages.
 * Stays pinned at the top when the user scrolls, with a blurred backdrop.
 * Optionally renders a tab bar below the title row (also sticky).
 */
export default function StickyEditHeader({
  title,
  subtitle,
  onBack,
  tabs,
  children,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  /** Optional tab bar rendered below the title, inside the sticky area */
  tabs?: ReactNode;
  /** Right-side action buttons (Save, Delete, etc.) */
  children?: ReactNode;
}) {
  return (
    <div className="sticky top-0 z-30 -mx-6 -mt-6 mb-6 px-6 bg-surface-0/80 backdrop-blur-md border-b border-border-subtle">
      <div className="flex items-center justify-between py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{title}</h1>
            {subtitle && (
              <p className="text-[13px] text-text-muted font-mono mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
        {children && <div className="flex items-center gap-2">{children}</div>}
      </div>
      {tabs}
    </div>
  );
}
