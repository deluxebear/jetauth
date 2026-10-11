/** Extract a message from an unknown caught value. */
export function errMsg(e: unknown): string | undefined {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "message" in e) {
    const m = (e as { message?: unknown }).message;
    return typeof m === "string" ? m : undefined;
  }
  return undefined;
}

/** Name of an Error-like caught value, if any. */
export function errName(e: unknown): string | undefined {
  return typeof e === "object" && e !== null && "name" in e ? String((e as { name?: unknown }).name) : undefined;
}
