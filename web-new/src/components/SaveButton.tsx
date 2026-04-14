import { Save, Check } from "lucide-react";

/**
 * Save button with success micro-animation.
 * Parent controls `saved` state: set true on success, auto-resets via useEffect.
 */
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
      className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] font-semibold disabled:opacity-50 transition-all duration-300 ${
        saved
          ? "border-success text-success bg-success/10"
          : "border-accent text-accent hover:bg-accent/10"
      }`}
    >
      {saving ? (
        <div className="h-3.5 w-3.5 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      ) : saved ? (
        <Check size={14} />
      ) : (
        <Save size={14} />
      )}
      {label}
    </button>
  );
}
