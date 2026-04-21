import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Save, ArrowLeft, Trash2 } from "lucide-react";
import { api } from "../api/client";
import { useTranslation } from "../i18n";

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "multiSelect"
  | "switch"
  | "tags"
  | "datetime"
  | "password"
  | "url"
  | "email"
  | "code";

export interface FieldConfig {
  key: string;
  labelKey: string;
  type: FieldType;
  required?: boolean;
  disabled?: boolean | ((values: Record<string, unknown>) => boolean);
  placeholder?: string;
  options?: { value: string; label: string }[] | ((values: Record<string, unknown>) => { value: string; label: string }[]);
  span?: "full" | "half"; // full = 100%, half = 50%
  group?: string; // group label for sectioning
  mono?: boolean;
  rows?: number; // for textarea
  helpText?: string;
}

interface GenericEditPageProps {
  entityType: string; // singular, e.g. "user", "organization"
  entityTypePlural: string; // e.g. "users", "organizations"
  titleKey: string;
  fields: FieldConfig[];
  defaultValues?: Record<string, unknown>;
  isNew?: boolean;
}

interface ApiResponse {
  status: string;
  data: Record<string, unknown>;
}

export default function GenericEditPage({
  entityType,
  entityTypePlural,
  titleKey,
  fields,
  defaultValues = {},
}: GenericEditPageProps) {
  const { owner, name } = useParams<{ owner: string; name: string }>();
  const isNew = name === "new" || !name;
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [values, setValues] = useState<Record<string, unknown>>(defaultValues);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    if (isNew) return;
    setLoading(true);
    try {
      const id = `${owner}/${name}`;
      const res = await api.get<ApiResponse>(
        `/api/get-${entityType}?id=${encodeURIComponent(id)}`
      );
      if (res.data) setValues(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [entityType, owner, name, isNew]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (isNew) {
        await api.post(`/api/add-${entityType}`, values);
      } else {
        const id = `${owner}/${name}`;
        await api.post(`/api/update-${entityType}?id=${encodeURIComponent(id)}`, values);
      }
      navigate(`/${entityTypePlural}`);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t("common.confirmDelete"))) return;
    try {
      await api.post(`/api/delete-${entityType}`, values);
      navigate(`/${entityTypePlural}`);
    } catch (e) {
      console.error(e);
    }
  };

  const setValue = (key: string, val: unknown) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  const isDisabled = (field: FieldConfig) => {
    if (typeof field.disabled === "function") return field.disabled(values);
    return !!field.disabled;
  };

  const getOptions = (field: FieldConfig) => {
    if (typeof field.options === "function") return field.options(values);
    return field.options ?? [];
  };

  // Group fields by their group property
  const groupedFields: { group: string; fields: FieldConfig[] }[] = [];
  let currentGroup = "";
  for (const f of fields) {
    const g = f.group ?? "";
    if (g !== currentGroup || groupedFields.length === 0) {
      currentGroup = g;
      groupedFields.push({ group: g, fields: [f] });
    } else {
      groupedFields[groupedFields.length - 1].fields.push(f);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 "
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/${entityTypePlural}`)}
            className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              {isNew ? t("common.add") : t("common.edit")} {t(titleKey as any)}
            </h1>
            {!isNew && (
              <p className="text-[13px] text-text-muted font-mono mt-0.5">
                {owner}/{name}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && (
            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-2 text-[13px] font-medium text-danger hover:bg-danger/10 transition-colors"
            >
              <Trash2 size={14} />
              {t("common.delete")}
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            ) : (
              <Save size={14} />
            )}
            {t("common.save")}
          </button>
        </div>
      </div>

      {/* Form */}
      {groupedFields.map((section, si) => (
        <div
          key={si}
          className="rounded-xl border border-border bg-surface-1 overflow-hidden"
        >
          {section.group && (
            <div className="px-5 py-3 border-b border-border-subtle bg-surface-2/30">
              <h3 className="text-[13px] font-semibold text-text-primary">
                {t(section.group as any)}
              </h3>
            </div>
          )}
          <div className="p-5 grid grid-cols-2 gap-x-6 gap-y-4">
            {section.fields.map((field) => (
              <div
                key={field.key}
                className={field.span === "full" ? "col-span-2" : "col-span-2 sm:col-span-1"}
              >
                <label className="block text-[12px] font-medium text-text-secondary mb-1.5">
                  {t(field.labelKey as any)}
                  {field.required && <span className="text-danger ml-0.5">*</span>}
                </label>
                {renderField(field, values, setValue, isDisabled(field), getOptions(field))}
                {field.helpText && (
                  <p className="text-[11px] text-text-muted mt-1">{field.helpText}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </motion.div>
  );
}

function renderField(
  field: FieldConfig,
  values: Record<string, unknown>,
  setValue: (key: string, val: unknown) => void,
  disabled: boolean,
  options: { value: string; label: string }[]
) {
  const baseClass =
    "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed";
  const monoClass = field.mono ? " font-mono" : "";
  const val = values[field.key];

  switch (field.type) {
    case "textarea":
    case "code":
      return (
        <textarea
          value={String(val ?? "")}
          onChange={(e) => setValue(field.key, e.target.value)}
          disabled={disabled}
          rows={field.rows ?? (field.type === "code" ? 8 : 3)}
          placeholder={field.placeholder}
          className={`${baseClass}${monoClass} resize-y ${field.type === "code" ? "font-mono text-[12px]" : ""}`}
        />
      );
    case "number":
      return (
        <input
          type="number"
          value={val != null ? String(val) : ""}
          onChange={(e) => setValue(field.key, Number(e.target.value))}
          disabled={disabled}
          placeholder={field.placeholder}
          className={`${baseClass}${monoClass}`}
        />
      );
    case "switch":
      return (
        <button
          type="button"
          onClick={() => !disabled && setValue(field.key, !val)}
          disabled={disabled}
          className={`relative h-6 w-11 rounded-full transition-colors ${
            val ? "bg-accent" : "bg-surface-4"
          } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              val ? "translate-x-5" : ""
            }`}
          />
        </button>
      );
    case "select":
      return (
        <select
          value={String(val ?? "")}
          onChange={(e) => setValue(field.key, e.target.value)}
          disabled={disabled}
          className={`${baseClass}${monoClass}`}
        >
          <option value="">{field.placeholder ?? "—"}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case "multiSelect":
    case "tags":
      return (
        <TagsInput
          value={Array.isArray(val) ? (val as string[]) : []}
          onChange={(v) => setValue(field.key, v)}
          options={options}
          disabled={disabled}
          placeholder={field.placeholder}
        />
      );
    case "password":
      return (
        <input
          type="password"
          value={String(val ?? "")}
          onChange={(e) => setValue(field.key, e.target.value)}
          disabled={disabled}
          placeholder={field.placeholder}
          className={`${baseClass}${monoClass}`}
        />
      );
    default:
      return (
        <input
          type={field.type === "url" ? "url" : field.type === "email" ? "email" : "text"}
          value={String(val ?? "")}
          onChange={(e) => setValue(field.key, e.target.value)}
          disabled={disabled}
          placeholder={field.placeholder}
          className={`${baseClass}${monoClass}`}
        />
      );
  }
}

// Simple tags input component
function TagsInput({
  value,
  onChange,
  options,
  disabled,
  placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");

  const addTag = (tag: string) => {
    if (tag && !value.includes(tag)) {
      onChange([...value, tag]);
    }
    setInput("");
  };

  const removeTag = (tag: string) => {
    onChange(value.filter((v) => v !== tag));
  };

  return (
    <div
      className={`flex flex-wrap gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-2 min-h-[38px] ${
        disabled ? "opacity-50" : ""
      }`}
    >
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full bg-accent/15 border border-accent/20 px-2 py-0.5 text-[11px] font-medium text-accent"
        >
          {tag}
          {!disabled && (
            <button
              onClick={() => removeTag(tag)}
              className="hover:text-danger transition-colors text-[10px]"
            >
              x
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        options.length > 0 ? (
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) addTag(e.target.value);
            }}
            className="flex-1 min-w-[80px] bg-transparent text-[12px] text-text-primary outline-none"
          >
            <option value="">{placeholder ?? "Select..."}</option>
            {options
              .filter((o) => !value.includes(o.value))
              .map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
          </select>
        ) : (
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag(input.trim());
              }
            }}
            onBlur={() => input.trim() && addTag(input.trim())}
            disabled={disabled}
            placeholder={placeholder ?? "Type and press Enter..."}
            className="flex-1 min-w-[80px] bg-transparent text-[12px] text-text-primary outline-none placeholder:text-text-muted"
          />
        )
      )}
    </div>
  );
}
