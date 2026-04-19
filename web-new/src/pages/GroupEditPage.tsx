import { useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Trash2, LogOut, Pencil, Check } from "lucide-react";
import StickyEditHeader from "../components/StickyEditHeader";
import { FormField, FormSection, Switch, inputClass, monoInputClass } from "../components/FormSection";
import DataTable, { type Column } from "../components/DataTable";
import StatusBadge from "../components/StatusBadge";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import * as GroupBackend from "../backend/GroupBackend";
import type { Group } from "../backend/GroupBackend";
import * as UserBackend from "../backend/UserBackend";
import type { User } from "../backend/UserBackend";
import * as OrgBackend from "../backend/OrganizationBackend";
import { useOrganization } from "../OrganizationContext";
import { friendlyError } from "../utils/errorHelper";
import SimpleSelect from "../components/SimpleSelect";
import SaveButton from "../components/SaveButton";
import UnsavedBanner from "../components/UnsavedBanner";
import { useUnsavedWarning } from "../hooks/useUnsavedWarning";

export default function GroupEditPage() {
  const { owner, name } = useParams<{ owner: string; name: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  // `/groups/:owner/new` = deferred-create draft — no /api/add-group call
  // until Save. Prior behavior pre-created `group_abc123` on every click.
  const isNew = name === "new";
  const [isAddMode, setIsAddMode] = useState(isNew || (location.state as any)?.mode === "add");
  const { t } = useTranslation();
  const modal = useModal();
  const { isGlobalAdmin } = useOrganization();
  const queryClient = useQueryClient();
  const [group, setGroup] = useState<Group | null>(null);
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [organizations, setOrganizations] = useState<{ name: string; displayName: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (saved) { const t = setTimeout(() => setSaved(false), 1500); return () => clearTimeout(t); } }, [saved]);
  const [originalJson, setOriginalJson] = useState("");
  const [groupUsers, setGroupUsers] = useState<User[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [userPage, setUserPage] = useState(1);
  const [userLoading, setUserLoading] = useState(false);
  const userPageSize = 10;

  const invalidateList = () => queryClient.invalidateQueries({ queryKey: ["groups"] });

  // Cmd/Ctrl+S shortcut — add mode triggers save-and-new (batch path),
  // edit mode triggers plain save. The listener is registered before any
  // early returns so hook order stays stable; the ref is re-assigned below
  // (after handlers) on every render where we pass the early return.
  const saveShortcutRef = useRef<() => void>(() => {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveShortcutRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const fetchData = useCallback(async () => {
    if (!owner || !name) return;
    setLoading(true);
    try {
      // In new-draft mode skip /api/get-group (would 404) and seed a local
      // draft instead. We still fetch the parent-group and org lists so the
      // dropdowns work on first render.
      const [groupRes, allGroupsRes, orgRes] = await Promise.all([
        isNew
          ? Promise.resolve({ status: "ok" as const, data: GroupBackend.newGroup(owner) })
          : GroupBackend.getGroup(owner, name),
        GroupBackend.getGroups({ owner }),
        OrgBackend.getOrganizationNames("admin"),
      ]);
      if (groupRes.status === "ok" && groupRes.data) {
        setGroup(groupRes.data);
        setOriginalJson(JSON.stringify(groupRes.data));
      } else {
        modal.showError((groupRes as any).msg || t("groups.error.loadFailed" as any));
        navigate("/groups");
        return;
      }
      if (allGroupsRes.status === "ok") {
        setAllGroups(Array.isArray(allGroupsRes.data) ? allGroupsRes.data : []);
      }
      if (orgRes.status === "ok") {
        setOrganizations(Array.isArray(orgRes.data) ? orgRes.data : []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [owner, name, navigate, isNew]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchGroupUsers = useCallback(async () => {
    if (!owner || !name || isNew) return; // no users on a draft
    setUserLoading(true);
    try {
      // First try paginated, fall back to group.users if empty
      const res = await UserBackend.getUsers({ owner, groupName: name, p: userPage, pageSize: userPageSize });
      if (res.status === "ok") {
        const users = res.data ?? [];
        const total = (res.data2 as number) ?? users.length;
        setGroupUsers(users);
        setUserTotal(total);
      }
    } catch (e: any) { modal.toast(e?.message || t("common.saveFailed" as any), "error"); }
    finally { setUserLoading(false); }
  }, [owner, name, userPage, isNew]);

  useEffect(() => { fetchGroupUsers(); }, [fetchGroupUsers]);

  const isDirty = !!group && originalJson !== "" && JSON.stringify(group) !== originalJson;
  const showBanner = useUnsavedWarning({ isAddMode, isDirty });

  if (loading || !group) {
    return <div className="flex items-center justify-center py-24"><div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" /></div>;
  }

  const set = <K extends keyof Group>(key: K, val: Group[K]) =>
    setGroup((prev) => prev ? { ...prev, [key]: val } : prev);

  /** Persist the group. In add mode calls /api/add-group; in edit mode
   *  calls /api/update-group. Returns true on success. */
  const saveGroup = async (): Promise<boolean> => {
    const payload = { ...group, isTopGroup: group.parentId === owner };
    const res = isAddMode
      ? await GroupBackend.addGroup(payload)
      : await GroupBackend.updateGroup(owner!, name!, payload);
    if (res.status !== "ok") {
      modal.toast(friendlyError(res.msg, t) || t("common.saveFailed" as any), "error");
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const ok = await saveGroup();
      if (!ok) return;
      modal.toast(t("common.saveSuccess" as any));
      setSaved(true);
      setOriginalJson(JSON.stringify(group));
      setIsAddMode(false);
      invalidateList();
      // After first-save in add mode, leave /new so subsequent saves are
      // updates and the URL reflects the real group.
      if (isNew || group.name !== name) {
        navigate(`/groups/${group.owner}/${group.name}`, { replace: true });
      }
    } catch (e: any) {
      modal.toast(e.message || t("common.saveFailed" as any), "error");
    } finally {
      setSaving(false);
    }
  };

  /** Save the current draft, then reset the form to a fresh draft and stay
   *  on /new for bulk onboarding. */
  const handleSaveAndNew = async () => {
    setSaving(true);
    try {
      const ok = await saveGroup();
      if (!ok) return;
      modal.toast(t("groups.savedAndReady" as any));
      invalidateList();
      const nextDraft = GroupBackend.newGroup(owner!);
      setGroup(nextDraft);
      setOriginalJson(JSON.stringify(nextDraft));
      setIsAddMode(true);
      if (!isNew) navigate(`/groups/${owner}/new`, { replace: true, state: { mode: "add" } });
    } catch (e: any) {
      modal.toast(e?.message || t("common.saveFailed" as any), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndExit = async () => {
    setSaving(true);
    try {
      const ok = await saveGroup();
      if (!ok) return;
      modal.toast(t("common.saveSuccess" as any));
      invalidateList();
      navigate("/groups");
    } catch (e: any) {
      modal.toast(e?.message || t("common.saveFailed" as any), "error");
    } finally {
      setSaving(false);
    }
  };

  // Deferred-create: no pre-created row to clean up on back.
  const handleBack = () => {
    navigate("/groups");
  };

  // Plain assignment (not a hook) — refreshes the shortcut target every
  // render where we've passed the early-return guard above.
  saveShortcutRef.current = () => {
    if (saving) return;
    if (isAddMode) handleSaveAndNew();
    else handleSave();
  };

  const handleDelete = async () => {
    if (group.haveChildren) {
      modal.showError(t("groups.error.hasSubGroups" as any));
      return;
    }
    if ((group.users ?? []).length > 0) {
      modal.showError(t("groups.error.hasUsers" as any));
      return;
    }
    modal.showConfirm(`${t("common.confirmDelete")} [${group.displayName || group.name}]`, async () => {
    try {
      const res = await GroupBackend.deleteGroup(group);
      if (res.status === "ok") {
        invalidateList();
        navigate("/groups");
      } else {
        modal.showError(res.msg || "Failed to delete");
      }
    } catch (e: any) {
      modal.toast(e?.message || t("common.saveFailed" as any), "error");
    }
    });
  };

  // Parent group options: all groups in this org (except self) + the org itself as root
  const userColumns: Column<User>[] = [
    {
      key: "name",
      title: t("col.name" as any),
      width: "120px",
      render: (_, r) => (
        <Link to={`/users/${r.owner}/${r.name}`} className="font-mono font-medium text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
          {r.name}
        </Link>
      ),
    },
    { key: "displayName", title: t("col.displayName" as any) },
    { key: "email", title: t("col.email" as any), render: (_, r) => <span className="text-[12px] text-text-secondary">{r.email || "—"}</span> },
    { key: "phone", title: t("col.phone" as any), render: (_, r) => <span className="text-[12px] text-text-secondary">{r.phone || "—"}</span> },
    {
      key: "isAdmin",
      title: t("col.isAdmin" as any),
      width: "80px",
      render: (_, r) => <StatusBadge status={r.isAdmin ? "active" : "inactive"} label={r.isAdmin ? "ON" : "OFF"} />,
    },
    {
      key: "__actions",
      title: t("common.action" as any),
      width: "80px",
      render: (_, r) => (
        <div className="flex items-center gap-1">
          <Link to={`/users/${r.owner}/${r.name}`} className="rounded-lg p-1.5 text-text-muted hover:text-warning hover:bg-warning/10 transition-colors" onClick={(e) => e.stopPropagation()}>
            <Pencil size={14} />
          </Link>
        </div>
      ),
    },
  ];

  const parentOptions = [
    { value: owner!, label: `${owner} (Organization)` },
    ...allGroups
      .filter((g) => g.name !== name)
      .map((g) => ({ value: g.name, label: g.displayName || g.name })),
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5 ">
      <StickyEditHeader
        title={`${isAddMode ? t("common.add") : t("common.edit")} ${t("groups.title" as any)}`}
        subtitle={`${owner}/${name}`}
        onBack={handleBack}
      >
          {/* Draft has nothing to delete yet; hide the danger button in add mode. */}
          {!isAddMode && (
            <button onClick={handleDelete} className="flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-2 text-[13px] font-medium text-danger hover:bg-danger/10 transition-colors">
              <Trash2 size={14} /> {t("common.delete")}
            </button>
          )}
          {isAddMode ? (
            <>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-1 px-4 py-2 text-[13px] font-medium text-text-secondary hover:bg-surface-2 disabled:opacity-50 transition-colors"
              >
                {t("common.save")}
              </button>
              <button
                onClick={handleSaveAndExit}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-1 px-4 py-2 text-[13px] font-medium text-text-secondary hover:bg-surface-2 disabled:opacity-50 transition-colors"
              >
                <LogOut size={14} /> {t("common.saveAndExit" as any)}
              </button>
              <button
                onClick={handleSaveAndNew}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
              >
                {saving ? <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <Check size={14} />}
                {t("groups.saveAndNew" as any)}
              </button>
            </>
          ) : (
            <>
              <SaveButton onClick={handleSave} saving={saving} saved={saved} label={t("common.save")} />
              <button onClick={handleSaveAndExit} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors">
                {saving ? <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <LogOut size={14} />}
                {t("common.saveAndExit" as any)}
              </button>
            </>
          )}
      </StickyEditHeader>

      {showBanner && <UnsavedBanner isAddMode={isAddMode} draftMode />}

      {/* Basic Info */}
      <FormSection title={t("orgs.section.basic" as any)}>
        <FormField label={t("field.owner")}>
          <SimpleSelect value={group.owner} options={organizations.map((o) => ({ value: o.name, label: o.displayName || o.name }))} onChange={(v) => set("owner", v)} disabled={!isGlobalAdmin} />
        </FormField>
        <FormField label={t("field.name")} required>
          <input value={group.name} onChange={(e) => set("name", e.target.value)} className={monoInputClass} />
        </FormField>
        <FormField label={t("field.displayName")}>
          <input value={group.displayName ?? ""} onChange={(e) => set("displayName", e.target.value)} className={inputClass} />
        </FormField>
        <FormField label={t("field.type")}>
          <SimpleSelect value={group.type ?? "Virtual"} options={[
            { value: "Virtual", label: t("groups.type.virtual" as any) },
            { value: "Physical", label: t("groups.type.physical" as any) },
          ]} onChange={(v) => set("type", v)} />
        </FormField>
        <FormField label={t("groups.field.parentGroup" as any)}>
          <SimpleSelect value={group.parentId ?? ""} options={parentOptions} onChange={(v) => set("parentId", v)} />
        </FormField>
        <FormField label={t("field.isEnabled")}>
          <Switch checked={!!group.isEnabled} onChange={(v) => set("isEnabled", v)} />
        </FormField>
      </FormSection>

      {/* Users in this group */}
      <div className="space-y-2">
        <h3 className="text-[14px] font-semibold text-text-primary">{t("groups.field.users" as any)} ({userTotal || (group.users ?? []).length})</h3>
        {groupUsers.length > 0 || userLoading ? (
          <DataTable
            columns={userColumns}
            data={groupUsers}
            rowKey="name"
            loading={userLoading}
            page={userPage}
            pageSize={userPageSize}
            total={userTotal}
            onPageChange={setUserPage}
            emptyText={t("common.noData")}
          />
        ) : (group.users ?? []).length > 0 ? (
          /* Fallback: show group.users as simple list when API returns empty */
          <div className="rounded-xl border border-border bg-surface-1 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left" style={{ minWidth: "max-content" }}>
                <thead>
                  <tr className="border-b border-border bg-surface-2">
                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">{t("col.name" as any)}</th>
                  </tr>
                </thead>
                <tbody>
                  {(group.users ?? []).map((u, i) => (
                    <tr key={i} className="border-b border-border-subtle hover:bg-surface-2/50">
                      <td className="px-4 py-2.5 text-[13px]">
                        <Link to={`/users/${owner}/${u}`} className="font-mono font-medium text-accent hover:underline">{u}</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <DataTable
            columns={userColumns}
            data={[]}
            rowKey="name"
            loading={false}
            page={1}
            pageSize={userPageSize}
            total={0}
            emptyText={t("common.noData")}
          />
        )}
      </div>
    </motion.div>
  );
}
