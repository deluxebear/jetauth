import { useId } from "react";
import { AsYouType } from "libphonenumber-js/max";
import type { FieldProps } from "../DynamicField";
import { fieldWrapperClass, inputClass, labelClass, helperClass, errorClass } from "./shared";

export default function PhoneField({ schema, value, onChange, error, disabled }: FieldProps) {
  const formatter = new AsYouType("US"); // default country; configurable later
  const formatted = formatter.input(String(value ?? ""));
  const inputId = useId();

  return (
    <div className={fieldWrapperClass}>
      <label htmlFor={inputId} className={labelClass}>
        {schema.label}
        {schema.required && <span className="text-danger ml-0.5">*</span>}
      </label>
      <input
        id={inputId}
        type="tel"
        value={formatted}
        onChange={(e) => onChange(e.target.value)}
        placeholder={schema.placeholder || "+1 555 123 4567"}
        disabled={disabled}
        required={schema.required}
        autoComplete="tel"
        inputMode="tel"
        className={inputClass}
      />
      {schema.helperText && !error && <p className={helperClass}>{schema.helperText}</p>}
      {error && <p className={errorClass}>{error}</p>}
    </div>
  );
}
