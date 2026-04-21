import { useCallback } from "react";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";

type ApiLike = { status?: string; msg?: string } | unknown;

/**
 * Bulk-delete handler for list pages whose backend exposes only a
 * single-record delete endpoint. Fans out N parallel requests.
 *
 * For entities that have a server-side bulk endpoint returning an
 * aggregate `{succeeded, failed, results}` response, use the
 * `showBulkDeleteToast` helper in `AppAuthorizationPage.tsx` instead —
 * the shapes are intentionally different.
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
