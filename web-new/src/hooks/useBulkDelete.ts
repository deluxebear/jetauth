import { useCallback } from "react";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";

type ApiLike = { status?: string; msg?: string } | unknown;

/**
 * Shared bulk-delete handler for list pages.
 *
 * Issues one `deleteFn` call per selected record in parallel, shows a
 * confirmation modal first, and reports aggregate success/failure via the
 * toast helper. Handlers should clear selection and trigger refetch once
 * the promise chain resolves.
 *
 * Each entity's delete endpoint follows the same `{ status: "ok" | "error" }`
 * contract, so `Promise.allSettled` + a failed-count summary works for
 * every caller. Callers that need custom error handling should write their
 * own handler instead of using this hook.
 */
export function useBulkDelete<T>(
  deleteFn: (item: T) => Promise<ApiLike>,
  onDone: () => void,
) {
  const { t } = useTranslation();
  const modal = useModal();

  return useCallback(
    (selected: T[], clear: () => void) => {
      if (selected.length === 0) return;
      const noun = t("common.items" as any) || "项";
      modal.showConfirm(
        `${t("common.confirmDelete")} ${selected.length} ${noun}?`,
        async () => {
          const results = await Promise.allSettled(selected.map(deleteFn));
          const failed = results.filter((r) => {
            if (r.status === "rejected") return true;
            const v = (r as PromiseFulfilledResult<ApiLike>).value as { status?: string } | undefined;
            return v?.status !== "ok";
          });
          if (failed.length > 0) {
            modal.toast(
              `${failed.length}/${selected.length} ${t("common.deleteFailed" as any) || "失败"}`,
              "error",
            );
          } else {
            modal.toast(
              `${t("common.bulk.deleted" as any) || "已删除"} ${selected.length}`,
              "success",
            );
          }
          clear();
          onDone();
        },
      );
    },
    [deleteFn, onDone, modal, t],
  );
}
