import { useState } from "react";
import { ChevronDown, AlertCircle } from "lucide-react";
import { useTranslation } from "../i18n";
import CodeMirror from "@uiw/react-codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import type { LintWarning } from "./bizSchemaLint";

// BizSchemaDslEditor is a controlled CodeMirror wrapper with two admin
// affordances on top of the editor:
//   - a "Insert snippet" dropdown with 9 common DSL patterns
//   - a side lint panel that displays non-blocking warnings computed
//     by the parent (see bizSchemaLint.ts). Warnings are advisory —
//     they do not prevent save.

interface Snippet {
  id: string;
  /** i18n key suffix under rebac.schema.snippets */
  i18nKey: string;
  text: string;
}

const SNIPPETS: Snippet[] = [
  { id: "direct", i18nKey: "direct", text: "define $name: [user]\n" },
  { id: "union", i18nKey: "union", text: "define $name: $a or $b\n" },
  {
    id: "intersection",
    i18nKey: "intersection",
    text: "define $name: $a and $b\n",
  },
  {
    id: "difference",
    i18nKey: "difference",
    text: "define $name: $a but not $b\n",
  },
  {
    id: "inherit",
    i18nKey: "inherit",
    text: "define $name: $local or $target from $parent\n",
  },
  {
    id: "wildcard",
    i18nKey: "wildcard",
    text: "define $name: [user, user:*]\n",
  },
  {
    id: "userset",
    i18nKey: "userset",
    text: "define $name: [user, team#member]\n",
  },
  {
    id: "condition",
    i18nKey: "condition",
    text: "define $name: [user with $cond]\n",
  },
  {
    id: "condDecl",
    i18nKey: "condDecl",
    text: 'condition $name($param: timestamp) {\n  $param > timestamp("2026-01-01T00:00:00Z")\n}\n',
  },
];

interface Props {
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
  height?: string;
  /** When provided, renders the side lint panel. Pass [] to hide. */
  lintWarnings?: LintWarning[];
  /** When provided, renders the snippets dropdown above the editor. */
  onInsertSnippet?: (snippet: string) => void;
}

export default function BizSchemaDslEditor({
  value,
  onChange,
  readOnly = false,
  height = "420px",
  lintWarnings = [],
  onInsertSnippet,
}: Props) {
  const { t } = useTranslation();
  const [snippetOpen, setSnippetOpen] = useState(false);

  // Two-column grid only when lint panel is non-empty; otherwise
  // editor takes full width (no reserved dead space).
  const showLintAside = lintWarnings.length > 0;

  return (
    <div
      className={
        showLintAside
          ? "grid grid-cols-[1fr_220px] gap-2"
          : "flex flex-col gap-2"
      }
    >
      <div className="flex flex-col gap-1">
        {onInsertSnippet && (
          <div className="relative self-start">
            <button
              type="button"
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[12px] border border-border bg-surface-1 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              onClick={() => setSnippetOpen((o) => !o)}
              aria-label={t("rebac.schema.snippets.insert")}
              aria-haspopup="menu"
              aria-expanded={snippetOpen}
            >
              {t("rebac.schema.snippets.insert")}
              <ChevronDown className="w-3 h-3" aria-hidden />
            </button>
            {snippetOpen && (
              <div
                className="absolute z-10 mt-1 w-64 rounded border border-border bg-surface-1 shadow-lg py-1"
                role="menu"
              >
                {SNIPPETS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="menuitem"
                    className="w-full text-left px-2 py-1 text-[12px] hover:bg-surface-2 font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                    onClick={() => {
                      onInsertSnippet(s.text);
                      setSnippetOpen(false);
                    }}
                  >
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {t(`rebac.schema.snippets.${s.i18nKey}` as any)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="rounded-lg border border-border overflow-hidden">
          <CodeMirror
            value={value}
            onChange={onChange}
            height={height}
            theme={oneDark}
            readOnly={readOnly}
            basicSetup={{
              lineNumbers: true,
              foldGutter: false,
              highlightActiveLine: true,
              autocompletion: false,
            }}
          />
        </div>
      </div>
      {showLintAside && (
        <aside
          className="rounded-lg border border-warning/40 bg-warning/5 p-2 text-[12px] self-start"
          aria-label={t("rebac.schema.lint.title")}
        >
          <p className="font-semibold text-text-primary mb-1 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-warning" aria-hidden />
            {t("rebac.schema.lint.title")} ({lintWarnings.length})
          </p>
          <ul className="space-y-1">
            {lintWarnings.map((w, i) => (
              <li key={i} className="text-text-muted">
                <span className="font-mono text-text-primary">{w.target}</span>
                {": "}
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {t(`rebac.schema.lint.${w.rule}` as any)}
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}
