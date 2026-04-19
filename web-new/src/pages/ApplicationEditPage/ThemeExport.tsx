// web-new/src/pages/ApplicationEditPage/ThemeExport.tsx
//
// Renders the current Application.themeData as a :root CSS var block.
// Mounted inside a modal so admins can copy the resolved tokens out
// for use in an external stylesheet (marketing site, shared component
// library, etc.).

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useTranslation } from "../../i18n";

interface Props {
  themeData: Record<string, unknown> | null | undefined;
}

/**
 * Turns the AuthApplication.themeData shape into a :root CSS var block.
 * Mirrors the vars ThemeProvider patches at runtime so an external
 * consumer sees the same token surface.
 */
function buildCss(themeData: Record<string, unknown> | null | undefined): string {
  const t = themeData ?? {};
  const lines: string[] = [":root {"];
  const get = (k: string) => (typeof t[k] === "string" ? (t[k] as string) : undefined);
  const getNum = (k: string) =>
    typeof t[k] === "number" ? (t[k] as number) : undefined;

  const primary = get("colorPrimary");
  if (primary) {
    lines.push(`  --color-primary: ${primary};`);
    lines.push(`  --accent: ${primary};`);
    lines.push(`  --color-accent: ${primary};`);
  }
  const darkPrimary = get("darkColorPrimary");
  if (darkPrimary) lines.push(`  --color-primary-dark: ${darkPrimary};`);

  const radius = getNum("borderRadius");
  if (radius !== undefined) {
    lines.push(`  --radius-md: ${radius}px;`);
    lines.push(`  --radius-lg: ${radius + 4}px;`);
  }

  const font = get("fontFamily");
  if (font) lines.push(`  --font-sans: ${font};`);

  if (lines.length === 1) {
    return "/* No theme tokens set. Pick colors / radius / font first. */\n";
  }

  lines.push("}");
  return lines.join("\n") + "\n";
}

export default function ThemeExport({ themeData }: Props) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const css = buildCss(themeData);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(css);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Fallback path for browsers without async clipboard — no-op; the
      // <pre> below is selectable so users can still copy manually.
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-text-muted">
        {t("apps.theme.exportHint" as never)}
      </p>
      <div className="relative">
        <pre className="rounded-lg border border-border bg-surface-2 px-3.5 py-3 text-[12px] leading-relaxed font-mono text-text-primary max-h-72 overflow-auto whitespace-pre">
          {css}
        </pre>
        <button
          type="button"
          onClick={handleCopy}
          className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-md bg-surface-1 border border-border px-2 py-1 text-[11px] font-medium text-text-secondary hover:bg-surface-0 transition-colors"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? t("apps.theme.copied" as never) : t("apps.theme.copy" as never)}
        </button>
      </div>
    </div>
  );
}
