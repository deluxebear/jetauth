import { AlertTriangle } from "lucide-react";
import { useTranslation } from "../i18n";

interface Props {
  isAddMode?: boolean;
  /** True when add-mode uses deferred-create (nothing persisted yet). The
   *  message flips from "record has been created, click save to confirm"
   *  to "nothing saved yet, fill in and click save to create". Pages still
   *  using optimistic-create can omit this. */
  draftMode?: boolean;
}

export default function UnsavedBanner({ isAddMode, draftMode }: Props) {
  const { t } = useTranslation();
  const key = !isAddMode
    ? "common.unsavedChanges"
    : draftMode
      ? "common.unsavedNewDraft"
      : "common.unsavedNewRecord";
  return (
    <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-2 text-[13px] text-warning">
      <AlertTriangle size={15} className="shrink-0" />
      <span>{t(key as any)}</span>
    </div>
  );
}
