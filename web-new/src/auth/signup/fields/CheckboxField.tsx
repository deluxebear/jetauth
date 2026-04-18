import type { FieldProps } from "../DynamicField";
import { fieldWrapperClass, helperClass, errorClass } from "./shared";

export default function CheckboxField({ schema, value, onChange, error, disabled }: FieldProps) {
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
          {schema.label}
          {schema.required && <span className="text-danger ml-0.5">*</span>}
        </span>
      </label>
      {schema.helperText && !error && <p className={helperClass}>{schema.helperText}</p>}
      {error && <p className={errorClass}>{error}</p>}
    </div>
  );
}
