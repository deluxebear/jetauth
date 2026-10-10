// Lightweight client-side structural check for a Casbin model text. The
// authoritative validation happens on the backend (ValidateBizModelText);
// this only surfaces obvious mistakes before the round trip.

const REQUIRED_SECTIONS = [
  "request_definition",
  "policy_definition",
  "policy_effect",
  "matchers",
] as const;

/** Returns the names of required sections missing from the model text. */
export function lintCasbinModel(text: string): string[] {
  const present = new Set<string>();
  for (const line of text.split("\n")) {
    const m = line.trim().match(/^\[([a-z_]+)\]$/);
    if (m) present.add(m[1]);
  }
  return REQUIRED_SECTIONS.filter((s) => !present.has(s));
}
