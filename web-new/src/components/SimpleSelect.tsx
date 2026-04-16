import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
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
  const [pos, setPos] = useState<{ top: number; left: number; width: number; dropUp: boolean }>({ top: 0, left: 0, width: 0, dropUp: false });
  const ref = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      if (dropdownRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Reposition on scroll/resize while open
  useEffect(() => {
    if (!open || !ref.current) return;
    const update = () => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropUp = spaceBelow < 260;
      setPos({
        top: dropUp ? rect.top : rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        dropUp,
      });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  const handleOpen = useCallback(() => {
    if (disabled) return;
    setOpen((prev) => !prev);
  }, [disabled]);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? value;

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <div onClick={handleOpen}
        className={`flex items-center border bg-surface-2 transition-colors ${
          compact ? "rounded px-2 py-1 min-h-[30px]" : "rounded-lg px-2.5 py-2 min-h-[38px]"
        } ${
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
        } ${open ? "border-accent ring-1 ring-accent/30" : "border-border"}`}>
        <span className={`${compact ? "text-[12px]" : "text-[13px]"} flex-1 ${value ? "text-text-primary" : "text-text-muted"}`}>{value ? selectedLabel : "—"}</span>
        <ChevronDown size={compact ? 12 : 14} className={`text-text-muted shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </div>
      {open && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: "fixed",
            left: pos.left,
            width: Math.max(pos.width, compact ? 140 : 0),
            ...(pos.dropUp
              ? { bottom: window.innerHeight - pos.top + 4 }
              : { top: pos.top }),
          }}
          className="z-[9999] max-h-60 overflow-y-auto rounded-xl border border-border bg-surface-1 py-1 shadow-[var(--shadow-elevated)]"
        >
          {options.map((opt) => (
            <button key={opt.value} type="button" onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`flex w-full items-center px-3 ${compact ? "py-1.5 text-[12px]" : "py-2 text-[13px]"} text-left transition-colors ${
                opt.value === value ? "text-accent bg-accent/5 font-medium" : "text-text-primary hover:bg-surface-2"
              }`}>
              {opt.label || "—"}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
