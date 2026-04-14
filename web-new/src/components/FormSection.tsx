import type { ReactNode } from "react";

// Reusable form field wrapper
export function FormField({
  label,
  required,
  help,
  span = "half",
  children,
}: {
  label: string;
  required?: boolean;
  help?: string;
  span?: "full" | "half";
  children: ReactNode;
}) {
  return (
    <div className={span === "full" ? "col-span-2" : "col-span-2 sm:col-span-1"}>
      <label className="block text-[12px] font-medium text-text-secondary mb-1.5">
        {label}
        {required && <span className="text-danger ml-0.5">*</span>}
      </label>
      {children}
      {help && <p className="text-[11px] text-text-muted mt-1">{help}</p>}
    </div>
  );
}

// Form section card with optional title
export function FormSection({
  title,
  action,
  children,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-1 overflow-visible">
      {title && (
        <div className="px-5 py-3 border-b border-border-subtle bg-surface-2/30 flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-text-primary">{title}</h3>
          {action}
        </div>
      )}
      <div className="p-5 grid grid-cols-2 gap-x-6 gap-y-4">{children}</div>
    </div>
  );
}

// ── Design Tokens ──

// Input styles
export const inputClass =
  "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed";

export const monoInputClass = `${inputClass} font-mono`;

// Inline input (for tables)
export const inlineInputClass =
  "w-full rounded-lg border border-border bg-surface-2 px-2 py-1 text-[12px] text-text-primary outline-none focus:border-accent transition-colors";

export const inlineSelectClass = `${inlineInputClass}`;

// Button styles
export const btnPrimary =
  "flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors";

export const btnOutline =
  "flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[13px] font-medium text-text-secondary hover:bg-surface-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors";

export const btnDanger =
  "flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-2 text-[13px] font-medium text-danger hover:bg-danger/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors";

export const btnAccentOutline =
  "flex items-center gap-1.5 rounded-lg border border-accent px-3 py-2 text-[13px] font-semibold text-accent hover:bg-accent/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors";

// Small button variants (for table headers)
export const btnSmPrimary =
  "flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-[12px] font-medium text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors";

export const btnSmOutline =
  "flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[12px] font-medium text-text-secondary hover:bg-surface-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors";

export const btnSmDanger =
  "flex items-center gap-1 rounded-lg border border-danger/30 px-2.5 py-1 text-[12px] font-medium text-danger hover:bg-danger/10 transition-colors";

// Icon button (inline actions)
export const btnIcon =
  "rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors";

// Table card container
export const tableCardClass =
  "rounded-xl border border-border bg-surface-1 overflow-visible";

export const tableHeaderClass =
  "px-5 py-3 border-b border-border-subtle bg-surface-2/30 flex items-center justify-between";

export const tableThClass =
  "px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted";

export const tableTdClass =
  "px-4 py-2 text-[13px]";

// Tag/chip styles
export const chipClass =
  "inline-flex items-center gap-1 rounded-full bg-accent/15 border border-accent/20 px-2 py-0.5 text-[11px] font-mono font-medium text-accent";

// Switch component
export function Switch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative h-6 w-11 rounded-full transition-colors ${
        checked ? "bg-accent" : "bg-surface-4"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : ""
        }`}
      />
    </button>
  );
}

// Tags display/input
export function TagsDisplay({ tags }: { tags: string[] }) {
  if (!tags?.length) return <span className="text-text-muted text-[12px]">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag, i) => (
        <span key={i} className={chipClass}>{tag}</span>
      ))}
    </div>
  );
}
