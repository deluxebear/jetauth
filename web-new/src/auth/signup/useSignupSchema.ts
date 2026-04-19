import type { SignupItem } from "../api/types";

type TFn = (key: string, params?: Record<string, string | number>) => string;

// Maps the canonical English signup item name (what the backend stores) to
// the i18n key used on the signup page itself. Only used as a *fallback* —
// if the admin provided an explicit `label`, we honor that instead.
// Missing keys return the raw name (via t()'s own identity fallback), so
// custom items like "Text - Welcome" still render the admin's chosen name.
const SIGNUP_FIELD_I18N_KEYS: Record<string, string> = {
  "ID": "auth.signup.field.id",
  "Username": "auth.signup.field.username",
  "Display name": "auth.signup.field.displayName",
  "First name": "auth.signup.field.firstName",
  "Last name": "auth.signup.field.lastName",
  "Affiliation": "auth.signup.field.affiliation",
  "Gender": "auth.signup.field.gender",
  "Bio": "auth.signup.field.bio",
  "Tag": "auth.signup.field.tag",
  "Education": "auth.signup.field.education",
  "Country/Region": "auth.signup.field.countryRegion",
  "ID card": "auth.signup.field.idCard",
  "Password": "auth.signup.field.password",
  "Confirm password": "auth.signup.field.confirmPassword",
  "Email": "auth.signup.field.email",
  "Phone": "auth.signup.field.phone",
  "Email or Phone": "auth.signup.field.emailOrPhone",
  "Phone or Email": "auth.signup.field.phoneOrEmail",
  "Invitation code": "auth.signup.field.invitationCode",
  "Agreement": "auth.signup.field.agreement",
  "Signup button": "auth.signup.field.signupButton",
  "Providers": "auth.signup.field.providers",
};

function resolveLabel(name: string, t: TFn | undefined): string {
  if (!t) return name;
  const key = SIGNUP_FIELD_I18N_KEYS[name];
  if (!key) return name;
  const translated = t(key);
  // i18n.tsx returns the key itself when not found in any locale — fall back
  // to the raw name so we never render a key on screen.
  return translated === key ? name : translated;
}

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
  // Effectively disables auto-splitting. Prior default (6) triggered a
  // silent split on typical forms (~9 required fields) and confused admins
  // who expected every visible item to appear on the page. Splitting should
  // be explicit — admins opt in by setting `step` on specific items in the
  // advanced table.
  autoSplitThreshold = 100,
  t?: TFn
): SignupSchema {
  if (!items || items.length === 0) {
    return { steps: [[]], hasVisibleStepBreak: false, total: 0 };
  }

  const hasExplicit = items.some((it) => (it.step ?? 0) > 0);
  // "Signup button" is metadata — the submit control is rendered by
  // SignupPage itself. If we let it through, it falls into inferType's text
  // fallback and shows up as a stray input box labeled "注册按钮".
  const visible = items.filter(
    (it) => it.visible !== false && it.name !== "Signup button"
  );

  const fields: FieldSchema[] = visible.map((it) => {
    let step: number;
    if (hasExplicit) {
      step = (it.step ?? 1) - 1; // backend is 1-indexed
      if (step < 0) step = 0;
    } else {
      step = 0; // placeholder; computed below
    }
    const type = inferType(it);
    // "providers" is a navigational widget, not a form input — clicking
    // a tile redirects to OAuth. It has no `value` to collect, so honoring
    // required=true would block submit forever with an invisible error
    // (ProvidersField doesn't render field-level error text). Force
    // required=false for this type regardless of what the admin stored.
    const required = type === "providers" ? false : !!it.required;
    return {
      name: it.name,
      type,
      // Use `||` (not `??`) so empty-string labels — which the backend's
      // zero-value and the admin's `createRow` both produce — fall back to
      // the canonical name. Then localize that name via SIGNUP_FIELD_I18N_KEYS
      // so Chinese users see 用户名/密码/... instead of Username/Password.
      // Admin-authored labels win (skip translation, they're intentional).
      label: it.label || resolveLabel(it.name, t),
      placeholder: it.placeholder ?? "",
      required,
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
