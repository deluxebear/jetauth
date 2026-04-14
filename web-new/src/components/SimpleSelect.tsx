import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

export default function SimpleSelect({ value, options, onChange, disabled, className }: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
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
        className={`flex items-center rounded-lg border bg-surface-2 px-2.5 py-2 min-h-[38px] transition-colors ${
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
        } ${open ? "border-accent ring-1 ring-accent/30" : "border-border"}`}>
        <span className={`text-[13px] flex-1 ${value ? "text-text-primary" : "text-text-muted"}`}>{value ? selectedLabel : "—"}</span>
        <ChevronDown size={14} className={`text-text-muted shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </div>
      {open && (
        <div className="absolute z-[60] mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-border bg-surface-1 py-1 shadow-lg">
          {options.map((opt) => (
            <button key={opt.value} type="button" onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`flex w-full items-center px-3 py-2 text-[13px] text-left transition-colors ${
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
