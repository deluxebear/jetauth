import CodeMirror from "@uiw/react-codemirror";
import { StreamLanguage } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";

// Lightweight ModSecurity tokenizer — handcrafted because there's no
// off-the-shelf grammar. Covers the common SecRule shapes seen in CRS-style
// rules well enough that the typical id:'…',phase:N,t:none,t:lowercase,…
// pattern lights up. Falls back to plain text for anything unrecognised.
const ACTION_KEYWORDS = new Set([
  "id", "phase", "pass", "nolog", "log", "deny", "block", "allow", "drop",
  "status", "msg", "logdata", "severity", "ctl", "chain", "tag", "rev", "ver",
  "accuracy", "maturity", "setvar", "expirevar", "initcol", "capture",
  "noauditlog", "auditlog", "multiMatch", "skip", "skipAfter", "redirect",
  "proxy", "exec", "pause", "t",
]);

const TRANSFORMS = new Set([
  "none", "lowercase", "uppercase", "trim", "removeWhitespace", "urlDecode",
  "urlDecodeUni", "htmlEntityDecode", "base64Decode", "cssDecode", "jsDecode",
  "md5", "sha1", "hexEncode", "hexDecode", "length", "escapeSeqDecode",
  "cmdLine", "removeNulls", "replaceComments", "removeCommentsChar",
  "replaceNulls", "removeComments", "compressWhitespace", "normalisePath",
  "normalisePathWin", "sqlHexDecode", "utf8toUnicode",
]);

const modsecurityLang = StreamLanguage.define({
  name: "modsecurity",
  token(stream) {
    if (stream.eatSpace()) return null;

    // # line comments
    if (stream.match(/^#.*/)) return "comment";

    // SecRule, SecAction, SecMarker, SecRuleRemoveById, …
    if (stream.match(/^Sec[A-Za-z]+\b/)) return "keyword";

    // Operators: @rx, @eq, @detectXSS, possibly negated as !@xxx
    if (stream.match(/^!?@[A-Za-z]+/)) return "operator";

    // %{macro} expansions inside action arguments / log data
    if (stream.match(/^%\{[^}]*\}/)) return "meta";

    // ALL_CAPS collection variables, optionally with :Subkey
    if (stream.match(/^[A-Z][A-Z0-9_]*(?::[A-Za-z0-9_\-.]+)?/)) return "variable";

    // Double-quoted strings (rule body / msg / regex)
    if (stream.match(/^"(?:\\.|[^"\\])*"/)) return "string";

    // Single-quoted strings (action values: id:'200000', msg:'…')
    if (stream.match(/^'(?:\\.|[^'\\])*'/)) return "string";

    // Bare numeric literals (status:400, severity:2, phase:1, …)
    if (stream.match(/^\d+/)) return "number";

    // Lowercase identifier — could be an action keyword or a transform.
    // We peek the word and check our sets so we don't mis-style arbitrary
    // bareword arguments.
    const word = stream.match(/^[a-z][A-Za-z0-9]*/);
    if (word) {
      const w = (word as RegExpMatchArray)[0];
      if (ACTION_KEYWORDS.has(w)) return "atom";
      if (TRANSFORMS.has(w)) return "atom";
      return null;
    }

    // Unrecognised — advance one char so we don't loop forever
    stream.next();
    return null;
  },
});

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minHeight?: string;
  maxHeight?: string;
}

export default function WafEditor({
  value,
  onChange,
  placeholder = "SecRule …",
  minHeight = "60px",
  maxHeight = "240px",
}: Props) {
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <CodeMirror
        value={value}
        onChange={onChange}
        theme={oneDark}
        extensions={[modsecurityLang, EditorView.lineWrapping]}
        placeholder={placeholder}
        minHeight={minHeight}
        maxHeight={maxHeight}
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLine: false,
          highlightSelectionMatches: false,
          autocompletion: false,
        }}
      />
    </div>
  );
}
