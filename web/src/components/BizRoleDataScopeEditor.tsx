import { useState } from "react";
import { useTranslation } from "../i18n";
import { inputClass, monoInputClass } from "./FormSection";
import { DATA_SCOPE_TYPES, isValidPropsJson, readDataScope, writeDataScope, type DataScopeType, type DataScopeValue } from "./bizDataScope";

export default function BizRoleDataScopeEditor({
  value, onChange,
}: {
  value: string;
  onChange: (raw: string) => void;
}) {
  const { t } = useTranslation();
  const valid = isValidPropsJson(value);
  const ds = readDataScope(value);
  const [text, setText] = useState(ds.values.join("\n"));
  const splitText = (s: string) => s.split(/[\n,]/).map((v) => v.trim()).filter(Boolean);
  const dsJoined = ds.values.join("\n");
  // Resync when the properties change from elsewhere (e.g. JSON mode).
  const [prevJoined, setPrevJoined] = useState(dsJoined);
  if (dsJoined !== prevJoined) {
    setPrevJoined(dsJoined);
    if (splitText(text).join("\n") !== dsJoined) setText(dsJoined);
  }

  const apply = (next: DataScopeValue) => {
    const raw = writeDataScope(value, next);
    if (raw !== null) onChange(raw);
  };

  const labels: Record<DataScopeType, string> = {
    all: t("bizRole.dataScope.all") || "All data",
    org: t("bizRole.dataScope.org") || "Whole organization",
    dept_and_children: t("bizRole.dataScope.deptAndChildren") || "Department and sub-departments",
    dept: t("bizRole.dataScope.dept") || "Own department",
    self: t("bizRole.dataScope.self") || "Own data only",
    custom: t("bizRole.dataScope.custom") || "Custom",
  };

  return (
    <div className="space-y-2" data-testid="biz-role-datascope">
      <div className="text-[12px] font-medium text-text-secondary">
        {t("bizRole.dataScope.title") || "Data scope"}
      </div>
      <p className="text-[12px] text-text-muted">
        {t("bizRole.dataScope.hint") || "Business systems read this to filter data. When a user has several roles, the most permissive scope wins."}
      </p>
      {!valid && (
        <p className="text-[12px] text-danger">
          {t("bizRole.dataScope.invalidJson") || "Properties JSON is invalid; fix it in JSON mode first."}
        </p>
      )}
      <select
        aria-label={t("bizRole.dataScope.title") || "Data scope"}
        className={inputClass}
        disabled={!valid}
        value={ds.type}
        onChange={(e) => apply({ type: e.target.value as DataScopeType | "", values: ds.values })}
      >
        <option value="">{t("bizRole.dataScope.unset") || "Not set"}</option>
        {DATA_SCOPE_TYPES.map((s) => (
          <option key={s} value={s}>{labels[s]}</option>
        ))}
      </select>
      {ds.type === "custom" && (
        <div>
          <textarea
            aria-label={t("bizRole.dataScope.values") || "Custom scope values"}
            className={`${monoInputClass} min-h-[72px] resize-y`}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              apply({ type: "custom", values: splitText(e.target.value) });
            }}
            placeholder={t("bizRole.dataScope.valuesPlaceholder") || "One value per line, e.g. department ids"}
          />
        </div>
      )}
    </div>
  );
}
