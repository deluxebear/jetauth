import StatusBadge from "./StatusBadge";
import { useTranslation } from "../i18n";

const STATUS: Record<string, string> = {
  Approved: "active",
  Pending: "pending",
  Rejected: "error",
};

/** Approval-state pill shared by the permission list, queue and edit pages. */
export default function PermissionStateBadge({ state }: { state?: string }) {
  const { t } = useTranslation();
  if (!state || !STATUS[state]) return <span className="text-text-muted text-[12px]">{"—"}</span>;
  return <StatusBadge status={STATUS[state]} label={t(`permissions.state${state}`)} />;
}
