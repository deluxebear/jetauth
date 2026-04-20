import { useId } from "react";
import type { FieldProps } from "../DynamicField";
import { fieldWrapperClass, inputClass, labelClass, helperClass, errorClass } from "./shared";

export default function TextField({ schema, value, onChange, error, disabled, readOnly }: FieldProps) {
  const inputId = useId();
  return (
    <div className={fieldWrapperClass}>
      <label htmlFor={inputId} className={labelClass}>
        {schema.label}
        {schema.required && <span className="text-danger ml-0.5">*</span>}
      </label>
      <input
        id={inputId}
        type="text"
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        placeholder={schema.placeholder}
        disabled={disabled}
        readOnly={readOnly}
        required={schema.required}
        autoComplete={schema.name.toLowerCase() === "username" ? "username" : undefined}
        className={inputClass}
      />
      {schema.helperText && !error && <p className={helperClass}>{schema.helperText}</p>}
      {error && <p className={errorClass}>{error}</p>}
    </div>
  );
}
