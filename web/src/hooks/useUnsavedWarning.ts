import { useEffect } from "react";

/**
 * Warns the user about unsaved changes.
 *
 * - Shows a browser beforeunload prompt on close/refresh when dirty.
 * - Returns `showBanner` boolean for the edit page to render a visual reminder.
 *
 * @param isAddMode  New entity not yet saved
 * @param isDirty    Existing entity has been modified
 */
export function useUnsavedWarning({
  isAddMode,
  isDirty,
}: {
  isAddMode: boolean;
  isDirty: boolean;
}) {
  const showBanner = isAddMode || isDirty;

  // Warn on browser close/refresh
  useEffect(() => {
    if (!showBanner) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [showBanner]);

  return showBanner;
}
