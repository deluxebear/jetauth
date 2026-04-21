// web/src/pages/ApplicationEditPage/BilingualField.tsx
//
// Admin-side input for template options that should render differently by
// locale (hero headline, subcopy, sidebar footer, etc.). Writes back a
// { zh, en } object even when the stored value was a legacy plain string —
// on first edit the option naturally migrates to bilingual shape.

import { FormField, inputClass } from "../../components/FormSection";

interface Props {
  label: string;
  value: unknown; // string (legacy) | { zh?: string; en?: string }
  onChange: (next: { zh: string; en: string }) => void;
  rows?: number;
  /** Pass "full" to span both admin grid columns. */
  span?: "full";
}

function extract(value: unknown, lang: "zh" | "en"): string {
  // Legacy plain string: show in both fields so the admin sees their
  // existing text. First edit of either field writes back a proper object.
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const v = (value as Record<string, unknown>)[lang];
    return typeof v === "string" ? v : "";
  }
  return "";
}

export default function BilingualField({ label, value, onChange, rows, span }: Props) {
  const zh = extract(value, "zh");
  const en = extract(value, "en");

  const writeZh = (v: string) => onChange({ zh: v, en });
  const writeEn = (v: string) => onChange({ zh, en: v });

  const common =
    rows && rows > 1
      ? `${inputClass} resize-y`
      : inputClass;

  return (
    <FormField label={label} span={span}>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="w-8 shrink-0 text-[10px] font-mono font-bold text-text-muted">ZH</span>
          {rows && rows > 1 ? (
            <textarea
              rows={rows}
              value={zh}
              onChange={(e) => writeZh(e.target.value)}
              className={common + " flex-1"}
            />
          ) : (
            <input
              type="text"
              value={zh}
              onChange={(e) => writeZh(e.target.value)}
              className={common + " flex-1"}
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="w-8 shrink-0 text-[10px] font-mono font-bold text-text-muted">EN</span>
          {rows && rows > 1 ? (
            <textarea
              rows={rows}
              value={en}
              onChange={(e) => writeEn(e.target.value)}
              className={common + " flex-1"}
            />
          ) : (
            <input
              type="text"
              value={en}
              onChange={(e) => writeEn(e.target.value)}
              className={common + " flex-1"}
            />
          )}
        </div>
      </div>
    </FormField>
  );
}
