import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Trash2, LogOut, Plus, ArrowUp, ArrowDown, RotateCcw } from "lucide-react";
import StickyEditHeader from "../components/StickyEditHeader";
import { FormField, FormSection, inputClass, monoInputClass, Switch } from "../components/FormSection";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityEdit } from "../hooks/useEntityEdit";
import * as RuleBackend from "../backend/RuleBackend";
import * as OrganizationBackend from "../backend/OrganizationBackend";
import type { Rule, Expression } from "../backend/RuleBackend";
import { friendlyError } from "../utils/errorHelper";
import SimpleSelect from "../components/SimpleSelect";
import SingleSearchSelect from "../components/SingleSearchSelect";
import SaveButton from "../components/SaveButton";
import UnsavedBanner from "../components/UnsavedBanner";
import { useUnsavedWarning } from "../hooks/useUnsavedWarning";
import { getStoredAccount, isGlobalAdmin } from "../utils/auth";

// Options built with t() inside component — see useRuleOptions()

// Default expressions per rule type
function getDefaultExpressions(type: string): Expression[] {
  switch (type) {
    case "WAF":
      return [
        { name: "XML parser", operator: "match", value: 'SecRule REQUEST_HEADERS:Content-Type "(?:application(?:/soap\\+|/)|text/)xml" "id:\'200000\',phase:1,t:none,t:lowercase,pass,nolog,ctl:requestBodyProcessor=XML"' },
        { name: "JSON parser", operator: "match", value: 'SecRule REQUEST_HEADERS:Content-Type "application/json" "id:\'200001\',phase:1,t:none,t:lowercase,pass,nolog,ctl:requestBodyProcessor=JSON"' },
        { name: "Body verification", operator: "match", value: 'SecRule REQBODY_ERROR "!@eq 0" "id:\'200002\', phase:2,t:none,log,deny,status:400,msg:\'Failed to parse request body.\',logdata:\'%{reqbody_error_msg}\',severity:2"' },
      ];
    case "IP":
      return [
        { name: "loopback", operator: "is in", value: "127.0.0.1" },
        { name: "lan cidr", operator: "is in", value: "10.0.0.0/8,192.168.0.0/16" },
      ];
    case "User-Agent":
      return [
        { name: "Current User-Agent", operator: "equals", value: typeof navigator !== "undefined" ? navigator.userAgent : "" },
      ];
    case "IP Rate Limiting":
      return [
        { name: "Default IP Rate", operator: "100", value: "6000" },
      ];
    case "Compound":
      return [
        { name: "Start", operator: "begin", value: "" },
        { name: "And", operator: "and", value: "" },
      ];
    default:
      return [];
  }
}

// Row action buttons (up/down/delete)
function RowActions({ index, total, onMove, onDelete, disableDelete }: {
  index: number; total: number;
  onMove: (from: number, to: number) => void;
  onDelete: (i: number) => void;
  disableDelete?: boolean;
}) {
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <button disabled={index === 0} onClick={() => onMove(index, index - 1)} className="rounded p-1 text-text-muted hover:text-text-secondary hover:bg-surface-2 disabled:opacity-30 transition-colors"><ArrowUp size={13} /></button>
      <button disabled={index === total - 1} onClick={() => onMove(index, index + 1)} className="rounded p-1 text-text-muted hover:text-text-secondary hover:bg-surface-2 disabled:opacity-30 transition-colors"><ArrowDown size={13} /></button>
      {!disableDelete && (
        <button onClick={() => onDelete(index)} className="rounded p-1 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"><Trash2 size={13} /></button>
      )}
    </div>
  );
}

export default function RuleEditPage() {
  const { owner, name } = useParams<{ owner: string; name: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAddMode, setIsAddMode] = useState((location.state as any)?.mode === "add");
  const { t } = useTranslation();
  const modal = useModal();
  const [rule, setRule] = useState<Rule | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (saved) { const timer = setTimeout(() => setSaved(false), 1500); return () => clearTimeout(timer); } }, [saved]);
  const [originalJson, setOriginalJson] = useState("");

  // i18n-aware select options
  const TYPE_OPTIONS = [
    { value: "WAF", label: "WAF" },
    { value: "IP", label: "IP" },
    { value: "User-Agent", label: "User-Agent" },
    { value: "IP Rate Limiting", label: t("rules.type.ipRateLimit" as any) },
    { value: "Compound", label: t("rules.type.compound" as any) },
  ];
  const ACTION_OPTIONS = [
    { value: "Allow", label: t("rules.action.allow" as any) },
    { value: "Block", label: t("rules.action.block" as any) },
  ];
  const IP_OPERATOR_OPTIONS = [
    { value: "is in", label: t("rules.op.isIn" as any) },
    { value: "is not in", label: t("rules.op.isNotIn" as any) },
  ];
  const UA_OPERATOR_OPTIONS = [
    { value: "equals", label: t("rules.op.equals" as any) },
    { value: "does not equal", label: t("rules.op.doesNotEqual" as any) },
    { value: "contains", label: t("rules.op.contains" as any) },
    { value: "does not contain", label: t("rules.op.doesNotContain" as any) },
    { value: "match", label: t("rules.op.match" as any) },
  ];

  // Admin org dropdown
  const account = getStoredAccount();
  const isAdmin = isGlobalAdmin(account);
  const [orgOptions, setOrgOptions] = useState<{ value: string; label: string }[]>([]);

  // Available rules for Compound type
  const [availableRules, setAvailableRules] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    if (!isAdmin) return;
    OrganizationBackend.getOrganizationNames("admin").then((res) => {
      if (res.status === "ok" && res.data) {
        setOrgOptions(res.data.map((o) => ({ value: o.name, label: o.displayName || o.name })));
      }
    }).catch(() => {});
  }, [isAdmin]);

  // Load available rules for compound type
  useEffect(() => {
    if (!rule?.owner) return;
    RuleBackend.getRules({ owner: rule.owner }).then((res) => {
      if (res.status === "ok" && res.data) {
        const currentId = `${owner}/${name}`;
        setAvailableRules(
          res.data
            .filter((r: any) => `${r.owner}/${r.name}` !== currentId)
            .map((r: any) => ({ value: `${r.owner}/${r.name}`, label: r.name }))
        );
      }
    }).catch(() => {});
  }, [rule?.owner]); // owner/name are URL params, stable during component lifecycle

  const { entity, loading, invalidate: _invalidate, invalidateList } = useEntityEdit<Rule>({
    queryKey: "rule",
    owner,
    name,
    fetchFn: RuleBackend.getRule,
  });

  useEffect(() => {
    if (entity) { setRule(entity); setOriginalJson(JSON.stringify(entity)); }
  }, [entity]);

  const isDirty = !!rule && originalJson !== "" && JSON.stringify(rule) !== originalJson;
  const showBanner = useUnsavedWarning({ isAddMode, isDirty });

  if (loading || !rule) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  const set = (key: string, val: unknown) => {
    setRule((prev) => {
      if (!prev) return prev;
      if (key === "type") {
        return { ...prev, type: val as string, expressions: [] };
      }
      return { ...prev, [key]: val };
    });
  };

  const setExpressions = (exprs: Expression[]) => set("expressions", exprs);

  const updateExpr = (index: number, key: keyof Expression, value: string) => {
    const exprs = [...(rule.expressions || [])];
    exprs[index] = { ...exprs[index], [key]: value };
    setExpressions(exprs);
  };

  const addExpr = (expr?: Partial<Expression>) => {
    setExpressions([...(rule.expressions || []), { name: "", operator: "", value: "", ...expr }]);
  };

  const removeExpr = (index: number) => {
    const exprs = [...(rule.expressions || [])];
    exprs.splice(index, 1);
    setExpressions(exprs);
  };

  const moveExpr = (from: number, to: number) => {
    const exprs = [...(rule.expressions || [])];
    const [item] = exprs.splice(from, 1);
    exprs.splice(to, 0, item);
    setExpressions(exprs);
  };

  const restoreDefaults = () => {
    setExpressions(getDefaultExpressions(rule.type));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await RuleBackend.updateRule(owner!, name!, rule);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        setSaved(true);
        setOriginalJson(JSON.stringify(rule));
        setIsAddMode(false);
        invalidateList();
        if (rule.name !== name) {
          navigate(`/rules/${rule.owner}/${rule.name}`, { replace: true });
        }
      } else {
        modal.toast(friendlyError(res.msg, t) || t("common.saveFailed" as any), "error");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndExit = async () => {
    setSaving(true);
    try {
      const res = await RuleBackend.updateRule(owner!, name!, rule);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        invalidateList();
        navigate("/rules");
      } else {
        modal.toast(friendlyError(res.msg, t) || t("common.saveFailed" as any), "error");
      }
    } catch (e: any) {
      modal.toast(e?.message || t("common.saveFailed" as any), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleBack = async () => {
    if (isAddMode) {
      await RuleBackend.deleteRule(rule);
      invalidateList();
    }
    navigate("/rules");
  };

  const handleDelete = () => {
    modal.showConfirm(t("common.confirmDelete"), async () => {
      try {
        const res = await RuleBackend.deleteRule(rule);
        if (res.status === "ok") {
          invalidateList();
          navigate("/rules");
        } else {
          modal.toast(res.msg || t("common.deleteFailed" as any), "error");
        }
      } catch (e) {
        console.error(e);
      }
    });
  };

  const showAction = rule.type !== "WAF";
  const showStatusCode = rule.type !== "WAF" && (rule.action === "Allow" || rule.action === "Block");

  // Expression table header buttons
  const exprHeaderButtons = (
    <div className="flex items-center gap-2">
      {rule.type !== "IP Rate Limiting" && (
        <button onClick={() => addExpr()} className="flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-accent-hover transition-colors">
          <Plus size={12} /> {t("common.add" as any)}
        </button>
      )}
      <button onClick={restoreDefaults} className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium text-text-secondary hover:bg-surface-2 transition-colors">
        <RotateCcw size={12} /> {t("rules.restoreDefaults" as any)}
      </button>
    </div>
  );

  // Render type-specific expression editor
  const renderExpressions = () => {
    const exprs = rule.expressions || [];

    switch (rule.type) {
      case "WAF":
        return (
          <div className="col-span-full overflow-hidden rounded-lg border border-border">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-surface-1">
                  <th className="px-3 py-2 text-left font-medium text-text-secondary w-[180px]">{t("col.name" as any)}</th>
                  <th className="px-3 py-2 text-left font-medium text-text-secondary">{t("rules.field.expression" as any)}</th>
                  <th className="px-3 py-2 text-center font-medium text-text-secondary w-[90px]">{t("common.action" as any)}</th>
                </tr>
              </thead>
              <tbody>
                {exprs.map((expr, i) => (
                  <tr key={i} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-1.5"><input value={expr.name} onChange={(e) => updateExpr(i, "name", e.target.value)} className={`${monoInputClass} w-full`} /></td>
                    <td className="px-3 py-1.5"><input value={expr.value} onChange={(e) => updateExpr(i, "value", e.target.value)} className={`${monoInputClass} w-full text-[11px]`} placeholder="SecRule ..." /></td>
                    <td className="px-3 py-1.5"><RowActions index={i} total={exprs.length} onMove={moveExpr} onDelete={removeExpr} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {exprs.length === 0 && <p className="p-4 text-center text-[13px] text-text-muted">{t("common.noData")}</p>}
          </div>
        );

      case "IP":
        return (
          <div className="col-span-full overflow-hidden rounded-lg border border-border">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-surface-1">
                  <th className="px-3 py-2 text-left font-medium text-text-secondary w-[180px]">{t("col.name" as any)}</th>
                  <th className="px-3 py-2 text-left font-medium text-text-secondary w-[160px]">{t("rules.field.operator" as any)}</th>
                  <th className="px-3 py-2 text-left font-medium text-text-secondary">{t("rules.field.ipList" as any)}</th>
                  <th className="px-3 py-2 text-center font-medium text-text-secondary w-[90px]">{t("common.action" as any)}</th>
                </tr>
              </thead>
              <tbody>
                {exprs.map((expr, i) => (
                  <tr key={i} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-1.5"><input value={expr.name} onChange={(e) => updateExpr(i, "name", e.target.value)} className={`${monoInputClass} w-full`} /></td>
                    <td className="px-3 py-1.5">
                      <SimpleSelect value={expr.operator} options={IP_OPERATOR_OPTIONS} onChange={(v) => updateExpr(i, "operator", v)} />
                    </td>
                    <td className="px-3 py-1.5"><input value={expr.value} onChange={(e) => updateExpr(i, "value", e.target.value)} className={`${monoInputClass} w-full`} placeholder="127.0.0.1, 10.0.0.0/8" /></td>
                    <td className="px-3 py-1.5"><RowActions index={i} total={exprs.length} onMove={moveExpr} onDelete={removeExpr} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {exprs.length === 0 && <p className="p-4 text-center text-[13px] text-text-muted">{t("common.noData")}</p>}
          </div>
        );

      case "User-Agent":
        return (
          <div className="col-span-full overflow-hidden rounded-lg border border-border">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-surface-1">
                  <th className="px-3 py-2 text-left font-medium text-text-secondary w-[180px]">{t("col.name" as any)}</th>
                  <th className="px-3 py-2 text-left font-medium text-text-secondary w-[180px]">{t("rules.field.operator" as any)}</th>
                  <th className="px-3 py-2 text-left font-medium text-text-secondary">{t("rules.field.value" as any)}</th>
                  <th className="px-3 py-2 text-center font-medium text-text-secondary w-[90px]">{t("common.action" as any)}</th>
                </tr>
              </thead>
              <tbody>
                {exprs.map((expr, i) => (
                  <tr key={i} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-1.5"><input value={expr.name} onChange={(e) => updateExpr(i, "name", e.target.value)} className={`${monoInputClass} w-full`} /></td>
                    <td className="px-3 py-1.5">
                      <SimpleSelect value={expr.operator} options={UA_OPERATOR_OPTIONS} onChange={(v) => updateExpr(i, "operator", v)} />
                    </td>
                    <td className="px-3 py-1.5"><input value={expr.value} onChange={(e) => updateExpr(i, "value", e.target.value)} className={`${monoInputClass} w-full`} /></td>
                    <td className="px-3 py-1.5"><RowActions index={i} total={exprs.length} onMove={moveExpr} onDelete={removeExpr} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {exprs.length === 0 && <p className="p-4 text-center text-[13px] text-text-muted">{t("common.noData")}</p>}
          </div>
        );

      case "IP Rate Limiting":
        return (
          <div className="col-span-full space-y-3">
            {exprs.length === 0 ? (
              <p className="text-[13px] text-text-muted">{t("common.noData")}</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField label={t("col.name" as any)}>
                  <input value={exprs[0]?.name ?? ""} onChange={(e) => updateExpr(0, "name", e.target.value)} className={monoInputClass} />
                </FormField>
                <FormField label={t("rules.field.rate" as any)} tooltip={t("rules.tooltip.rate" as any)}>
                  <div className="flex items-center gap-2">
                    <input type="number" min={1} value={Number(exprs[0]?.operator) || 0} onChange={(e) => updateExpr(0, "operator", e.target.value)} className={`${monoInputClass} w-24`} />
                    <span className="text-[11px] text-text-muted whitespace-nowrap">{t("rules.field.rateUnit" as any)}</span>
                  </div>
                </FormField>
                <FormField label={t("rules.field.blockDuration" as any)} tooltip={t("rules.tooltip.blockDuration" as any)}>
                  <div className="flex items-center gap-2">
                    <input type="number" min={1} value={Number(exprs[0]?.value) || 0} onChange={(e) => updateExpr(0, "value", e.target.value)} className={`${monoInputClass} w-24`} />
                    <span className="text-[11px] text-text-muted">{t("sites.field.seconds" as any)}</span>
                  </div>
                </FormField>
              </div>
            )}
          </div>
        );

      case "Compound":
        return (
          <div className="col-span-full overflow-hidden rounded-lg border border-border">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-surface-1">
                  <th className="px-3 py-2 text-left font-medium text-text-secondary w-[160px]">{t("rules.field.logic" as any)}</th>
                  <th className="px-3 py-2 text-left font-medium text-text-secondary">{t("rules.field.rule" as any)}</th>
                  <th className="px-3 py-2 text-center font-medium text-text-secondary w-[90px]">{t("common.action" as any)}</th>
                </tr>
              </thead>
              <tbody>
                {exprs.map((expr, i) => (
                  <tr key={i} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-1.5">
                      {i === 0 ? (
                        <span className="text-[12px] font-medium text-text-muted px-2 py-1 bg-surface-2 rounded">begin</span>
                      ) : (
                        <SimpleSelect
                          value={expr.operator}
                          options={[{ value: "and", label: "AND" }, { value: "or", label: "OR" }]}
                          onChange={(v) => updateExpr(i, "operator", v)}
                        />
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <SingleSearchSelect
                        value={expr.value}
                        options={availableRules}
                        onChange={(v) => updateExpr(i, "value", v)}
                        placeholder={t("rules.placeholder.selectRule" as any)}
                      />
                    </td>
                    <td className="px-3 py-1.5"><RowActions index={i} total={exprs.length} onMove={moveExpr} onDelete={removeExpr} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {exprs.length === 0 && <p className="p-4 text-center text-[13px] text-text-muted">{t("common.noData")}</p>}
          </div>
        );

      default:
        return <p className="col-span-full text-[13px] text-text-muted">{t("rules.selectType" as any)}</p>;
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <StickyEditHeader
        title={`${isAddMode ? t("common.add") : t("common.edit")} ${t("rules.title" as any)}`}
        subtitle={`${owner}/${name}`}
        onBack={handleBack}
      >
        <button onClick={handleDelete} className="flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-2 text-[13px] font-medium text-danger hover:bg-danger/10 transition-colors">
          <Trash2 size={14} /> {t("common.delete")}
        </button>
        <SaveButton onClick={handleSave} saving={saving} saved={saved} label={t("common.save")} />
        <button onClick={handleSaveAndExit} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors">
          {saving ? <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <LogOut size={14} />}
          {t("common.saveAndExit" as any)}
        </button>
      </StickyEditHeader>

      {showBanner && <UnsavedBanner isAddMode={isAddMode} />}

      {/* Basic Info */}
      <FormSection title={t("rules.section.basic" as any)}>
        <FormField label={t("field.owner")}>
          {isAdmin ? (
            <SingleSearchSelect value={rule.owner} options={orgOptions} onChange={(v) => set("owner", v)} placeholder={t("common.search" as any)} />
          ) : (
            <input value={rule.owner} disabled className={inputClass} />
          )}
        </FormField>
        <FormField label={t("field.name")} required>
          <input value={rule.name} onChange={(e) => set("name", e.target.value)} className={monoInputClass} />
        </FormField>
      </FormSection>

      {/* Type & Action */}
      <FormSection title={t("rules.section.config" as any)}>
        <FormField label={t("rules.field.type" as any)}>
          <SimpleSelect value={rule.type} options={TYPE_OPTIONS} onChange={(v) => set("type", v)} />
        </FormField>
        {showAction && (
          <FormField label={t("common.action" as any)}>
            <SimpleSelect value={rule.action} options={ACTION_OPTIONS} onChange={(v) => set("action", v)} />
          </FormField>
        )}
        {showStatusCode && (
          <FormField label={t("rules.field.statusCode" as any)}>
            <input type="number" min={100} max={599} value={rule.statusCode} onChange={(e) => set("statusCode", Number(e.target.value))} className={`${monoInputClass} w-32`} />
          </FormField>
        )}
        <FormField label={t("rules.field.reason" as any)} span="full">
          <input value={rule.reason} onChange={(e) => set("reason", e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t("rules.field.verboseMode" as any)}>
          <Switch checked={rule.isVerbose} onChange={(checked) => set("isVerbose", checked)} />
        </FormField>
      </FormSection>

      {/* Expressions — type-specific */}
      <FormSection title={t("rules.field.expressions" as any)} action={rule.type ? exprHeaderButtons : undefined}>
        {renderExpressions()}
      </FormSection>
    </motion.div>
  );
}
