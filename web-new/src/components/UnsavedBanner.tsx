import { AlertTriangle } from "lucide-react";
import { useTranslation } from "../i18n";

export default function UnsavedBanner({ isAddMode }: { isAddMode?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-2 text-[13px] text-warning">
      <AlertTriangle size={15} className="shrink-0" />
      <span>{isAddMode ? t("common.unsavedNewRecord" as any) : t("common.unsavedChanges" as any)}</span>
    </div>
  );
}
