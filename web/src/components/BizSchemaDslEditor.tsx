import CodeMirror from "@uiw/react-codemirror";
import { oneDark } from "@codemirror/theme-one-dark";

// BizSchemaDslEditor is a thin controlled CodeMirror wrapper. All
// state — dsl text, validation outcome, save — lives in the parent
// (BizSchemaEditor), which is also the shared-AST owner for Task 6's
// bidirectional DSL↔Visual sync.

interface Props {
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
  height?: string;
}

export default function BizSchemaDslEditor({
  value,
  onChange,
  readOnly = false,
  height = "420px",
}: Props) {
  return (
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
  );
}
