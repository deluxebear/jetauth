import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { SaveStateIcon, saveButtonToneClass } from "./SaveButton";

export type SplitButtonAction = {
  key: string;
  label: string;
  icon?: React.ReactNode;
  description?: string;
  onSelect: () => void;
};

type Props = {
  saving: boolean;
  saved: boolean;
  disabled?: boolean;
  primary: SplitButtonAction;
  actions: SplitButtonAction[];
  align?: "left" | "right";
};

export default function SplitButton({
  saving,
  saved,
  disabled,
  primary,
  actions,
  align = "right",
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const baseBtn =
    "flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold disabled:opacity-50 transition-all duration-300";
  const toneClass = saveButtonToneClass(saved);

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        onClick={primary.onSelect}
        disabled={saving || disabled}
        className={`${baseBtn} rounded-l-lg rounded-r-none border border-r-0 ${toneClass}`}
      >
        <SaveStateIcon saving={saving} saved={saved} fallback={primary.icon} />
        {primary.label}
      </button>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={saving || disabled}
        className={`${baseBtn} rounded-r-lg rounded-l-none border px-2 ${toneClass}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <ChevronDown size={14} />
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute top-[calc(100%+4px)] ${
            align === "right" ? "right-0" : "left-0"
          } z-40 min-w-[240px] rounded-lg border border-border bg-surface-1 p-1 shadow-[var(--shadow-elevated)]`}
        >
          {actions.map((a) => (
            <button
              key={a.key}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                a.onSelect();
              }}
              className="flex w-full items-start gap-2 rounded px-2.5 py-2 text-left text-[13px] text-text-primary hover:bg-surface-2 transition-colors"
            >
              {a.icon && (
                <span className="mt-0.5 shrink-0 text-text-muted">{a.icon}</span>
              )}
              <span className="flex-1">
                <span className="block font-medium">{a.label}</span>
                {a.description && (
                  <span className="mt-0.5 block text-[11px] text-text-muted">
                    {a.description}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
