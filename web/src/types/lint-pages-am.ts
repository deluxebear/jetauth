/** Shared helpers/types introduced while removing `any` from pages A–M. */

/** Extract a human-readable message from an unknown caught value. */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "message" in e) {
    const m = (e as { message?: unknown }).message;
    return typeof m === "string" ? m : "";
  }
  return "";
}

/** Shape of `location.state` used by edit pages to signal "add" mode. */
export interface AddModeLocationState {
  mode?: string;
}
