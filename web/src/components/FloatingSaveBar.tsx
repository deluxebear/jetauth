import { AnimatePresence, motion } from "framer-motion";
import { Undo2, Save } from "lucide-react";
import { useTranslation } from "../i18n";

interface Props {
  visible: boolean;
  saving?: boolean;
  onDiscard: () => void;
  onSave: () => void;
  message?: string;
}

export default function FloatingSaveBar({ visible, saving, onDiscard, onSave, message }: Props) {
  const { t } = useTranslation();

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-3 rounded-2xl border border-border bg-surface-0 px-4 py-2.5 shadow-[var(--shadow-elevated)]"
          role="region"
          aria-label="Unsaved changes"
        >
          <span className="inline-flex h-2 w-2 rounded-full bg-warning animate-pulse" />
          <span className="text-[13px] text-text-secondary whitespace-nowrap">
            {message ?? t("common.unsavedChanges" as any)}
          </span>
          <div className="h-5 w-px bg-border mx-1" />
          <button
            type="button"
            onClick={onDiscard}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-surface-2 disabled:opacity-50 transition-colors"
          >
            <Undo2 size={13} />
            {t("common.discardChanges" as any)}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <div className="h-3 w-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            ) : (
              <Save size={13} />
            )}
            {t("common.save")}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
