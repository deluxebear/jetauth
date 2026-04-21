import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import SideHtml from "../shell/SideHtml";

interface Props {
  children: ReactNode;
  sideHtml?: string;
}

/**
 * formOffset=4: form on one side, user-supplied HTML panel on the other.
 * Mobile: side HTML becomes a collapsible accordion above the form.
 */
export default function SidePanel({ children, sideHtml }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="min-h-screen flex flex-col lg:flex-row"
      data-cfg-section="layout"
      data-cfg-field="formOffset"
    >
      {/* Mobile accordion */}
      {sideHtml && (
        <div className="lg:hidden border-b border-border">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="flex w-full items-center justify-between px-6 py-3 text-[13px] text-text-secondary"
          >
            <span>Details</span>
            <ChevronDown size={16} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
          </button>
          {open && (
            <div className="px-6 pb-4">
              <SideHtml html={sideHtml} />
            </div>
          )}
        </div>
      )}
      <div className="w-full lg:w-[480px] lg:flex-shrink-0 bg-surface-0 relative z-10">
        {children}
      </div>
      <div className="hidden lg:flex flex-1 bg-surface-1 p-12 items-center justify-center overflow-y-auto">
        <div className="max-w-lg w-full">
          <SideHtml html={sideHtml} />
        </div>
      </div>
    </div>
  );
}
