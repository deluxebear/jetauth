import CodeMirror from "@uiw/react-codemirror";
import { css } from "@codemirror/lang-css";
import { oneDark } from "@codemirror/theme-one-dark";

interface Props {
  value: string;
  onChange: (v: string) => void;
  height?: string;
  placeholder?: string;
}

export default function CssEditor({ value, onChange, height = "140px", placeholder }: Props) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <CodeMirror
        value={value}
        onChange={onChange}
        height={height}
        theme={oneDark}
        extensions={[css()]}
        placeholder={placeholder}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          highlightActiveLine: true,
          autocompletion: true,
        }}
      />
    </div>
  );
}
