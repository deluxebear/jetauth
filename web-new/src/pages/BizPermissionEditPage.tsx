import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertTriangle, Archive, ArrowRight, Calendar, Check, Eye, FlaskConical, Info,
  Key, LogOut, Plus, Save, Shield, ShieldCheck, ShieldX, Target,
  UserPlus, X, Zap,
} from "lucide-react";

import { bizKeys } from "../backend/bizQueryKeys";
import * as BizBackend from "../backend/BizBackend";
import type { BizPermission } from "../backend/BizBackend";

import EntityHeader from "../components/EntityHeader";
import SplitButton, { type SplitButtonAction } from "../components/SplitButton";
import StatCard from "../components/StatCard";
import StickyEditHeader from "../components/StickyEditHeader";
import SaveButton from "../components/SaveButton";
import UnsavedBanner from "../components/UnsavedBanner";
import DangerZone from "../components/DangerZone";
import { FormField, FormSection, inputClass, monoInputClass, Switch } from "../components/FormSection";
import { TabBar } from "../components/Tabs";
import BizPermissionGranteeTable from "../components/BizPermissionGranteeTable";
import BizResourcePicker, { type PickedResource } from "../components/BizResourcePicker";
import { useModal } from "../components/Modal";
import { useTranslation } from "../i18n";
import { friendlyError } from "../utils/errorHelper";

// ── Helpers ────────────────────────────────────────────────────────────

type SavePref = "save" | "saveAndAdd" | "saveAndExit";
const SAVE_PREF_KEY = "jetauth.bizPermission.saveAction";

function readSavePref(): SavePref {
  try {
    const v = localStorage.getItem(SAVE_PREF_KEY);
    if (v === "save" || v === "saveAndAdd" || v === "saveAndExit") return v;
  } catch { /* ignore */ }
  return "saveAndExit";
}
function writeSavePref(v: SavePref) {
  try { localStorage.setItem(SAVE_PREF_KEY, v); } catch { /* ignore */ }
}

type EditTab = "overview" | "rules" | "grantees" | "settings";
const DEFAULT_TAB: EditTab = "overview";
const VALID_TABS: EditTab[] = ["overview", "rules", "grantees", "settings"];
function tabFromHash(hash: string): EditTab {
  const h = hash.replace(/^#/, "");
  // Legacy #grantees anchor maps to grantees tab.
  if (h === "grantees") return "grantees";
  return (VALID_TABS as string[]).includes(h) ? (h as EditTab) : DEFAULT_TAB;
}

// ── Main page ─────────────────────────────────────────────────────────

export default function BizPermissionEditPage() {
  const { owner, appName, name } = useParams<{ owner: string; appName: string; name: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isNew = !name || name === "new";
  const forcedAddMode = (location.state as { mode?: string } | null)?.mode === "add";
  const isAddMode = isNew || forcedAddMode;
  const { t } = useTranslation();
  const modal = useModal();
  const queryClient = useQueryClient();

  const configQuery = useQuery({
    enabled: !!owner && !!appName,
    queryKey: bizKeys.app(owner, appName),
    staleTime: 30_000,
    queryFn: async () => {
      const res = await BizBackend.getBizAppConfig(`${owner}/${appName}`);
      return res.status === "ok" && res.data ? res.data : null;
    },
  });
  const supportsDeny = configQuery.data?.supportsDeny !== false;

  const permissionsQuery = useQuery({
    enabled: !!owner && !!appName && !isNew,
    queryKey: bizKeys.permissions(owner, appName),
    staleTime: 30_000,
    queryFn: async () => {
      const res = await BizBackend.getBizPermissions(owner!, appName!);
      return res.status === "ok" && res.data ? res.data : [];
    },
  });

  const [perm, setPerm] = useState<BizPermission | null>(null);
  const [originalJson, setOriginalJson] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 1500);
    return () => clearTimeout(timer);
  }, [saved]);

  useEffect(() => {
    if (perm || !owner || !appName) return;
    if (isNew) {
      const p = BizBackend.newBizPermission(owner, appName);
      setPerm(p);
      setOriginalJson(JSON.stringify(p));
      return;
    }
    if (permissionsQuery.isLoading) return;
    const list = permissionsQuery.data ?? [];
    const found = list.find((p) => p.name === name);
    if (found) {
      setPerm(found);
      setOriginalJson(JSON.stringify(found));
    } else if (permissionsQuery.isSuccess) {
      modal.toast((t("bizPerm.notFound") || "Permission not found: {name}").replace("{name}", name || ""), "error");
    }
  }, [perm, permissionsQuery.data, permissionsQuery.isLoading, permissionsQuery.isSuccess, isNew, owner, appName, name, modal, t]);

  const statsQuery = useQuery({
    enabled: !!perm?.id && !isAddMode,
    queryKey: bizKeys.permissionStats(perm?.id),
    staleTime: 30_000,
    queryFn: async () => {
      const res = await BizBackend.getBizPermissionStats(perm!.id!);
      return res.status === "ok" && res.data ? res.data : null;
    },
  });
  const stats = statsQuery.data ?? null;

  const loading = !perm && (permissionsQuery.isLoading || (!isNew && permissionsQuery.isPending));
  const isDirty = useMemo(
    () => !!perm && originalJson !== "" && JSON.stringify(perm) !== originalJson,
    [perm, originalJson],
  );

  const backPath = `/authorization/${owner}/${appName}?tab=permissions`;
  const editBase = `/authorization/${owner}/${appName}`;

  const invalidatePermissions = () => {
    queryClient.invalidateQueries({ queryKey: bizKeys.permissions(owner, appName) });
    queryClient.invalidateQueries({ queryKey: bizKeys.app(owner, appName) });
    if (perm?.id) queryClient.invalidateQueries({ queryKey: bizKeys.permissionStats(perm.id) });
  };

  const saveMutation = useMutation({
    mutationFn: (toSave: BizPermission) =>
      isAddMode && isNew
        ? BizBackend.addBizPermission(toSave)
        : BizBackend.updateBizPermission(perm!.id!, toSave),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => BizBackend.deleteBizPermission(id),
    onSuccess: (res) => {
      if (res.status === "ok") {
        invalidatePermissions();
        navigate(backPath);
      } else {
        modal.toast(friendlyError(res.msg, t) || res.msg, "error");
      }
    },
    onError: (err: Error) => modal.toast(err.message || t("common.error"), "error"),
  });

  const saving = saveMutation.isPending;
  const showBanner = !isAddMode && isDirty;

  const doSave = async (): Promise<{ ok: boolean; saved: BizPermission } | null> => {
    if (!perm) return null;
    try {
      const res = await saveMutation.mutateAsync(perm);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess") || "Saved");
        setSaved(true);
        setOriginalJson(JSON.stringify(perm));
        invalidatePermissions();
        return { ok: true, saved: perm };
      }
      modal.toast(friendlyError(res.msg, t) || res.msg, "error");
      return { ok: false, saved: perm };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t("common.saveFailed") || "Save failed";
      modal.toast(msg, "error");
      return { ok: false, saved: perm };
    }
  };

  const handleSave = async () => {
    writeSavePref("save");
    const r = await doSave();
    if (r?.ok && isAddMode && isNew) {
      navigate(`${editBase}/permissions/${r.saved.name}`, { replace: true });
    }
  };
  const handleSaveAndExit = async () => {
    writeSavePref("saveAndExit");
    const r = await doSave();
    if (r?.ok) navigate(backPath);
  };
  const handleSaveAndAdd = async () => {
    writeSavePref("saveAndAdd");
    if (!owner || !appName || !perm) return;
    const r = await doSave();
    if (!r?.ok) return;
    const fresh = BizBackend.newBizPermission(owner, appName);
    // Preserve effect — batch creates are usually same-effect.
    fresh.effect = perm.effect;
    setPerm(fresh);
    setOriginalJson(JSON.stringify(fresh));
    navigate(`${editBase}/permissions/new`, { replace: true });
  };

  const handleBack = () => navigate(backPath);

  if (loading || !perm) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  const set = (key: string, val: unknown) => {
    setPerm((prev) => prev ? { ...prev, [key]: val } : prev);
  };

  const saveActions: Record<SavePref, SplitButtonAction> = {
    save: {
      key: "save",
      label: t("common.save") || "保存",
      icon: <Save size={14} />,
      description: t("bizPerm.save.stayHint") || "保存后继续编辑",
      onSelect: handleSave,
    },
    saveAndAdd: {
      key: "saveAndAdd",
      label: t("bizPerm.save.andAdd") || "保存并继续添加",
      icon: <Plus size={14} />,
      description: t("bizPerm.save.andAddHint") || "保存后清空表单,继续新建权限",
      onSelect: handleSaveAndAdd,
    },
    saveAndExit: {
      key: "saveAndExit",
      label: t("common.saveAndExit") || "保存并退出",
      icon: <LogOut size={14} />,
      description: t("bizPerm.save.andExitHint") || "保存后返回列表",
      onSelect: handleSaveAndExit,
    },
  };
  const savePref = readSavePref();

  if (isAddMode && isNew) {
    return (
      <CreateView
        perm={perm}
        set={set}
        appName={appName!}
        saving={saving}
        saved={saved}
        savePref={savePref}
        saveActions={saveActions}
        supportsDeny={supportsDeny}
        onBack={handleBack}
      />
    );
  }

  return (
    <EditView
      perm={perm}
      set={set}
      saved={saved}
      saving={saving}
      savePref={savePref}
      saveActions={saveActions}
      handleSave={handleSave}
      handleSaveAndExit={handleSaveAndExit}
      onBack={handleBack}
      isDirty={isDirty}
      showBanner={showBanner}
      supportsDeny={supportsDeny}
      stats={stats}
      onDeleteConfirmed={() => deleteMutation.mutate(perm.id!)}
      locationHash={location.hash}
      navigateTab={(tab: EditTab) => navigate(`${location.pathname}${location.search}#${tab}`, { replace: false })}
    />
  );
}

// ── Create view ───────────────────────────────────────────────────────

type CreateViewProps = {
  perm: BizPermission;
  set: (k: string, v: unknown) => void;
  appName: string;
  saving: boolean;
  saved: boolean;
  savePref: SavePref;
  saveActions: Record<SavePref, SplitButtonAction>;
  supportsDeny: boolean;
  onBack: () => void;
};

function CreateView(props: CreateViewProps) {
  const { t } = useTranslation();
  const { perm, set, appName, saving, saved, savePref, saveActions, supportsDeny, onBack } = props;

  const primary = saveActions[savePref];
  const others = (Object.keys(saveActions) as SavePref[])
    .filter((k) => k !== savePref)
    .map((k) => saveActions[k]);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <StickyEditHeader
        title={`${t("common.add") || "新建"} ${t("bizPerm.editTitle") || "业务权限"}`}
        subtitle={appName}
        onBack={onBack}
      >
        <SplitButton saving={saving} saved={saved} primary={primary} actions={others} />
      </StickyEditHeader>

      <FormSection title={t("bizPerm.section.basic") || "基本信息"}>
        <FormField label={t("field.displayName") || "显示名称"}>
          <input
            className={inputClass}
            value={perm.displayName}
            onChange={(e) => set("displayName", e.target.value)}
            autoFocus
          />
        </FormField>
        <FormField
          label={t("field.name") || "名称"}
          help={t("bizPerm.name.hint") || "API 引用标识,创建后不可修改"}
        >
          <input
            className={monoInputClass}
            value={perm.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="permission_xxx"
          />
        </FormField>
        <FormField label={t("field.description") || "描述"} span="full">
          <textarea
            className={`${inputClass} min-h-[72px] resize-y`}
            value={perm.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </FormField>
        <FormField label={t("field.isEnabled") || "是否启用"} span="full">
          <div className="flex items-center justify-between">
            <p className="text-[12px] text-text-muted">
              {t("bizPerm.enabledHelp") || "禁用后该权限在鉴权时不会被评估"}
            </p>
            <Switch checked={perm.isEnabled} onChange={(v) => set("isEnabled", v)} />
          </div>
        </FormField>
      </FormSection>

      <RulesEditor perm={perm} set={set} supportsDeny={supportsDeny} />
    </motion.div>
  );
}

// ── Edit view ─────────────────────────────────────────────────────────

type EditViewProps = {
  perm: BizPermission;
  set: (k: string, v: unknown) => void;
  saved: boolean;
  saving: boolean;
  savePref: SavePref;
  saveActions: Record<SavePref, SplitButtonAction>;
  handleSave: () => void;
  handleSaveAndExit: () => void;
  onBack: () => void;
  isDirty: boolean;
  showBanner: boolean;
  supportsDeny: boolean;
  stats: BizBackend.BizPermissionStats | null;
  onDeleteConfirmed: () => void;
  locationHash: string;
  navigateTab: (tab: EditTab) => void;
};

function EditView(props: EditViewProps) {
  const { t } = useTranslation();
  const {
    perm, set, saved, saving, saveActions, savePref,
    handleSave, handleSaveAndExit, onBack, isDirty, showBanner,
    supportsDeny, stats, onDeleteConfirmed, locationHash, navigateTab,
  } = props;

  const active = tabFromHash(locationHash);
  const editSavePref: SavePref = savePref === "saveAndAdd" ? "save" : savePref;
  const primary = saveActions[editSavePref];
  const others = (["save", "saveAndExit"] as SavePref[])
    .filter((k) => k !== editSavePref)
    .map((k) => saveActions[k]);

  const tabDefs: { key: EditTab; label: string; icon: React.ReactNode }[] = [
    { key: "overview", label: t("bizPerm.tab.overview") || "概览", icon: <Eye size={14} /> },
    { key: "rules", label: t("bizPerm.tab.rules") || "规则", icon: <Zap size={14} /> },
    { key: "grantees", label: `${t("bizPerm.tab.grantees") || "授权对象"}${stats ? ` (${stats.granteeCount})` : ""}`, icon: <UserPlus size={14} /> },
    { key: "settings", label: t("bizPerm.tab.settings") || "设置", icon: <Archive size={14} /> },
  ];

  const badges = (
    <>
      <EffectBadge effect={perm.effect} />
      <StateBadge state={perm.state} />
      {!perm.isEnabled && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
          <AlertTriangle size={10} />
          {t("bizPerm.statusDisabled") || "已禁用"}
        </span>
      )}
    </>
  );

  const statusSlot = (
    <div className="flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-1 px-2.5 py-1.5">
      <span className="text-[11px] font-medium text-text-muted">
        {t("field.isEnabled") || "启用"}
      </span>
      <Switch checked={perm.isEnabled} onChange={(v) => set("isEnabled", v)} />
    </div>
  );

  const statPills = stats
    ? [
        { key: "g", icon: <UserPlus size={12} />, label: t("bizPerm.tab.grantees") || "授权", value: stats.granteeCount, onClick: () => navigateTab("grantees") },
        { key: "r", icon: <Target size={12} />, label: t("bizPerm.stat.resources") || "资源", value: stats.resourceCount, onClick: () => navigateTab("rules") },
        { key: "a", icon: <Zap size={12} />, label: t("bizPerm.stat.actions") || "动作", value: stats.actionCount, onClick: () => navigateTab("rules") },
      ]
    : [];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <EntityHeader
        icon={<Key size={20} />}
        title={perm.displayName || perm.name}
        subtitle={perm.name}
        badges={badges}
        stats={statPills}
        statusSlot={statusSlot}
        onBack={onBack}
        actions={
          <SplitButton saving={saving} saved={saved} primary={primary} actions={others} />
        }
        tabs={<TabBar tabs={tabDefs} active={active} onChange={(k) => navigateTab(k as EditTab)} />}
      />

      {showBanner && <UnsavedBanner isAddMode={false} />}

      {active === "overview" && (
        <OverviewPanel
          perm={perm}
          stats={stats}
          onEdit={() => navigateTab("settings")}
          isDirty={isDirty}
        />
      )}
      {active === "rules" && (
        <RulesEditor perm={perm} set={set} supportsDeny={supportsDeny} />
      )}
      {active === "grantees" && perm.id && (
        <BizPermissionGranteeTable permissionId={perm.id} organization={perm.owner} appName={perm.appName} />
      )}
      {active === "settings" && (
        <SettingsPanel
          perm={perm}
          set={set}
          saving={saving}
          saved={saved}
          onSave={handleSave}
          onSaveAndExit={handleSaveAndExit}
          onDeleteConfirmed={onDeleteConfirmed}
        />
      )}
    </motion.div>
  );
}

// ── Overview panel ────────────────────────────────────────────────────

function OverviewPanel({
  perm, stats, onEdit, isDirty,
}: {
  perm: BizPermission;
  stats: BizBackend.BizPermissionStats | null;
  onEdit: () => void;
  isDirty: boolean;
}) {
  const { t } = useTranslation();

  const cards = [
    {
      key: "g",
      icon: <UserPlus size={14} />,
      label: t("bizPerm.tab.grantees") || "授权对象",
      value: stats?.granteeCount ?? "—",
      hint: stats ? `${stats.userGranteeCount} ${t("bizRole.member.subjectType.user") || "用户"} · ${stats.groupGranteeCount} ${t("bizRole.member.subjectType.group") || "组"} · ${stats.roleGranteeCount} ${t("bizPerm.subject.role") || "角色"}` : undefined,
    },
    { key: "r", icon: <Target size={14} />, label: t("bizPerm.stat.resources") || "资源", value: stats?.resourceCount ?? perm.resources?.length ?? 0 },
    { key: "a", icon: <Zap size={14} />, label: t("bizPerm.stat.actions") || "动作", value: stats?.actionCount ?? perm.actions?.length ?? 0 },
    { key: "e", icon: <Shield size={14} />, label: t("bizPerm.effect") || "效果", value: perm.effect, tone: (perm.effect === "Deny" ? "accent" : "default") as "default" | "accent" },
  ];

  const summary = describeRule(perm, t);

  return (
    <div className="space-y-6">
      {isDirty && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-[13px] text-amber-700 dark:text-amber-400">
          <AlertTriangle size={16} />
          {t("bizPerm.overview.dirtyHint") || "你有未保存的修改,前往「设置」或「规则」Tab 保存。"}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((c) => (
          <StatCard key={c.key} icon={c.icon} label={c.label} value={c.value} hint={c.hint} tone={c.tone} />
        ))}
      </div>

      <div className="rounded-xl border border-border bg-surface-1">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle bg-surface-2/30">
          <h3 className="text-[13px] font-semibold text-text-primary">
            {t("bizPerm.overview.ruleSummary") || "规则摘要"}
          </h3>
        </div>
        <div className="p-5 space-y-2 text-[13px] leading-relaxed">
          <div className="flex items-start gap-2">
            {perm.effect === "Allow"
              ? <ShieldCheck size={16} className="mt-0.5 text-emerald-500 shrink-0" />
              : <ShieldX size={16} className="mt-0.5 text-red-500 shrink-0" />}
            <span className="text-text-primary">{summary}</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface-1">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle bg-surface-2/30">
          <h3 className="text-[13px] font-semibold text-text-primary">
            {t("bizPerm.section.basic") || "基本信息"}
          </h3>
          <button onClick={onEdit} className="flex items-center gap-1 text-[12px] font-medium text-accent hover:text-accent-hover transition-colors">
            {t("common.edit") || "编辑"}
            <ArrowRight size={12} />
          </button>
        </div>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 p-5 text-[13px]">
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-text-muted">{t("field.displayName") || "显示名称"}</dt>
            <dd className="mt-1 text-text-primary">{perm.displayName || "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-text-muted">{t("field.name") || "名称"}</dt>
            <dd className="mt-1 font-mono text-text-primary">{perm.name}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-text-muted">{t("bizPerm.state.label") || "状态"}</dt>
            <dd className="mt-1"><StateBadge state={perm.state} /></dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-text-muted">{t("bizPerm.overview.createdTime") || "创建时间"}</dt>
            <dd className="mt-1 flex items-center gap-1 text-text-primary">
              <Calendar size={12} className="text-text-muted" />
              {perm.createdTime || "—"}
            </dd>
          </div>
          {perm.description && (
            <div className="md:col-span-2">
              <dt className="text-[11px] font-medium uppercase tracking-wider text-text-muted">{t("field.description") || "描述"}</dt>
              <dd className="mt-1 text-text-primary whitespace-pre-wrap">{perm.description}</dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}

function describeRule(perm: BizPermission, t: (k: string) => string): string {
  const resources = (perm.resources ?? []).filter(Boolean);
  const actions = (perm.actions ?? []).filter(Boolean);
  const verb = perm.effect === "Allow"
    ? (t("bizPerm.desc.allow") || "允许")
    : (t("bizPerm.desc.deny") || "拒绝");
  if (resources.length === 0 || actions.length === 0) {
    return t("bizPerm.desc.incomplete") || "规则未完整配置 — 请在「规则」Tab 填写资源和动作。";
  }
  const r = resources.length <= 3 ? resources.join("、") : `${resources.slice(0, 3).join("、")} 等 ${resources.length} 项`;
  const a = actions.length <= 3 ? actions.join("、") : `${actions.slice(0, 3).join("、")} 等 ${actions.length} 项`;
  return `${verb}对资源 [${r}] 执行动作 [${a}]`;
}

// ── Rules editor (shared between create & edit) ───────────────────────

function RulesEditor({
  perm, set, supportsDeny,
}: {
  perm: BizPermission;
  set: (k: string, v: unknown) => void;
  supportsDeny: boolean;
}) {
  const { t } = useTranslation();
  const [customAction, setCustomAction] = useState("");
  const [newResource, setNewResource] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);

  const applyPicks = (picks: PickedResource[], autoAddMethods: boolean) => {
    const currentRes = new Set(perm.resources ?? []);
    for (const p of picks) currentRes.add(p.resource.pattern);
    set("resources", Array.from(currentRes));

    if (autoAddMethods) {
      const currentAct = new Set(perm.actions ?? []);
      for (const p of picks) for (const m of p.methods) currentAct.add(m);
      set("actions", Array.from(currentAct));
    }
    setPickerOpen(false);
  };

  const addAction = (a: string) => {
    const v = a.trim();
    if (!v) return;
    const current = perm.actions ?? [];
    if (current.includes(v)) return;
    set("actions", [...current, v]);
  };
  const removeAction = (a: string) =>
    set("actions", (perm.actions ?? []).filter((x) => x !== a));

  const addResource = (r: string) => {
    const v = r.trim();
    if (!v) return;
    const current = perm.resources ?? [];
    if (current.includes(v)) return;
    set("resources", [...current, v]);
  };
  const updateResource = (idx: number, v: string) => {
    const next = [...(perm.resources ?? [])];
    next[idx] = v;
    set("resources", next);
  };
  const removeResource = (idx: number) =>
    set("resources", (perm.resources ?? []).filter((_, i) => i !== idx));

  return (
    <div className="space-y-6">
      {perm.id !== undefined && perm.id !== 0 && (
        <div className="flex items-center justify-end">
          <button
            onClick={() => setTestOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors"
          >
            <FlaskConical size={13} /> {t("bizPerm.testMatch.open") || "测试匹配"}
          </button>
        </div>
      )}

      {testOpen && perm.id && (
        <TestMatchModal permissionId={perm.id} onClose={() => setTestOpen(false)} />
      )}

      <FormSection title={t("bizPerm.section.effect") || "效果"}>
        <div className="col-span-2 space-y-3">
          {!supportsDeny && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-400">
              <Info size={14} className="mt-0.5 shrink-0" />
              <span>
                {t("bizPerm.denyUnsupportedHint") || "当前应用的 Casbin 模型不支持 Deny — 需在模型的 policy_effect 中加入 p.eft == deny 才能生效。"}
              </span>
            </div>
          )}
          <div className="flex rounded-lg bg-surface-2 p-0.5 gap-0.5">
            <button
              onClick={() => set("effect", "Allow")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 px-4 rounded-md text-[14px] font-semibold transition-all ${
                perm.effect === "Allow" ? "bg-success text-white shadow-sm" : "text-text-muted hover:text-text-secondary"
              }`}
            >
              <ShieldCheck size={16} />
              {t("bizPerm.effectAllow") || "Allow"}
            </button>
            <button
              onClick={() => { if (supportsDeny) set("effect", "Deny"); }}
              disabled={!supportsDeny}
              title={supportsDeny ? undefined : (t("bizPerm.denyUnsupportedHint") || "不支持 Deny")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 px-4 rounded-md text-[14px] font-semibold transition-all ${
                perm.effect === "Deny" && supportsDeny ? "bg-danger text-white shadow-sm" :
                !supportsDeny ? "text-text-muted/50 cursor-not-allowed" :
                "text-text-muted hover:text-text-secondary"
              }`}
            >
              <ShieldX size={16} />
              {t("bizPerm.effectDeny") || "Deny"}
            </button>
          </div>
        </div>
      </FormSection>

      <FormSection
        title={`${t("bizPerm.resources") || "资源"} (${(perm.resources ?? []).length})`}
        action={
          <button
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors"
          >
            <Plus size={12} /> {t("bizPerm.resource.pickFromCatalog") || "从目录选择"}
          </button>
        }
      >
        <div className="col-span-2 space-y-2">
          {(perm.resources ?? []).length === 0 ? (
            <div className="py-4 text-center text-[13px] text-text-muted border border-dashed border-border rounded-lg">
              {t("bizPerm.resource.empty") || "暂无资源 — 添加下方的匹配模式"}
            </div>
          ) : (
            <div className="space-y-2">
              {(perm.resources ?? []).map((r, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="shrink-0 w-6 text-[11px] text-text-muted font-mono text-right">{idx + 1}</span>
                  <input
                    className={monoInputClass}
                    value={r}
                    onChange={(e) => updateResource(idx, e.target.value)}
                    placeholder="/api/orders/:id"
                  />
                  <button
                    onClick={() => removeResource(idx)}
                    className="shrink-0 rounded-lg p-1.5 text-text-muted hover:bg-danger/10 hover:text-danger transition-colors"
                    aria-label={t("common.delete") || "Remove"}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="shrink-0 w-6" />
            <input
              className={monoInputClass}
              placeholder={t("bizPerm.resource.addPlaceholder") || "输入资源模式后按 Enter"}
              value={newResource}
              onChange={(e) => setNewResource(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newResource.trim()) {
                  addResource(newResource);
                  setNewResource("");
                }
              }}
            />
            <button
              onClick={() => { if (newResource.trim()) { addResource(newResource); setNewResource(""); } }}
              disabled={!newResource.trim()}
              className="shrink-0 rounded-lg bg-accent px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-accent-hover disabled:opacity-40 transition-colors"
            >
              <Plus size={14} />
            </button>
          </div>
          <p className="flex items-center gap-1 text-[11px] text-text-muted">
            <Info size={12} />
            {t("bizPerm.resourceHint") || "支持 keyMatch / keyMatch2 模式：* 通配、:id 命名参数、{owner} 路径变量。"}
          </p>
        </div>
      </FormSection>

      {pickerOpen && (
        <BizResourcePicker
          owner={perm.owner}
          appName={perm.appName}
          excludePatterns={perm.resources ?? []}
          onClose={() => setPickerOpen(false)}
          onConfirm={applyPicks}
        />
      )}

      <FormSection title={`${t("bizPerm.actions") || "动作"} (${(perm.actions ?? []).length})`}>
        <div className="col-span-2 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {(perm.actions ?? []).map((a) => (
              <span key={a} className="inline-flex items-center gap-1 rounded-md bg-surface-2 border border-border px-2.5 py-1 text-[12px] font-medium font-mono">
                {a}
                <button onClick={() => removeAction(a)} className="text-text-muted hover:text-danger transition-colors"><X size={12} /></button>
              </span>
            ))}
            {(perm.actions?.length ?? 0) === 0 && (
              <span className="text-[13px] text-text-muted">{t("common.noData") || "暂无动作"}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <QuickAction label="GET" onAdd={() => addAction("GET")} />
            <QuickAction label="POST" onAdd={() => addAction("POST")} />
            <QuickAction label="PUT" onAdd={() => addAction("PUT")} />
            <QuickAction label="DELETE" onAdd={() => addAction("DELETE")} />
            <QuickAction label={t("bizPerm.action.readShortcut") || "READ (GET+HEAD)"} onAdd={() => { addAction("GET"); addAction("HEAD"); }} />
            <QuickAction label={t("bizPerm.action.writeShortcut") || "WRITE (POST+PUT+PATCH+DELETE)"} onAdd={() => { addAction("POST"); addAction("PUT"); addAction("PATCH"); addAction("DELETE"); }} />
            <QuickAction label=".*" onAdd={() => addAction(".*")} />
            <input
              className={`${monoInputClass} max-w-[160px]`}
              placeholder={t("bizPerm.customAction") || "自定义…"}
              value={customAction}
              onChange={(e) => setCustomAction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && customAction.trim()) {
                  addAction(customAction.trim());
                  setCustomAction("");
                }
              }}
            />
          </div>
          <p className="flex items-center gap-1 text-[11px] text-text-muted">
            <Info size={12} />
            {t("bizPerm.actionHint") || "动作以正则形式和 request.act 匹配。"}
          </p>
        </div>
      </FormSection>
    </div>
  );
}

function QuickAction({ label, onAdd }: { label: string; onAdd: () => void }) {
  return (
    <button
      onClick={onAdd}
      className="inline-flex items-center gap-1 rounded-md border border-dashed border-accent/60 px-2 py-1 text-[11px] font-medium text-accent hover:bg-accent/10 transition-colors"
    >
      <Plus size={11} /> {label}
    </button>
  );
}

// ── Settings panel ────────────────────────────────────────────────────

function SettingsPanel({
  perm, set, saving, saved, onSave, onSaveAndExit, onDeleteConfirmed,
}: {
  perm: BizPermission;
  set: (k: string, v: unknown) => void;
  saving: boolean;
  saved: boolean;
  onSave: () => void;
  onSaveAndExit: () => void;
  onDeleteConfirmed: () => void;
}) {
  const { t } = useTranslation();
  // Approval block open by default only when not already Approved — the common
  // case (auto-approved on create) stays folded to reduce visual noise.
  const [approvalOpen, setApprovalOpen] = useState(perm.state !== "Approved" && !!perm.state);

  return (
    <div className="space-y-6">
      <FormSection title={t("bizPerm.section.basic") || "基本信息"}>
        <FormField label={t("field.displayName") || "显示名称"}>
          <input className={inputClass} value={perm.displayName} onChange={(e) => set("displayName", e.target.value)} />
        </FormField>
        <FormField
          label={t("field.name") || "名称"}
          help={t("bizPerm.name.hint") || "API 引用标识,创建后不可修改"}
        >
          <input className={monoInputClass} value={perm.name} disabled />
        </FormField>
        <FormField label={t("field.description") || "描述"} span="full">
          <textarea
            className={`${inputClass} min-h-[72px] resize-y`}
            value={perm.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </FormField>
      </FormSection>

      <div className="rounded-xl border border-border bg-surface-1 overflow-hidden">
        <button
          onClick={() => setApprovalOpen((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3 border-b border-border-subtle bg-surface-2/30 text-left"
        >
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-semibold text-text-primary">
              {t("bizPerm.section.approval") || "审批流"}
            </h3>
            <StateBadge state={perm.state} />
          </div>
          <ArrowRight size={14} className={`text-text-muted transition-transform ${approvalOpen ? "rotate-90" : ""}`} />
        </button>
        {approvalOpen && (
          <div className="p-5 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-[13px]">
              <ReadOnlyField label={t("bizPerm.approval.submitter") || "提交人"} value={perm.submitter} />
              <ReadOnlyField label={t("bizPerm.approval.approver") || "审批人"} value={perm.approver} />
              <ReadOnlyField label={t("bizPerm.approval.approveTime") || "审批时间"} value={perm.approveTime} />
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wider text-text-muted">
                  {t("bizPerm.approval.state") || "状态"}
                </label>
                <select
                  className={`${inputClass} mt-1`}
                  value={perm.state || "Approved"}
                  onChange={(e) => set("state", e.target.value)}
                >
                  <option value="Approved">{t("bizPerm.state.approved") || "已批准"}</option>
                  <option value="Pending">{t("bizPerm.state.pending") || "待审批"}</option>
                  <option value="Rejected">{t("bizPerm.state.rejected") || "已驳回"}</option>
                </select>
              </div>
            </div>
            {perm.state === "Pending" && (
              <div className="flex items-center gap-2 pt-2 border-t border-border-subtle">
                <button
                  onClick={() => set("state", "Approved")}
                  className="flex items-center gap-1 rounded-lg bg-success px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90 transition-opacity"
                >
                  <Check size={12} /> {t("bizPerm.approval.approve") || "批准"}
                </button>
                <button
                  onClick={() => set("state", "Rejected")}
                  className="flex items-center gap-1 rounded-lg border border-danger px-3 py-1.5 text-[12px] font-semibold text-danger hover:bg-danger/10 transition-colors"
                >
                  <X size={12} /> {t("bizPerm.approval.reject") || "驳回"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <SaveButton onClick={onSave} saving={saving} saved={saved} label={t("common.save") || "保存"} />
        <button
          onClick={onSaveAndExit}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          <LogOut size={14} />
          {t("common.saveAndExit") || "保存并退出"}
        </button>
      </div>

      <DangerZone
        title={t("bizPerm.danger.deleteTitle") || "删除此权限"}
        description={t("bizPerm.danger.deleteHint") || "删除后所有授权对象的绑定会自动解除。此操作不可撤销。"}
        confirmTarget={perm.displayName || perm.name}
        deleteLabel={t("bizPerm.danger.deleteBtn") || "删除权限"}
        onDelete={onDeleteConfirmed}
      />
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wider text-text-muted">{label}</dt>
      <dd className="mt-1 text-[13px] text-text-primary">{value || "—"}</dd>
    </div>
  );
}

// ── Badges ────────────────────────────────────────────────────────────

function EffectBadge({ effect }: { effect: "Allow" | "Deny" }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${
      effect === "Allow" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 text-red-600 dark:text-red-400"
    }`}>
      {effect === "Allow" ? <ShieldCheck size={10} /> : <ShieldX size={10} />}
      {effect}
    </span>
  );
}

function TestMatchModal({ permissionId, onClose }: { permissionId: number; onClose: () => void }) {
  const { t } = useTranslation();
  const [method, setMethod] = useState("GET");
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<BizBackend.BizPermissionMatchResult | null>(null);

  const run = useMutation({
    mutationFn: () => BizBackend.testBizPermissionMatch({ permissionId, testMethod: method, testUrl: url }),
    onSuccess: (res) => {
      if (res.status === "ok" && res.data) setResult(res.data);
    },
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative z-10 w-full max-w-xl rounded-xl border border-border bg-surface-1 shadow-[var(--shadow-elevated)]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-[15px] font-semibold">{t("bizPerm.testMatch.title") || "测试匹配"}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <select className={`${inputClass} max-w-[130px]`} value={method} onChange={(e) => setMethod(e.target.value)}>
              {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <input
              className={monoInputClass}
              placeholder="/api/orders/1234"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && url.trim()) run.mutate();
              }}
            />
            <button
              onClick={() => run.mutate()}
              disabled={!url.trim() || run.isPending}
              className="shrink-0 rounded-lg bg-accent px-3 py-2 text-[12px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {run.isPending ? (t("common.testing") || "测试中…") : (t("bizPerm.testMatch.run") || "测试")}
            </button>
          </div>

          {result && (
            <div className="space-y-3">
              <div className={`rounded-lg border p-3 ${
                result.match
                  ? (result.effect === "Allow" ? "border-success/40 bg-success/5" : "border-danger/40 bg-danger/5")
                  : "border-border bg-surface-2/50"
              }`}>
                <div className="flex items-center gap-2 text-[13px] font-semibold">
                  {result.match && result.effect === "Allow" && <ShieldCheck size={14} className="text-success" />}
                  {result.match && result.effect === "Deny" && <ShieldX size={14} className="text-danger" />}
                  {!result.match && <AlertTriangle size={14} className="text-text-muted" />}
                  {result.match
                    ? (result.effect === "Allow"
                        ? (t("bizPerm.testMatch.matchAllow") || "✅ 命中 — 此请求被【允许】")
                        : (t("bizPerm.testMatch.matchDeny") || "⛔ 命中 — 此请求被【拒绝】"))
                    : (t("bizPerm.testMatch.noMatch") || "未命中")}
                </div>
                <div className="mt-1 text-[12px] text-text-secondary">{result.reason}</div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-[12px]">
                <div>
                  <div className="text-[11px] font-medium text-text-muted uppercase tracking-wider mb-1">
                    {t("bizPerm.testMatch.resourceChecks") || "资源检查"}
                  </div>
                  <div className="space-y-1 font-mono">
                    {result.resourceChecks.map((c, i) => (
                      <div key={i} className={c.includes("✓") ? "text-success" : "text-text-muted"}>{c}</div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-medium text-text-muted uppercase tracking-wider mb-1">
                    {t("bizPerm.testMatch.actionChecks") || "动作检查"}
                  </div>
                  <div className="space-y-1 font-mono">
                    {result.actionChecks.map((c, i) => (
                      <div key={i} className={c.includes("✓") ? "text-success" : "text-text-muted"}>{c}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function StateBadge({ state }: { state?: string }) {
  const { t } = useTranslation();
  if (!state || state === "Approved") {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
        {t("bizPerm.state.approved") || "已批准"}
      </span>
    );
  }
  if (state === "Pending") {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
        {t("bizPerm.state.pending") || "待审批"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-600 dark:text-red-400">
      {t("bizPerm.state.rejected") || "已驳回"}
    </span>
  );
}
