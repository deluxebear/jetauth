import type { SignupItem } from "../api/types";

export type FieldType =
  | "text"
  | "email"
  | "phone"
  | "password"
  | "confirm-password"
  | "select"
  | "checkbox"
  | "date"
  | "agreement"
  | "invitation-code"
  | "providers";

export interface FieldSchema {
  name: string;
  type: FieldType;
  label: string;
  placeholder: string;
  required: boolean;
  visible: boolean;
  options?: string[];
  regex?: RegExp;
  helperText?: string;
  validationMessage?: Record<string, string>;
  group?: string;
  step: number;
  /**
   * Admin-provided rule string from the signupItem. Semantics depend on the
   * field type:
   *  - type="providers" → "big" (stacked full-width buttons) or "small"
   *    (icon-tile row). Default: "small".
   *  - other types → ignored at the schema level; still exposed so fields
   *    can read it without extending the prop surface later.
   */
  rule?: string;
}

export interface SignupSchema {
  steps: FieldSchema[][];
  hasVisibleStepBreak: boolean;
  total: number;
}

/**
 * Infer a FieldType from the SignupItem's `name` or `type` field.
 * The backend's `type` field (when set) wins; the name is a fallback
 * for existing data that predates explicit types.
 */
function inferType(item: SignupItem): FieldType {
  const byType = (item.type ?? "").toLowerCase();
  if (byType === "email" || byType === "phone" || byType === "password"
    || byType === "confirm-password" || byType === "select" || byType === "checkbox"
    || byType === "date" || byType === "agreement") {
    return byType as FieldType;
  }
  const byName = (item.name ?? "").toLowerCase();
  if (byName === "email" || byName === "email or phone") return "email";
  if (byName === "phone" || byName === "phone or email") return "phone";
  if (byName === "password") return "password";
  if (byName === "confirm password") return "confirm-password";
  if (byName === "agreement") return "agreement";
  if (byName === "country/region") return "select";
  if (byName === "invitation code") return "invitation-code";
  if (byName === "providers") return "providers";
  if (byName === "signup button") return "text"; // button is rendered by SignupPage itself; field type irrelevant here
  return "text";
}

/**
 * Compile a regex string safely. Returns undefined on parse failure.
 */
function compileRegex(src?: string): RegExp | undefined {
  if (!src) return undefined;
  try {
    return new RegExp(src);
  } catch {
    return undefined;
  }
}

/**
 * Build the signup form schema from raw backend items.
 *
 * Step assignment:
 *   - If any item has an explicit non-zero `step`, all items use their
 *     explicit step (0-indexed internally).
 *   - Otherwise, if the count of required+visible fields exceeds
 *     `autoSplitThreshold`, split automatically into two steps.
 *   - Otherwise, single step.
 */
export function buildSignupSchema(
  items: SignupItem[] | null | undefined,
  autoSplitThreshold = 6
): SignupSchema {
  if (!items || items.length === 0) {
    return { steps: [[]], hasVisibleStepBreak: false, total: 0 };
  }

  const hasExplicit = items.some((it) => (it.step ?? 0) > 0);
  const visible = items.filter((it) => it.visible !== false);

  const fields: FieldSchema[] = visible.map((it) => {
    let step: number;
    if (hasExplicit) {
      step = (it.step ?? 1) - 1; // backend is 1-indexed
      if (step < 0) step = 0;
    } else {
      step = 0; // placeholder; computed below
    }
    return {
      name: it.name,
      type: inferType(it),
      label: it.label ?? it.name,
      placeholder: it.placeholder ?? "",
      required: !!it.required,
      visible: it.visible !== false,
      options: (it.options as string[] | undefined) ?? undefined,
      regex: compileRegex(it.regex),
      helperText: (it.helper as string | undefined) || undefined,
      validationMessage: (it.validationMessage as Record<string, string> | undefined) || undefined,
      group: (it.group as string | undefined) || undefined,
      step,
      rule: (it.rule as string | undefined) || undefined,
    };
  });

  // Auto-split when no explicit steps + too many required fields.
  if (!hasExplicit) {
    const requiredCount = fields.filter((f) => f.required).length;
    if (requiredCount > autoSplitThreshold) {
      let placed = 0;
      for (const f of fields) {
        if (f.required) {
          f.step = placed < Math.ceil(requiredCount / 2) ? 0 : 1;
          placed++;
        } else {
          f.step = placed < Math.ceil(requiredCount / 2) ? 0 : 1;
        }
      }
    }
  }

  // Group into steps array.
  const stepCount = Math.max(...fields.map((f) => f.step), 0) + 1;
  const steps: FieldSchema[][] = Array.from({ length: stepCount }, () => []);
  for (const f of fields) {
    steps[f.step].push(f);
  }

  return {
    steps,
    hasVisibleStepBreak: stepCount > 1,
    total: fields.length,
  };
}
