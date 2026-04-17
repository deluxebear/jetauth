import { useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { monoInputClass } from "./FormSection";
import { useTranslation } from "../i18n";

type Props = {
  title: string;
  description: string;
  confirmTarget: string;
  confirmLabelTemplate?: string;
  deleteLabel?: string;
  onDelete: () => void;
};

export default function DangerZone({
  title,
  description,
  confirmTarget,
  confirmLabelTemplate,
  deleteLabel,
  onDelete,
}: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const canDelete = text.trim() === confirmTarget;
  const labelTpl = confirmLabelTemplate || t("common.dangerZone.typeToConfirm") || "输入 {name} 确认";
  const label = labelTpl.replace("{name}", confirmTarget);

  return (
    <div className="rounded-xl border-2 border-danger/30 bg-danger/5 p-5">
      <div className="flex items-start gap-3">
        <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-lg bg-danger/10 text-danger">
          <AlertTriangle size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[14px] font-semibold text-danger">{title}</h3>
          <p className="mt-1 text-[12px] text-text-secondary">{description}</p>
          <div className="mt-3 max-w-md">
            <label className="block text-[11px] font-medium text-text-muted">{label}</label>
            <input
              className={`${monoInputClass} mt-1`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={confirmTarget}
            />
          </div>
          <button
            disabled={!canDelete}
            onClick={onDelete}
            className="mt-3 flex items-center gap-1.5 rounded-lg border border-danger bg-danger px-3 py-2 text-[13px] font-semibold text-white hover:bg-danger/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Trash2 size={14} />
            {deleteLabel || t("common.delete") || "删除"}
          </button>
        </div>
      </div>
    </div>
  );
}
