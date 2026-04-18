import { useId } from "react";
import type { FieldProps } from "../DynamicField";
import { fieldWrapperClass, labelClass, helperClass, errorClass } from "./shared";

export default function SelectField({ schema, value, onChange, error, disabled }: FieldProps) {
  const selectId = useId();
  return (
    <div className={fieldWrapperClass}>
      <label htmlFor={selectId} className={labelClass}>
        {schema.label}
        {schema.required && <span className="text-danger ml-0.5">*</span>}
      </label>
      <select
        id={selectId}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        required={schema.required}
        className="w-full rounded-lg border border-border bg-surface-1 px-3.5 py-2.5 text-[14px] text-text-primary focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <option value="" disabled>
          {schema.placeholder || `Select ${schema.label}`}
        </option>
        {schema.options?.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      {schema.helperText && !error && <p className={helperClass}>{schema.helperText}</p>}
      {error && <p className={errorClass}>{error}</p>}
    </div>
  );
}
