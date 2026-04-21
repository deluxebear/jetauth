import type { ReactNode } from "react";
import { Save, Check } from "lucide-react";

// Shared spinner / success-check / fallback icon used by SaveButton and
// SplitButton so both evolve in lock-step.
export function SaveStateIcon({
  saving, saved, fallback,
}: {
  saving: boolean;
  saved: boolean;
  fallback?: ReactNode;
}) {
  if (saving) {
    return <div className="h-3.5 w-3.5 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />;
  }
  if (saved) return <Check size={14} />;
  return <>{fallback ?? <Save size={14} />}</>;
}

export const saveButtonToneClass = (saved: boolean) =>
  saved
    ? "border-success text-success bg-success/10"
    : "border-accent text-accent hover:bg-accent/10";

export default function SaveButton({ onClick, saving, saved, label, disabled }: {
  onClick: () => void;
  saving: boolean;
  saved: boolean;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={saving || disabled}
      className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] font-semibold disabled:opacity-50 transition-all duration-300 ${saveButtonToneClass(saved)}`}
    >
      <SaveStateIcon saving={saving} saved={saved} />
      {label}
    </button>
  );
}
