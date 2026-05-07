import { lazy, Suspense } from "react";
import { useTranslation } from "../i18n";

// Lazy-load the trace viewer so its OTLP parser code only enters the bundle
// when an admin actually opens a trace entry.
const OtlpTraceView = lazy(() => import("./OtlpTraceView"));

function tryFormatJson(str: string): string {
  try { return JSON.stringify(JSON.parse(str), null, 2); } catch { return str; }
}

interface Props {
  type: string;
  message: string;
}

/**
 * Picks the right renderer for an Entry's `message` field based on `type`.
 * Today:
 *   - "trace"   → OTLP span tree + waterfall (OtlpTraceView)
 *   - everything else → pretty-printed JSON in a <pre> (the legacy view)
 *
 * "session" entries are rendered as raw JSON here because they have a
 * dedicated full-page graph viewer (see SessionGraphPage); the EntryEditPage
 * surfaces a "View Session Graph" button alongside this component.
 */
export default function EntryMessageViewer({ type, message }: Props) {
  const { t } = useTranslation();

  if (!message) {
    return <span className="text-text-muted">{t("common.none")}</span>;
  }

  if (type === "trace") {
    return (
      <Suspense fallback={
        <div className="rounded-lg border border-border bg-surface-1 p-4 flex items-center justify-center">
          <div className="h-5 w-5 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
        </div>
      }>
        <OtlpTraceView message={message} />
      </Suspense>
    );
  }

  // Fallback: pretty-printed JSON. Same behavior the page had before the
  // dispatcher was introduced — all non-trace types keep working unchanged.
  return (
    <pre className="rounded-lg border border-border bg-surface-2 p-4 text-[12px] font-mono text-text-secondary overflow-auto max-h-[500px] whitespace-pre-wrap break-all">
      {tryFormatJson(message)}
    </pre>
  );
}
