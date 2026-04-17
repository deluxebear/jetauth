import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertTriangle, Archive, ArrowRight, Calendar, Code, Eye, GitBranch,
  Info, Key, LogOut, Plus, Save, Shield,
  Trash2, Users, X,
} from "lucide-react";

import { bizKeys } from "../backend/bizQueryKeys";
import * as BizBackend from "../backend/BizBackend";
import type { BizRole, BizRoleScopeKind } from "../backend/BizBackend";

import EntityHeader from "../components/EntityHeader";
import SplitButton, { type SplitButtonAction } from "../components/SplitButton";
import StatCard from "../components/StatCard";
import StickyEditHeader from "../components/StickyEditHeader";
import SaveButton from "../components/SaveButton";
import UnsavedBanner from "../components/UnsavedBanner";
import { FormField, FormSection, inputClass, monoInputClass, Switch } from "../components/FormSection";
import { TabBar } from "../components/Tabs";
import DangerZone from "../components/DangerZone";
import BizRoleMemberTable from "../components/BizRoleMemberTable";
import BizRoleInheritancePicker from "../components/BizRoleInheritancePicker";
import BizRolePermissionBinder from "../components/BizRolePermissionBinder";
import { useModal } from "../components/Modal";
import { useTranslation } from "../i18n";
import { friendlyError } from "../utils/errorHelper";

// ── Helpers ────────────────────────────────────────────────────────────

type SavePref = "save" | "saveAndAdd" | "saveAndExit";
const SAVE_PREF_KEY = "jetauth.bizRole.saveAction";

function readSavePref(): SavePref {
  try {
    const v = localStorage.getItem(SAVE_PREF_KEY);
    if (v === "save" || v === "saveAndAdd" || v === "saveAndExit") return v;
  } catch { /* ignore storage errors */ }
  return "saveAndExit";
}

function writeSavePref(v: SavePref) {
  try { localStorage.setItem(SAVE_PREF_KEY, v); } catch { /* ignore */ }
}

type EditTab = "overview" | "members" | "permissions" | "inheritance" | "settings";
const DEFAULT_TAB: EditTab = "overview";
const VALID_TABS: EditTab[] = ["overview", "members", "permissions", "inheritance", "settings"];

function tabFromHash(hash: string): EditTab {
  const h = hash.replace(/^#/, "");
  return (VALID_TABS as string[]).includes(h) ? (h as EditTab) : DEFAULT_TAB;
}

// ── Main page ─────────────────────────────────────────────────────────

export default function BizRoleEditPage() {
  const { owner, appName, name } = useParams<{ owner: string; appName: string; name: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isNew = !name || name === "new";
  const forcedAddMode = (location.state as { mode?: string } | null)?.mode === "add";
  const isAddMode = isNew || forcedAddMode;
  const { t } = useTranslation();
  const modal = useModal();
  const queryClient = useQueryClient();

  const rolesQuery = useQuery({
    enabled: !!owner && !!appName,
    queryKey: bizKeys.roles(owner, appName),
    staleTime: 30_000,
    queryFn: async () => {
      const res = await BizBackend.getBizRoles(owner!, appName!);
      return res.status === "ok" && res.data ? res.data : [];
    },
  });

  const [role, setRole] = useState<BizRole | null>(null);
  const [originalJson, setOriginalJson] = useState("");
  const [saved, setSaved] = useState(false);

  const [propsMode, setPropsMode] = useState<"visual" | "json">("visual");
  const [propsEntries, setPropsEntries] = useState<{ key: string; value: string }[]>([]);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 1500);
    return () => clearTimeout(timer);
  }, [saved]);

  const initPropsEntries = (props: string) => {
    if (!props) { setPropsEntries([]); return; }
    try {
      const obj = JSON.parse(props);
      if (typeof obj === "object" && obj !== null && !Array.isArray(obj)) {
        setPropsEntries(Object.entries(obj).map(([k, v]) => ({ key: k, value: typeof v === "string" ? v : JSON.stringify(v) })));
      } else {
        setPropsMode("json");
      }
    } catch {
      setPropsMode("json");
    }
  };

  useEffect(() => {
    if (role || !owner || !appName) return;
    if (isNew) {
      const r = BizBackend.newBizRole(owner, appName);
      setRole(r);
      setOriginalJson(JSON.stringify(r));
      setPropsEntries([]);
      return;
    }
    if (rolesQuery.isLoading) return;
    const list = rolesQuery.data ?? [];
    const found = list.find((r) => r.name === name);
    if (found) {
      setRole(found);
      setOriginalJson(JSON.stringify(found));
      initPropsEntries(found.properties);
    } else if (rolesQuery.isSuccess) {
      modal.toast((t("bizRole.notFound") || "Role not found: {name}").replace("{name}", name || ""), "error");
    }
  }, [role, rolesQuery.data, rolesQuery.isLoading, rolesQuery.isSuccess, isNew, owner, appName, name, modal, t]);

  const allAppRoles = rolesQuery.data ?? [];

  const statsQuery = useQuery({
    enabled: !!role?.id && !isAddMode,
    queryKey: bizKeys.roleStats(role?.id),
    staleTime: 30_000,
    queryFn: async () => {
      const res = await BizBackend.getBizRoleStats(role!.id!);
      return res.status === "ok" && res.data ? res.data : null;
    },
  });
  const stats = statsQuery.data ?? null;

  const childrenQuery = useQuery({
    enabled: !!role?.id,
    queryKey: bizKeys.roleChildren(role?.id),
    queryFn: async () => {
      const res = await BizBackend.listRoleChildren(role!.id!);
      return res.status === "ok" && res.data ? res.data : [];
    },
  });
  const children = childrenQuery.data ?? [];

  const loading = !role && (rolesQuery.isLoading || (!isNew && rolesQuery.isPending));
  const isDirty = useMemo(
    () => !!role && originalJson !== "" && JSON.stringify(role) !== originalJson,
    [role, originalJson],
  );

  const backPath = `/authorization/${owner}/${appName}?tab=roles`;
  const editBase = `/authorization/${owner}/${appName}`;

  const invalidateRoles = () => {
    queryClient.invalidateQueries({ queryKey: bizKeys.roles(owner, appName) });
    queryClient.invalidateQueries({ queryKey: bizKeys.app(owner, appName) });
    if (role?.id) {
      queryClient.invalidateQueries({ queryKey: bizKeys.roleStats(role.id) });
    }
  };

  const saveMutation = useMutation({
    mutationFn: (toSave: BizRole) =>
      isAddMode && isNew
        ? BizBackend.addBizRole(toSave)
        : BizBackend.updateBizRole(role!.id!, toSave),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => BizBackend.deleteBizRole(id),
    onSuccess: (res) => {
      if (res.status === "ok") {
        invalidateRoles();
        navigate(backPath);
      } else {
        modal.toast(friendlyError(res.msg, t) || res.msg, "error");
      }
    },
    onError: (err: Error) => modal.toast(err.message || t("common.error"), "error"),
  });

  const saving = saveMutation.isPending;
  const showBanner = !isAddMode && isDirty;

  const prepareRoleForSave = (r: BizRole): BizRole => {
    if (propsMode === "visual") {
      const cleaned = propsEntries.filter((e) => e.key.trim() !== "");
      setPropsEntries(cleaned);
      const obj: Record<string, unknown> = {};
      for (const e of cleaned) {
        try { obj[e.key] = JSON.parse(e.value); } catch { obj[e.key] = e.value; }
      }
      const props = Object.keys(obj).length > 0 ? JSON.stringify(obj, null, 2) : "";
      return { ...r, properties: props };
    }
    return r;
  };

  const doSave = async (): Promise<{ ok: boolean; saved: BizRole } | null> => {
    if (!role) return null;
    const toSave = prepareRoleForSave(role);
    setRole(toSave);
    try {
      const res = await saveMutation.mutateAsync(toSave);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess") || "Saved");
        setSaved(true);
        setOriginalJson(JSON.stringify(toSave));
        invalidateRoles();
        return { ok: true, saved: toSave };
      }
      modal.toast(friendlyError(res.msg, t) || res.msg, "error");
      return { ok: false, saved: toSave };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t("common.saveFailed") || "Save failed";
      modal.toast(msg, "error");
      return { ok: false, saved: toSave };
    }
  };

  const handleSave = async () => {
    writeSavePref("save");
    const r = await doSave();
    if (r?.ok && isAddMode && isNew) {
      navigate(`${editBase}/roles/${r.saved.name}`, { replace: true });
    }
  };

  const handleSaveAndExit = async () => {
    writeSavePref("saveAndExit");
    const r = await doSave();
    if (r?.ok) navigate(backPath);
  };

  const handleSaveAndAdd = async () => {
    writeSavePref("saveAndAdd");
    if (!owner || !appName || !role) return;
    const r = await doSave();
    if (!r?.ok) return;
    // Reset to fresh new-role form, preserving scope (batch creates usually
    // stay within the same scope).
    const fresh = BizBackend.newBizRole(owner, appName);
    fresh.scopeKind = role.scopeKind;
    if (fresh.scopeKind === "org") fresh.appName = "";
    setRole(fresh);
    setOriginalJson(JSON.stringify(fresh));
    setPropsEntries([]);
    setPropsMode("visual");
    navigate(`${editBase}/roles/new`, { replace: true });
  };

  const handleBack = () => navigate(backPath);

  if (loading || !role) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  const set = (key: string, val: unknown) => {
    setRole((prev) => prev ? { ...prev, [key]: val } : prev);
  };

  const setScope = (kind: BizRoleScopeKind) => {
    setRole((prev) => {
      if (!prev) return prev;
      if (kind === "org") return { ...prev, scopeKind: kind, appName: "" };
      return { ...prev, scopeKind: kind, appName: appName! };
    });
  };

  const saveActions: Record<SavePref, SplitButtonAction> = {
    save: {
      key: "save",
      label: t("common.save") || "保存",
      icon: <Save size={14} />,
      description: t("bizRole.save.stayHint") || "保存后继续编辑",
      onSelect: handleSave,
    },
    saveAndAdd: {
      key: "saveAndAdd",
      label: t("bizRole.save.andAdd") || "保存并继续添加",
      icon: <Plus size={14} />,
      description: t("bizRole.save.andAddHint") || "保存后清空表单，继续新建角色",
      onSelect: handleSaveAndAdd,
    },
    saveAndExit: {
      key: "saveAndExit",
      label: t("common.saveAndExit") || "保存并退出",
      icon: <LogOut size={14} />,
      description: t("bizRole.save.andExitHint") || "保存后返回列表",
      onSelect: handleSaveAndExit,
    },
  };

  const savePref = readSavePref();

  if (isAddMode && isNew) {
    return (
      <CreateView
        role={role}
        set={set}
        setScope={setScope}
        appName={appName!}
        saving={saving}
        saved={saved}
        savePref={savePref}
        saveActions={saveActions}
        onBack={handleBack}
        propsMode={propsMode}
        setPropsMode={setPropsMode}
        propsEntries={propsEntries}
        setPropsEntries={setPropsEntries}
        setProperties={(v) => set("properties", v)}
      />
    );
  }

  return (
    <EditView
      role={role}
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
      stats={stats}
      children={children}
      allAppRoles={allAppRoles}
      propsMode={propsMode}
      setPropsMode={setPropsMode}
      propsEntries={propsEntries}
      setPropsEntries={setPropsEntries}
      setProperties={(v) => set("properties", v)}
      onDeleteConfirmed={() => deleteMutation.mutate(role.id!)}
      locationHash={location.hash}
      navigateTab={(tab: EditTab) => navigate(`${location.pathname}${location.search}#${tab}`, { replace: false })}
    />
  );
}

// ── Create view ───────────────────────────────────────────────────────

type CreateViewProps = {
  role: BizRole;
  set: (k: string, v: unknown) => void;
  setScope: (k: BizRoleScopeKind) => void;
  appName: string;
  saving: boolean;
  saved: boolean;
  savePref: SavePref;
  saveActions: Record<SavePref, SplitButtonAction>;
  onBack: () => void;
  propsMode: "visual" | "json";
  setPropsMode: (m: "visual" | "json") => void;
  propsEntries: { key: string; value: string }[];
  setPropsEntries: React.Dispatch<React.SetStateAction<{ key: string; value: string }[]>>;
  setProperties: (v: string) => void;
};

function CreateView(props: CreateViewProps) {
  const { t } = useTranslation();
  const { role, set, setScope, appName, saving, saved, savePref, saveActions, onBack } = props;

  const primary = saveActions[savePref];
  const others = (Object.keys(saveActions) as SavePref[])
    .filter((k) => k !== savePref)
    .map((k) => saveActions[k]);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <StickyEditHeader
        title={`${t("common.add") || "新建"} ${t("bizRole.editTitle") || "业务角色"}`}
        subtitle={appName}
        onBack={onBack}
      >
        <SplitButton
          saving={saving}
          saved={saved}
          primary={primary}
          actions={others}
        />
      </StickyEditHeader>

      <FormSection title={t("bizRole.section.basic") || "基本信息"}>
        <FormField label={t("field.displayName") || "显示名称"}>
          <input
            className={inputClass}
            value={role.displayName}
            onChange={(e) => set("displayName", e.target.value)}
            autoFocus
          />
        </FormField>
        <FormField
          label={t("field.name") || "名称"}
          help={t("bizRole.name.hint") || "API 引用标识，创建后不可修改"}
        >
          <input
            className={monoInputClass}
            value={role.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="admin"
          />
        </FormField>
        <FormField label={t("field.description") || "描述"} span="full">
          <textarea
            className={`${inputClass} min-h-[72px] resize-y`}
            value={role.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </FormField>

        <FormField label={t("bizRole.scope.label") || "作用域"} span="full">
          <div className="space-y-2">
            <ScopeRadio
              checked={role.scopeKind === "app"}
              onSelect={() => setScope("app")}
              title={t("bizRole.scope.appTitle") || "仅本应用"}
              hint={t("bizRole.scope.appHint") || "仅在当前应用内可见和使用。"}
              appName={appName}
            />
            <ScopeRadio
              checked={role.scopeKind === "org"}
              onSelect={() => setScope("org")}
              title={t("bizRole.scope.orgTitle") || "组织共享"}
              hint={t("bizRole.scope.orgHint") || "授予任何引用此角色的应用。"}
            />
          </div>
          <p className="mt-2 flex items-center gap-1 text-[11px] text-text-muted">
            <Info size={12} />
            {t("bizRole.scope.immutable") || "作用域在创建后无法修改。"}
          </p>
        </FormField>

        <FormField label={t("field.isEnabled") || "是否启用"} span="full">
          <div className="flex items-center justify-between">
            <p className="text-[12px] text-text-muted">
              {t("bizRole.enabledHelp") || "禁用后该角色在鉴权时不会被评估"}
            </p>
            <Switch checked={role.isEnabled} onChange={(v) => set("isEnabled", v)} />
          </div>
        </FormField>
      </FormSection>

      <PropertiesEditor
        value={role.properties}
        mode={props.propsMode}
        setMode={props.setPropsMode}
        entries={props.propsEntries}
        setEntries={props.setPropsEntries}
        onChangeRaw={props.setProperties}
      />
    </motion.div>
  );
}

// ── Edit view ─────────────────────────────────────────────────────────

type EditViewProps = {
  role: BizRole;
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
  stats: BizBackend.BizRoleStats | null;
  children: BizRole[];
  allAppRoles: BizRole[];
  propsMode: "visual" | "json";
  setPropsMode: (m: "visual" | "json") => void;
  propsEntries: { key: string; value: string }[];
  setPropsEntries: React.Dispatch<React.SetStateAction<{ key: string; value: string }[]>>;
  setProperties: (v: string) => void;
  onDeleteConfirmed: () => void;
  locationHash: string;
  navigateTab: (tab: EditTab) => void;
};

function EditView(props: EditViewProps) {
  const { t } = useTranslation();
  const {
    role, set, saved, saving, saveActions, savePref,
    handleSave, handleSaveAndExit, onBack, isDirty, showBanner,
    stats, children, allAppRoles,
    onDeleteConfirmed, locationHash, navigateTab,
  } = props;

  const active = tabFromHash(locationHash);
  const editSavePref: SavePref = savePref === "saveAndAdd" ? "save" : savePref;
  const primary = saveActions[editSavePref];
  const others = (["save", "saveAndExit"] as SavePref[])
    .filter((k) => k !== editSavePref)
    .map((k) => saveActions[k]);

  const tabDefs: { key: EditTab; label: string; icon: React.ReactNode }[] = [
    { key: "overview", label: t("bizRole.tab.overview") || "概览", icon: <Eye size={14} /> },
    { key: "members", label: `${t("bizRole.tab.members") || "成员"}${stats ? ` (${stats.memberCount})` : ""}`, icon: <Users size={14} /> },
    { key: "permissions", label: `${t("bizRole.tab.permissions") || "权限"}${stats ? ` (${stats.permissionCount})` : ""}`, icon: <Key size={14} /> },
    { key: "inheritance", label: t("bizRole.tab.inheritance") || "继承关系", icon: <GitBranch size={14} /> },
    { key: "settings", label: t("bizRole.tab.settings") || "设置", icon: <Archive size={14} /> },
  ];

  const badges = (
    <>
      <span className="inline-flex items-center rounded-full border border-border-subtle bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-text-muted">
        {role.scopeKind === "org"
          ? (t("bizRole.scope.org") || "组织共享")
          : (t("bizRole.scope.app") || "本应用")}
      </span>
      {!role.isEnabled && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
          <AlertTriangle size={10} />{t("bizRole.statusDisabled") || "已禁用"}
        </span>
      )}
    </>
  );

  const statusSlot = (
    <div className="flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-1 px-2.5 py-1.5">
      <span className="text-[11px] font-medium text-text-muted">
        {t("field.isEnabled") || "启用"}
      </span>
      <Switch checked={role.isEnabled} onChange={(v) => set("isEnabled", v)} />
    </div>
  );

  const statPills = stats
    ? [
        { key: "m", icon: <Users size={12} />, label: t("bizRole.tab.members") || "成员", value: stats.memberCount, onClick: () => navigateTab("members") },
        { key: "p", icon: <Key size={12} />, label: t("bizRole.tab.permissions") || "权限", value: stats.permissionCount, onClick: () => navigateTab("permissions") },
        { key: "i", icon: <GitBranch size={12} />, label: t("bizRole.tab.parents") || "父", value: stats.parentRoleCount, onClick: () => navigateTab("inheritance") },
        { key: "c", icon: <ArrowRight size={12} />, label: t("bizRole.tab.children") || "子", value: stats.childRoleCount, onClick: () => navigateTab("inheritance") },
      ]
    : [];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <EntityHeader
        icon={<Shield size={20} />}
        title={role.displayName || role.name}
        subtitle={role.name}
        badges={badges}
        stats={statPills}
        statusSlot={statusSlot}
        onBack={onBack}
        actions={
          <SplitButton
            saving={saving}
            saved={saved}
            primary={primary}
            actions={others}
          />
        }
        tabs={<TabBar tabs={tabDefs} active={active} onChange={(k) => navigateTab(k as EditTab)} />}
      />

      {showBanner && <UnsavedBanner isAddMode={false} />}

      {active === "overview" && (
        <OverviewPanel
          role={role}
          stats={stats}
          onEdit={() => navigateTab("settings")}
          isDirty={isDirty}
        />
      )}
      {active === "members" && role.id && (
        <div className="space-y-4">
          <BizRoleMemberTable roleId={role.id} organization={role.organization} />
        </div>
      )}
      {active === "permissions" && role.id && (
        <BizRolePermissionBinder role={role} />
      )}
      {active === "inheritance" && role.id && (
        <InheritancePanel
          roleId={role.id}
          organization={role.organization}
          candidatePool={allAppRoles}
          childrenList={children}
        />
      )}
      {active === "settings" && (
        <SettingsPanel
          role={role}
          set={set}
          saving={saving}
          saved={saved}
          onSave={handleSave}
          onSaveAndExit={handleSaveAndExit}
          propsMode={props.propsMode}
          setPropsMode={props.setPropsMode}
          propsEntries={props.propsEntries}
          setPropsEntries={props.setPropsEntries}
          setProperties={props.setProperties}
          onDeleteConfirmed={onDeleteConfirmed}
        />
      )}
    </motion.div>
  );
}

// ── Overview panel ─────────────────────────────────────────────────────

function OverviewPanel({
  role, stats, onEdit, isDirty,
}: {
  role: BizRole;
  stats: BizBackend.BizRoleStats | null;
  onEdit: () => void;
  isDirty: boolean;
}) {
  const { t } = useTranslation();

  const cards = [
    { key: "m", icon: <Users size={14} />, label: t("bizRole.tab.members") || "成员", value: stats?.memberCount ?? "—", hint: stats ? `${stats.userMemberCount} ${t("bizRole.member.subjectType.user") || "用户"} · ${stats.groupMemberCount} ${t("bizRole.member.subjectType.group") || "组"}` : undefined },
    { key: "p", icon: <Key size={14} />, label: t("bizRole.tab.permissions") || "权限", value: stats?.permissionCount ?? "—" },
    { key: "i", icon: <GitBranch size={14} />, label: t("bizRole.tab.parents") || "继承自", value: stats?.parentRoleCount ?? "—" },
    { key: "c", icon: <ArrowRight size={14} />, label: t("bizRole.tab.children") || "被继承", value: stats?.childRoleCount ?? "—" },
  ];

  return (
    <div className="space-y-6">
      {isDirty && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-[13px] text-amber-700 dark:text-amber-400">
          <AlertTriangle size={16} />
          {t("bizRole.overview.dirtyHint") || "你在启用开关上有未保存的修改,前往「设置」Tab 保存。"}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((c) => (
          <StatCard key={c.key} icon={c.icon} label={c.label} value={c.value} hint={c.hint} />
        ))}
      </div>

      <div className="rounded-xl border border-border bg-surface-1">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle bg-surface-2/30">
          <h3 className="text-[13px] font-semibold text-text-primary">
            {t("bizRole.section.basic") || "基本信息"}
          </h3>
          <button
            onClick={onEdit}
            className="flex items-center gap-1 text-[12px] font-medium text-accent hover:text-accent-hover transition-colors"
          >
            {t("common.edit") || "编辑"}
            <ArrowRight size={12} />
          </button>
        </div>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 p-5 text-[13px]">
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
              {t("field.displayName") || "显示名称"}
            </dt>
            <dd className="mt-1 text-text-primary">{role.displayName || "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
              {t("field.name") || "名称"}
            </dt>
            <dd className="mt-1 font-mono text-text-primary">{role.name}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
              {t("bizRole.scope.label") || "作用域"}
            </dt>
            <dd className="mt-1 text-text-primary">
              {role.scopeKind === "org"
                ? (t("bizRole.scope.orgTitle") || "组织共享")
                : (t("bizRole.scope.appTitle") || "仅本应用")}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
              {t("bizRole.overview.createdTime") || "创建时间"}
            </dt>
            <dd className="mt-1 flex items-center gap-1 text-text-primary">
              <Calendar size={12} className="text-text-muted" />
              {role.createdTime || "—"}
            </dd>
          </div>
          {role.description && (
            <div className="md:col-span-2">
              <dt className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
                {t("field.description") || "描述"}
              </dt>
              <dd className="mt-1 text-text-primary whitespace-pre-wrap">{role.description}</dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}

// ── Inheritance panel ─────────────────────────────────────────────────

function InheritancePanel({
  roleId, organization, candidatePool, childrenList,
}: {
  roleId: number;
  organization: string;
  candidatePool: BizRole[];
  childrenList: BizRole[];
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-5">
      <BizRoleInheritancePicker
        roleId={roleId}
        organization={organization}
        candidatePool={candidatePool}
      />

      <div className="rounded-xl border border-border bg-surface-1">
        <div className="px-5 py-3 border-b border-border-subtle bg-surface-2/30">
          <h3 className="text-[13px] font-semibold text-text-primary">
            {t("bizRole.inheritedBy.title") || "被继承"}
            <span className="ml-2 text-text-muted font-normal">({childrenList.length})</span>
          </h3>
        </div>
        <div className="p-4">
          {childrenList.length === 0 ? (
            <div className="py-4 text-center text-[13px] text-text-muted">
              {t("bizRole.inheritedBy.empty") || "暂无其他角色继承此角色"}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {childrenList.map((c) => (
                <span key={c.id} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 border border-border px-3 py-1.5 text-[13px]">
                  <Shield size={14} className="text-text-muted" />
                  <span className="font-mono">{c.name}</span>
                  {c.displayName && <span className="text-text-muted text-[11px]">({c.displayName})</span>}
                </span>
              ))}
            </div>
          )}
          <p className="mt-3 flex items-center gap-1 text-[11px] text-text-muted">
            <Info size={12} />
            {t("bizRole.inheritedBy.hint") || "只读。若需修改,请编辑对应的子角色。"}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Settings panel ────────────────────────────────────────────────────

function SettingsPanel({
  role, set, saving, saved, onSave, onSaveAndExit,
  propsMode, setPropsMode, propsEntries, setPropsEntries, setProperties,
  onDeleteConfirmed,
}: {
  role: BizRole;
  set: (k: string, v: unknown) => void;
  saving: boolean;
  saved: boolean;
  onSave: () => void;
  onSaveAndExit: () => void;
  propsMode: "visual" | "json";
  setPropsMode: (m: "visual" | "json") => void;
  propsEntries: { key: string; value: string }[];
  setPropsEntries: React.Dispatch<React.SetStateAction<{ key: string; value: string }[]>>;
  setProperties: (v: string) => void;
  onDeleteConfirmed: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <FormSection title={t("bizRole.section.basic") || "基本信息"}>
        <FormField label={t("field.displayName") || "显示名称"}>
          <input
            className={inputClass}
            value={role.displayName}
            onChange={(e) => set("displayName", e.target.value)}
          />
        </FormField>
        <FormField
          label={t("field.name") || "名称"}
          help={t("bizRole.name.hint") || "API 引用标识,创建后不可修改"}
        >
          <input className={monoInputClass} value={role.name} disabled />
        </FormField>
        <FormField label={t("field.description") || "描述"} span="full">
          <textarea
            className={`${inputClass} min-h-[72px] resize-y`}
            value={role.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </FormField>
        <FormField label={t("bizRole.scope.label") || "作用域"} span="full">
          <div className="rounded-lg border border-border bg-surface-2/30 p-3 text-[13px] text-text-secondary">
            {role.scopeKind === "org"
              ? (t("bizRole.scope.orgTitle") || "组织共享")
              : (t("bizRole.scope.appTitle") || "仅本应用")}
            <span className="ml-2 inline-flex items-center gap-1 rounded bg-surface-1 border border-border-subtle px-1.5 py-0.5 text-[11px] text-text-muted">
              <Info size={10} />
              {t("bizRole.scope.immutable") || "作用域在创建后无法修改。"}
            </span>
          </div>
        </FormField>
      </FormSection>

      <PropertiesEditor
        value={role.properties}
        mode={propsMode}
        setMode={setPropsMode}
        entries={propsEntries}
        setEntries={setPropsEntries}
        onChangeRaw={setProperties}
      />

      <div className="flex items-center gap-3">
        <SaveButton
          onClick={onSave}
          saving={saving}
          saved={saved}
          label={t("common.save") || "保存"}
        />
        <button
          onClick={onSaveAndExit}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          <LogOut size={14} />
          {t("common.saveAndExit") || "保存并退出"}
        </button>
      </div>

      <RoleDangerZone role={role} onDelete={onDeleteConfirmed} />
    </div>
  );
}

// ── Properties editor (shared between create and settings) ────────────

function PropertiesEditor({
  value, mode, setMode, entries, setEntries, onChangeRaw,
}: {
  value: string;
  mode: "visual" | "json";
  setMode: (m: "visual" | "json") => void;
  entries: { key: string; value: string }[];
  setEntries: React.Dispatch<React.SetStateAction<{ key: string; value: string }[]>>;
  onChangeRaw: (v: string) => void;
}) {
  const { t } = useTranslation();
  const modal = useModal();

  const syncToRaw = (next: { key: string; value: string }[]) => {
    const obj: Record<string, unknown> = {};
    for (const e of next) {
      if (!e.key) continue;
      try { obj[e.key] = JSON.parse(e.value); } catch { obj[e.key] = e.value; }
    }
    onChangeRaw(Object.keys(obj).length > 0 ? JSON.stringify(obj, null, 2) : "");
  };
  const addEntry = () => setEntries((prev) => [...prev, { key: "", value: "" }]);
  const updateEntry = (idx: number, field: "key" | "value", v: string) => {
    setEntries((prev) => {
      const next = prev.map((e, i) => i === idx ? { ...e, [field]: v } : e);
      syncToRaw(next);
      return next;
    });
  };
  const removeEntry = (idx: number) => {
    setEntries((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      syncToRaw(next);
      return next;
    });
  };

  return (
    <FormSection
      title={t("bizRole.section.properties") || "自定义属性"}
      action={
        <div className="flex items-center gap-1 rounded-lg bg-surface-2 p-0.5">
          <button
            onClick={() => {
              if (value) {
                try {
                  const obj = JSON.parse(value);
                  if (typeof obj === "object" && obj !== null && !Array.isArray(obj)) {
                    setEntries(Object.entries(obj).map(([k, v]) => ({ key: k, value: typeof v === "string" ? v : JSON.stringify(v) })));
                  }
                } catch {
                  modal.toast(t("bizRole.properties.parseError") || "JSON 格式错误,无法解析", "error");
                  return;
                }
              } else { setEntries([]); }
              setMode("visual");
            }}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${mode === "visual" ? "bg-surface-1 text-text-primary shadow-sm" : "text-text-muted hover:text-text-secondary"}`}
          >
            <Eye size={12} /> {t("bizRole.properties.visual") || "可视化"}
          </button>
          <button
            onClick={() => setMode("json")}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${mode === "json" ? "bg-surface-1 text-text-primary shadow-sm" : "text-text-muted hover:text-text-secondary"}`}
          >
            <Code size={12} /> {t("bizRole.properties.json") || "JSON"}
          </button>
        </div>
      }
    >
      <div className="col-span-2">
        {mode === "visual" ? (
          <div className="space-y-2">
            {entries.length === 0 ? (
              <div className="py-4 text-center text-[13px] text-text-muted">
                {t("bizRole.properties.empty") || "暂无自定义属性"}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_1fr_32px] gap-2 text-[11px] font-medium text-text-muted uppercase tracking-wider px-1">
                  <span>{t("bizRole.properties.key") || "键"}</span>
                  <span>{t("bizRole.properties.value") || "值"}</span>
                  <span />
                </div>
                {entries.map((entry, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_1fr_32px] gap-2 items-center">
                    <input className={monoInputClass} value={entry.key} onChange={(e) => updateEntry(idx, "key", e.target.value)} placeholder="key" />
                    <input className={monoInputClass} value={entry.value} onChange={(e) => updateEntry(idx, "value", e.target.value)} placeholder="value" />
                    <button onClick={() => removeEntry(idx)} className="rounded-lg p-1.5 text-text-muted hover:bg-danger/10 hover:text-danger transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button onClick={addEntry} className="flex items-center gap-1 text-[12px] font-medium text-accent hover:text-accent-hover transition-colors">
              <Plus size={14} /> {t("bizRole.properties.addEntry") || "添加条目"}
            </button>
          </div>
        ) : (
          <textarea
            className={`${monoInputClass} min-h-[120px] resize-y`}
            value={value}
            onChange={(e) => onChangeRaw(e.target.value)}
            placeholder='{"dataScope": {"orders": "department"}}'
          />
        )}
      </div>
    </FormSection>
  );
}

// ── Danger zone ───────────────────────────────────────────────────────

function RoleDangerZone({ role, onDelete }: { role: BizRole; onDelete: () => void }) {
  const { t } = useTranslation();
  return (
    <DangerZone
      title={t("bizRole.danger.deleteTitle") || "删除此角色"}
      description={t("bizRole.danger.deleteHint") || "删除后该角色的所有成员和权限绑定将被移除。若有子角色继承本角色,需先解除继承。此操作不可撤销。"}
      confirmTarget={role.displayName || role.name}
      confirmLabelTemplate={t("bizRole.danger.typeToConfirm") || undefined}
      deleteLabel={t("bizRole.danger.deleteBtn") || "删除角色"}
      onDelete={onDelete}
    />
  );
}

// ── Scope radio ──────────────────────────────────────────────────────

function ScopeRadio({
  checked, onSelect, title, hint, disabled, appName,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  hint: string;
  disabled?: boolean;
  appName?: string;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onSelect}
      disabled={disabled}
      className={`w-full text-left rounded-lg border p-3 transition-colors ${
        checked ? "border-accent bg-accent/5" : "border-border hover:bg-surface-2"
      } ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-1 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${checked ? "border-accent" : "border-border"}`}>
          {checked && <div className="w-2 h-2 rounded-full bg-accent" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-text-primary">
            {title}
            {appName && !title.includes(appName) && (
              <span className="ml-1 font-mono text-text-muted">{appName}</span>
            )}
          </div>
          <div className="text-[12px] text-text-muted mt-0.5">{hint}</div>
        </div>
      </div>
    </button>
  );
}

