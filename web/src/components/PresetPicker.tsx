import { useEffect, useState } from "react";
import { useTranslation } from "../i18n";
import { fetchEmailPresets, type EmailPreset } from "../data/emailPresets";

type Props = { onPick: (p: EmailPreset) => void };

export function PresetPicker({ onPick }: Props) {
  const { t } = useTranslation();
  const [presets, setPresets] = useState<EmailPreset[]>([]);
  useEffect(() => {
    fetchEmailPresets().then(setPresets).catch(() => setPresets([]));
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[12px] text-text-secondary">{t("providers.httpEmail.preset" as any)}:</span>
      {presets.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => onPick(p)}
          className="rounded-lg border border-border px-2.5 py-1 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors"
          title={p.docs || p.name}
        >
          {p.name}
        </button>
      ))}
    </div>
  );
}
