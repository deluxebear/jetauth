import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "../i18n";

export default function SingleSearchSelect({ value, options, onChange, placeholder, disabled }: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase()) || o.value.toLowerCase().includes(search.toLowerCase())
  );
  const selectedLabel = options.find((o) => o.value === value)?.label ?? value;

  return (
    <div ref={ref} className="relative">
      <div
        onClick={() => !disabled && setOpen(!open)}
        className={`flex items-center rounded-lg border bg-surface-2 px-2.5 py-2 min-h-[38px] transition-colors ${
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
        } ${open ? "border-accent ring-1 ring-accent/30" : "border-border"}`}
      >
        {open ? (
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={placeholder}
            className="flex-1 bg-transparent text-[13px] text-text-primary outline-none placeholder:text-text-muted"
          />
        ) : (
          <span className={`text-[13px] flex-1 ${value ? "text-text-primary" : "text-text-muted"}`}>
            {value ? selectedLabel : "—"}
          </span>
        )}
        <ChevronDown size={14} className={`text-text-muted shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </div>
      {open && (
        <div className="absolute z-[60] mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-border bg-surface-1 py-1 shadow-[var(--shadow-elevated)]">
          <button
            type="button"
            onClick={() => { onChange(""); setOpen(false); setSearch(""); }}
            className={`flex w-full items-center px-3 py-2 text-[13px] text-left transition-colors ${!value ? "text-accent bg-accent/5" : "text-text-muted hover:bg-surface-2"}`}
          >
            —
          </button>
          {filtered.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); setSearch(""); }}
              className={`flex w-full items-center px-3 py-2 text-[13px] text-left transition-colors ${
                opt.value === value ? "text-accent bg-accent/5 font-medium" : "text-text-primary hover:bg-surface-2"
              }`}
            >
              {opt.label}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-[12px] text-text-muted">{t("common.noData")}</div>
          )}
        </div>
      )}
    </div>
  );
}
