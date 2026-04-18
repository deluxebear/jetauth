import { useState, type ReactNode } from "react";
import { ChevronDown, Undo2 } from "lucide-react";

type Props = {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  id?: string;
  icon?: ReactNode;
  children: ReactNode;
  modified?: boolean;
  onReset?: () => void;
  modifiedLabel?: string;
  resetLabel?: string;
  /** When true, the card shows a transient highlight ring. The caller is
   * expected to clear this (e.g. via setTimeout) after ~1.5s. Used by the
   * preview inspect feature to draw the admin's attention to a section. */
  highlight?: boolean;
};

export default function CollapsibleCard({
  title,
  subtitle,
  defaultOpen = false,
  id,
  icon,
  children,
  modified,
  onReset,
  modifiedLabel,
  resetLabel,
  highlight,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      id={id}
      className={`rounded-xl border border-border bg-surface-1 shadow-sm overflow-visible scroll-mt-20 transition-shadow duration-300 ${
        highlight ? "ring-2 ring-accent ring-offset-2 ring-offset-surface-0" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-5 py-3 border-b border-border-subtle bg-surface-2/30 rounded-t-xl hover:bg-surface-2/60 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {icon && (
            <span className="shrink-0 text-text-muted flex items-center">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold text-text-primary truncate">
              {title}
            </h3>
            {subtitle && (
              <p className="text-[12px] text-text-muted truncate mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {modified && (
            <span className="inline-flex items-center rounded-full bg-warning/15 text-warning px-2 py-0.5 text-[11px] font-medium">
              {modifiedLabel ?? "Modified"}
            </span>
          )}
          {modified && onReset && (
            <span
              role="button"
              tabIndex={0}
              aria-label={resetLabel ?? "Reset section"}
              title={resetLabel ?? "Reset section"}
              onClick={(e) => { e.stopPropagation(); onReset(); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onReset();
                }
              }}
              className="inline-flex items-center justify-center rounded-md p-1 text-text-muted hover:bg-surface-2 hover:text-text-primary transition-colors cursor-pointer"
            >
              <Undo2 size={13} />
            </span>
          )}
          <ChevronDown
            size={16}
            className={`text-text-muted transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>
      {open && (
        <div className="overflow-hidden">
          <div className="p-5 pt-4">{children}</div>
        </div>
      )}
    </section>
  );
}
