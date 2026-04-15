import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Multi-select dropdown with search.
 * Shows selected items as removable chips, with a search input for filtering options.
 */
export default function MultiSearchSelect({ selected, options, onChange, placeholder, disabled }: {
  selected: string[];
  options: { value: string; label: string }[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(""); } };
    if (open) { document.addEventListener("mousedown", handler); return () => document.removeEventListener("mousedown", handler); }
  }, [open]);

  const filtered = options.filter((o) =>
    !selected.includes(o.value) &&
    (o.label.toLowerCase().includes(search.toLowerCase()) || o.value.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div ref={ref} className="relative">
      <div onClick={() => { if (disabled) return; setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}
        className={`flex flex-wrap gap-1.5 rounded-lg border bg-surface-2 px-2.5 py-2 pr-8 min-h-[38px] transition-colors ${
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-text"
        } ${open ? "border-accent ring-1 ring-accent/30" : "border-border"}`}>
        {selected.map((val) => {
          const label = options.find((o) => o.value === val)?.label ?? val;
          return (
            <span key={val} className="inline-flex items-center gap-1 rounded-full bg-accent/15 border border-accent/20 px-2 py-0.5 text-[11px] font-mono font-medium text-accent">
              {label}
              {!disabled && (
                <button onClick={(e) => { e.stopPropagation(); onChange(selected.filter((s) => s !== val)); }} className="hover:text-danger transition-colors text-[10px] ml-0.5">×</button>
              )}
            </span>
          );
        })}
        {!disabled && (
          <input ref={inputRef} value={search} onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
            placeholder={selected.length === 0 ? placeholder : ""} className="flex-1 min-w-[80px] bg-transparent text-[12px] text-text-primary outline-none placeholder:text-text-muted" />
        )}
        <ChevronDown size={14} className={`absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-[60] mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-border bg-surface-1 py-1 shadow-[var(--shadow-elevated)]">
          {filtered.map((opt) => (
            <button key={opt.value} type="button" onClick={() => { onChange([...selected, opt.value]); setSearch(""); }}
              className="flex w-full items-center px-3 py-2 text-[13px] text-left text-text-primary hover:bg-surface-2 transition-colors">
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
