import type { FieldProps } from "../DynamicField";
import { fieldWrapperClass, inputClass, labelClass, helperClass, errorClass } from "./shared";

export default function ConfirmPasswordField({ schema, value, onChange, error, disabled }: FieldProps) {
  return (
    <div className={fieldWrapperClass}>
      <label className={labelClass}>
        {schema.label}
        {schema.required && <span className="text-danger ml-0.5">*</span>}
      </label>
      <input
        type="password"
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        placeholder={schema.placeholder}
        disabled={disabled}
        required={schema.required}
        autoComplete="new-password"
        className={inputClass}
      />
      {schema.helperText && !error && <p className={helperClass}>{schema.helperText}</p>}
      {error && <p className={errorClass}>{error}</p>}
    </div>
  );
}
