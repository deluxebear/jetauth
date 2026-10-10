import CodeMirror from "@uiw/react-codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { AlertCircle } from "lucide-react";
import { useTranslation } from "../i18n";
import { lintCasbinModel } from "./bizCasbinModelLint";

// BizModelTextEditor is a controlled CodeMirror editor for a Casbin model
// (CONF) text. It reuses the same CodeMirror stack as BizSchemaDslEditor and
// shows a non-blocking hint when required sections are missing; the backend
// performs the authoritative parse check on save.

interface Props {
  value: string;
  onChange: (next: string) => void;
  height?: string;
  readOnly?: boolean;
}

export default function BizModelTextEditor({ value, onChange, height = "320px", readOnly }: Props) {
  const { t } = useTranslation();
  const missing = lintCasbinModel(value);

  return (
    <div className="space-y-2" data-testid="biz-model-text-editor">
      <div className="rounded-lg border border-accent overflow-hidden">
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
      {missing.length > 0 && (
        <div role="alert" className="flex items-start gap-1.5 text-[12px] text-warning">
          <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
          <span>
            {t("authz.overview.modelLint.missing")}: {missing.map((s) => `[${s}]`).join(", ")}
          </span>
        </div>
      )}
    </div>
  );
}
