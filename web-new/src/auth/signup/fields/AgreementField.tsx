import type { FieldProps } from "../DynamicField";
import { fieldWrapperClass, helperClass, errorClass } from "./shared";

/**
 * Signup "Agreement" row: a required checkbox that gates submit until the
 * user accepts the Terms of Service. Label supports a `{terms}` placeholder
 * that gets replaced by a link to `application.termsOfUse` (passed via
 * context); when no placeholder is present, the label renders as-is.
 *
 * When the admin hasn't set a label, we fall back to a reasonable default
 * that still surfaces the terms link. Validation is handled in
 * SignupPage.validateField — if required and unchecked, submit is blocked
 * and the field shows the configured validationMessage or the fallback.
 */
export default function AgreementField({ schema, value, onChange, error, disabled, context }: FieldProps) {
  const termsUrl = context?.termsOfUse;

  // Use admin label if set; otherwise a sensible default with {terms} token
  // so the link still appears when termsOfUse is configured.
  const rawLabel = schema.label && schema.label.trim().length > 0
    ? schema.label
    : "I agree to the {terms}";

  // Link text to inject where `{terms}` appears in the label.
  const termsText = "Terms of Use";

  function renderLabel() {
    if (rawLabel.includes("{terms}")) {
      const [before, after] = rawLabel.split("{terms}");
      return (
        <>
          {before}
          {termsUrl ? (
            <a
              href={termsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline hover:opacity-80"
              onClick={(e) => e.stopPropagation()}
            >
              {termsText}
            </a>
          ) : (
            <span className="text-text-primary">{termsText}</span>
          )}
          {after}
        </>
      );
    }
    return rawLabel;
  }

  return (
    <div className={fieldWrapperClass}>
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          required={schema.required}
          className="mt-0.5 h-4 w-4 rounded border-border text-accent focus:ring-accent/30 focus:ring-1 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <span className="text-[13px] text-text-secondary">
          {renderLabel()}
          {schema.required && <span className="text-danger ml-0.5">*</span>}
        </span>
      </label>
      {schema.helperText && !error && <p className={helperClass}>{schema.helperText}</p>}
      {error && <p className={errorClass}>{error}</p>}
    </div>
  );
}
