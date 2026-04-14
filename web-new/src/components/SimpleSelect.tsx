import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

export default function SimpleSelect({ value, options, onChange, disabled, className, compact }: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
  /** Compact mode for table-embedded selects */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    if (open) { document.addEventListener("mousedown", handler); return () => document.removeEventListener("mousedown", handler); }
  }, [open]);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? value;

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <div onClick={() => { if (!disabled) setOpen(!open); }}
        className={`flex items-center border bg-surface-2 transition-colors ${
          compact ? "rounded px-2 py-1 min-h-[30px]" : "rounded-lg px-2.5 py-2 min-h-[38px]"
        } ${
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
        } ${open ? "border-accent ring-1 ring-accent/30" : "border-border"}`}>
        <span className={`${compact ? "text-[12px]" : "text-[13px]"} flex-1 ${value ? "text-text-primary" : "text-text-muted"}`}>{value ? selectedLabel : "—"}</span>
        <ChevronDown size={compact ? 12 : 14} className={`text-text-muted shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </div>
      {open && (
        <div className={`absolute z-[60] mt-1 w-full max-h-60 overflow-y-auto rounded-xl border border-border bg-surface-1 py-1 shadow-[var(--shadow-elevated)] ${compact ? "min-w-[140px]" : ""}`}>
          {options.map((opt) => (
            <button key={opt.value} type="button" onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`flex w-full items-center px-3 ${compact ? "py-1.5 text-[12px]" : "py-2 text-[13px]"} text-left transition-colors ${
                opt.value === value ? "text-accent bg-accent/5 font-medium" : "text-text-primary hover:bg-surface-2"
              }`}>
              {opt.label || "—"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
