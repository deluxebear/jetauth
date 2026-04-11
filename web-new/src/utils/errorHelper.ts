// Translate common backend error messages to user-friendly text
export function friendlyError(msg: string, t: (key: string) => string): string {
  if (!msg) return "";
  if (msg.includes("UNIQUE constraint failed")) return t("common.errorNameExists");
  if (msg.includes("not found")) return t("common.errorNotFound");
  if (msg.includes("Unauthorized operation")) return t("common.errorUnauthorized");
  return msg;
}
