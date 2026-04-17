import { useMemo } from "react";
import { useTranslation } from "react-i18next";

type Props = {
  value: string;
  onChange: (v: string) => void;
  contentType: string;
  className?: string;
};

const VARIABLES = [
  "fromAddress",
  "fromName",
  "toAddress",
  "toAddresses",
  "subject",
  "content",
  "contentText",
];

export function BodyTemplateEditor({ value, onChange, contentType, className }: Props) {
  const { t } = useTranslation();

  const preview = useMemo(() => {
    const sample: Record<string, string> = {
      fromAddress: "noreply@yourdomain.com",
      fromName: "JetAuth",
      toAddress: "user@example.com",
      toAddresses: JSON.stringify(["user@example.com"]),
      subject: "Your code is 123456",
      content: "<p>Welcome</p>",
      contentText: "Welcome",
    };
    return value.replace(/\$\{(\w+)\}/g, (_, k) => sample[k] ?? `\${${k}}`);
  }, [value]);

  return (
    <div className={className}>
      <div className="mb-2 flex flex-wrap gap-1">
        {VARIABLES.map((v) => (
          <button
            key={v}
            type="button"
            className="rounded bg-surface-2 px-2 py-0.5 text-[11px] text-text-secondary hover:bg-surface-3"
            onClick={() => onChange(value + `\${${v}}`)}
          >
            {"${" + v + "}"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={12}
          spellCheck={false}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-[11px]"
          placeholder={t("providers.httpEmail.bodyTemplatePlaceholder" as any)}
        />
        <pre className="max-h-[300px] overflow-auto rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-[11px] whitespace-pre-wrap">
          {preview}
        </pre>
      </div>
      <p className="mt-1 text-[11px] text-text-tertiary">
        {t("providers.httpEmail.contentTypeNote" as any)}: <code>{contentType || "(none)"}</code>
      </p>
    </div>
  );
}
