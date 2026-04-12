import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Save, ArrowLeft, Trash2, User, Heart, Shield, Settings, ChevronDown, LogOut, Eye, EyeOff } from "lucide-react";
import { FormField, FormSection, Switch, inputClass, monoInputClass } from "../components/FormSection";
import { useTranslation } from "../i18n";
import { useOrganization } from "../OrganizationContext";
import { useModal } from "../components/Modal";
import { useEntityEdit } from "../hooks/useEntityEdit";
import { COUNTRIES } from "../components/CountryCodeSelect";
import * as UserBackend from "../backend/UserBackend";
import * as GroupBackend from "../backend/GroupBackend";
import * as AppBackend from "../backend/ApplicationBackend";
import * as OrgBackend from "../backend/OrganizationBackend";
import type { User as UserType } from "../backend/UserBackend";
import { friendlyError } from "../utils/errorHelper";
import FaceIdTable from "../components/FaceIdTable";

const CURRENCIES = [
  { value: "USD", label: "USD" }, { value: "CNY", label: "CNY" },
  { value: "EUR", label: "EUR" }, { value: "JPY", label: "JPY" },
  { value: "GBP", label: "GBP" },
];

export default function UserEditPage() {
  const { owner, name } = useParams<{ owner: string; name: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAddMode, setIsAddMode] = useState((location.state as any)?.mode === "add");
  const { t } = useTranslation();
  const modal = useModal();
  const { orgOptions, isGlobalAdmin } = useOrganization();
  const [user, setUser] = useState<UserType | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("basic");
  const [showPassword, setShowPassword] = useState(false);
  const [orgGroups, setOrgGroups] = useState<{ name: string; displayName: string }[]>([]);
  const [orgApps, setOrgApps] = useState<{ name: string; displayName: string }[]>([]);
  const [orgUserTypes, setOrgUserTypes] = useState<string[]>([]);
  const [accountItems, setAccountItems] = useState<{ name: string; visible: boolean; viewRule: string; modifyRule: string; tab?: string; regex?: string }[]>([]);
  const [regexErrors, setRegexErrors] = useState<Record<string, string>>({});
  const [orgSearch, setOrgSearch] = useState("");
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  const orgDropdownRef = useRef<HTMLDivElement>(null);

  const filteredOrgs = orgOptions.filter(o =>
    o.name.toLowerCase().includes(orgSearch.toLowerCase()) ||
    (o.displayName || "").toLowerCase().includes(orgSearch.toLowerCase())
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (orgDropdownRef.current && !orgDropdownRef.current.contains(e.target as Node)) {
        setOrgDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const isBuiltInAdmin = owner === "built-in" && name === "admin";

  const { entity, loading, invalidate: _invalidate, invalidateList } = useEntityEdit<UserType>({
    queryKey: "user",
    owner,
    name,
    fetchFn: UserBackend.getUser,
  });

  useEffect(() => {
    if (entity) setUser(entity);
  }, [entity]);

  const [noAppError, setNoAppError] = useState(false);

  // Fetch groups, applications, and org details for the user's organization
  useEffect(() => {
    if (!owner) return;
    GroupBackend.getGroups({ owner }).then((res) => {
      if (res.status === "ok" && res.data) setOrgGroups(res.data as any);
    });
    AppBackend.getApplicationsByOrganization({ owner: "admin", organization: owner }).then((res) => {
      if (res.status === "ok" && res.data) {
        setOrgApps(res.data as any);
        if (res.data.length === 0 && owner !== "built-in") {
          setNoAppError(true);
        }
      }
    });
    OrgBackend.getOrganization("admin", owner).then((res) => {
      if (res.status === "ok" && res.data) {
        const org = res.data as any;
        setOrgUserTypes(org.userTypes ?? []);
        setAccountItems(org.accountItems ?? []);
      }
    });
  }, [owner]);

  if (noAppError) {
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-6 text-center">
          <p className="text-[14px] font-medium text-danger">
            {t("users.error.noApp" as any).replace("{org}", owner || "")}
          </p>
          <button onClick={() => navigate("/users")} className="mt-4 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover transition-colors">
            {t("common.back" as any)}
          </button>
        </div>
      </div>
    );
  }

  if (loading || !user) {
    return <div className="flex items-center justify-center py-24"><div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" /></div>;
  }

  const set = <K extends keyof UserType>(key: K, val: UserType[K]) =>
    setUser((prev) => prev ? { ...prev, [key]: val } : prev);

  const setAny = (key: string, val: unknown) =>
    setUser((prev) => prev ? { ...prev, [key]: val } : prev);

  // accountItems helpers — determine field visibility and editability
  const loggedInAccount = JSON.parse(localStorage.getItem("account") ?? "null");
  const isSelf = loggedInAccount?.owner === user.owner && loggedInAccount?.name === user.name;
  const isAdmin = loggedInAccount?.owner === "built-in" || loggedInAccount?.isAdmin === true;

  const getAccountItem = (name: string) => accountItems.find((i) => i.name === name);

  const isFieldVisible = (name: string): boolean => {
    const item = getAccountItem(name);
    if (!item) return true; // If no accountItems configured, show all
    if (!item.visible) return false;
    if (item.viewRule === "Self" && !isSelf && !isAdmin) return false;
    if (item.viewRule === "Admin" && !isAdmin) return false;
    return true;
  };

  const isFieldDisabled = (name: string): boolean => {
    const item = getAccountItem(name);
    if (!item) return false;
    if (item.modifyRule === "Immutable") return true;
    if (item.modifyRule === "Admin" && !isAdmin) return true;
    if (item.modifyRule === "Self" && !isSelf && !isAdmin) return true;
    return false;
  };

  const getFieldRegex = (name: string): string | undefined => {
    return getAccountItem(name)?.regex;
  };

  const getFieldLabel = (name: string): string => {
    const key = `accountItem.${name}`;
    const translated = t(key as any);
    return translated === key ? name : translated;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await UserBackend.updateUser(owner!, name!, JSON.parse(JSON.stringify(user)));
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        setIsAddMode(false);
        invalidateList();
        if (user.name !== name) {
          navigate(`/users/${user.owner}/${user.name}`, { replace: true });
        }
      } else {
        modal.toast(friendlyError(res.msg, t) || t("common.saveFailed" as any), "error");
      }
    } catch (e: any) { modal.toast(e.message || t("common.saveFailed" as any), "error"); }
    finally { setSaving(false); }
  };

  const handleSaveAndExit = async () => {
    setSaving(true);
    try {
      const res = await UserBackend.updateUser(owner!, name!, JSON.parse(JSON.stringify(user)));
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        invalidateList();
        navigate("/users");
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
      await UserBackend.deleteUser(user);
      invalidateList();
    }
    navigate("/users");
  };

  const handleDelete = () => {
    if (isBuiltInAdmin) { modal.toast("Cannot delete built-in admin", "error"); return; }
    modal.showConfirm(`${t("common.confirmDelete")} [${user.displayName || user.name}]`, async () => {
      const res = await UserBackend.deleteUser(user);
      if (res.status === "ok") { invalidateList(); navigate("/users"); }
      else modal.toast(res.msg || t("common.deleteFailed" as any), "error");
    });
  };

  const imgPreview = (url: string) =>
    url ? <img src={url} alt="" className="h-10 w-10 rounded-full border border-border object-cover" referrerPolicy="no-referrer" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} /> : null;

  // Validate a field value against its regex pattern
  const validateField = (name: string, value: string) => {
    const pattern = getFieldRegex(name);
    if (!pattern || !value) {
      setRegexErrors((prev) => { const next = { ...prev }; delete next[name]; return next; });
      return;
    }
    try {
      const re = new RegExp(pattern);
      if (!re.test(value)) {
        setRegexErrors((prev) => ({ ...prev, [name]: t("users.error.regexMismatch" as any) }));
      } else {
        setRegexErrors((prev) => { const next = { ...prev }; delete next[name]; return next; });
      }
    } catch { /* invalid regex, skip */ }
  };

  // Create an onChange handler that also runs regex validation
  const setWithValidation = <K extends keyof UserType>(fieldName: string, key: K, value: UserType[K]) => {
    set(key, value);
    validateField(fieldName, String(value ?? ""));
  };

  // Dynamic field render helper (NOT a component — avoids remount/focus loss)
  const dynField = (name: string, span: "full" | "half" | undefined, children: React.ReactNode) => {
    if (!isFieldVisible(name)) return null;
    const error = regexErrors[name];
    return (
      <FormField label={getFieldLabel(name)} span={span}>
        {children}
        {error && <p className="text-[11px] text-danger mt-1">{error}</p>}
      </FormField>
    );
  };

  const TYPE_OPTIONS = orgUserTypes.length > 0
    ? orgUserTypes.map((ut) => ({ value: ut, label: ut }))
    : [
        { value: "normal-user", label: t("users.type.normal" as any) },
        { value: "paid-user", label: t("users.type.paid" as any) },
      ];

  const GENDER_OPTIONS = [
    { value: "", label: "" },
    { value: "Male", label: t("users.gender.male" as any) },
    { value: "Female", label: t("users.gender.female" as any) },
    { value: "Other", label: t("users.gender.other" as any) },
  ];

  const ID_CARD_TYPES = [
    { value: "", label: "" },
    { value: "ID card", label: t("users.idCardType.idCard" as any) },
    { value: "Passport", label: t("users.idCardType.passport" as any) },
    { value: "Driver's license", label: t("users.idCardType.driversLicense" as any) },
  ];

  const tabs = [
    { key: "basic", label: t("users.tab.basic" as any), icon: <User size={14} /> },
    { key: "profile", label: t("users.tab.profile" as any), icon: <Heart size={14} /> },
    { key: "security", label: t("users.tab.security" as any), icon: <Shield size={14} /> },
    { key: "admin", label: t("users.tab.admin" as any), icon: <Settings size={14} /> },
  ];

  // Tab 1: Basic Info — Identity + Signup Application + Contact
  const basicTab = (
    <div className="space-y-5">
      <FormSection title={t("users.section.identity" as any)}>
        {dynField("Organization", undefined, <div className="relative" ref={orgDropdownRef}>
            <input
              value={orgDropdownOpen ? orgSearch : (user.owner || "")}
              onChange={(e) => { setOrgSearch(e.target.value); setOrgDropdownOpen(true); }}
              onFocus={() => { setOrgSearch(""); setOrgDropdownOpen(true); }}
              disabled={!isGlobalAdmin || isFieldDisabled("Organization")}
              className={inputClass}
              placeholder={t("help.placeholder.searchOrg" as any)}
            />
            {orgDropdownOpen && isGlobalAdmin && !isFieldDisabled("Organization") && (
              <div className="absolute left-0 top-full mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-border bg-surface-0 py-1 shadow-lg z-50">
                {filteredOrgs.length > 0 ? filteredOrgs.map((org) => (
                  <button key={org.name} onClick={() => { set("owner", org.name); setOrgSearch(""); setOrgDropdownOpen(false); }}
                    className={`flex w-full items-center px-3 py-2 text-[13px] transition-colors ${user.owner === org.name ? "text-accent bg-accent/5 font-medium" : "text-text-secondary hover:bg-surface-2"}`}>
                    {org.displayName || org.name}
                  </button>
                )) : (
                  <div className="px-3 py-2 text-[13px] text-text-muted">{t("common.noData")}</div>
                )}
              </div>
            )}
          </div>)}
        {dynField("Name", undefined, <input value={user.name} onChange={(e) => set("name", e.target.value)} disabled={isBuiltInAdmin || isFieldDisabled("Name")} className={monoInputClass} />)}
        {dynField("ID", undefined, <input value={user.id ?? ""} disabled className={`${monoInputClass} text-[12px]`} />)}
        {dynField("Display name", undefined, <input value={user.displayName ?? ""} onChange={(e) => setWithValidation("Display name", "displayName", e.target.value)} disabled={isFieldDisabled("Display name")} className={inputClass} />)}
        {dynField("First name", undefined, <input value={user.firstName ?? ""} onChange={(e) => set("firstName", e.target.value)} disabled={isFieldDisabled("First name")} className={inputClass} />)}
        {dynField("Last name", undefined, <input value={user.lastName ?? ""} onChange={(e) => set("lastName", e.target.value)} disabled={isFieldDisabled("Last name")} className={inputClass} />)}
        {dynField("Avatar", "full", <div className="flex items-center gap-4">
            <input value={user.avatar || ""} onChange={(e) => set("avatar", e.target.value)} disabled={isFieldDisabled("Avatar")} className={`${inputClass} flex-1`} placeholder={t("help.placeholder.url" as any)} />
            {user.avatar && <img src={user.avatar} alt="" className="h-10 w-10 rounded-full object-cover border border-border shrink-0" referrerPolicy="no-referrer" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />}
          </div>)}
        {dynField("User type", undefined, <select value={user.type ?? "normal-user"} onChange={(e) => set("type", e.target.value)} disabled={isFieldDisabled("User type")} className={inputClass}>
            {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>)}
      </FormSection>

      <FormSection title={t("users.section.membership" as any)}>
        {dynField("Groups", undefined, <MultiSearchSelect
            selected={user.groups ?? []}
            options={orgGroups.map((g: any) => ({ value: `${g.owner}/${g.name}`, label: g.displayName || g.name }))}
            onChange={(v) => set("groups", v)}
            placeholder={t("common.search" as any)}
          />)}
        {dynField("Signup application", undefined, <SingleSearchSelect
            value={user.signupApplication ?? ""}
            options={orgApps.map((a) => ({ value: a.name, label: (a as any).displayName || a.name }))}
            onChange={(v) => set("signupApplication", v)}
            placeholder={t("common.search" as any)}
          />)}
      </FormSection>

      <FormSection title={t("users.section.contact" as any)}>
        {dynField("Email", undefined, <input value={user.email ?? ""} onChange={(e) => setWithValidation("Email", "email", e.target.value)} disabled={isFieldDisabled("Email")} type="email" className={inputClass} />)}
        {dynField("Phone", undefined, <div className="flex gap-2">
            <PhoneCodeSelect value={user.countryCode ?? ""} onChange={(v) => set("countryCode", v)} />
            <input value={user.phone ?? ""} onChange={(e) => setWithValidation("Phone", "phone", e.target.value)} disabled={isFieldDisabled("Phone")} className={`${inputClass} flex-1`} />
          </div>)}
        {dynField("Country/Region", undefined, <RegionSelect value={user.region ?? ""} onChange={(v) => set("region", v)} t={t} />)}
        {dynField("Location", undefined, <input value={user.location ?? ""} onChange={(e) => setWithValidation("Location", "location", e.target.value)} disabled={isFieldDisabled("Location")} className={inputClass} />)}
        {dynField("Address", "full", <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-text-muted mb-1">{t("users.field.address1" as any)}</label>
              <input value={Array.isArray(user.address) ? user.address[0] ?? "" : String(user.address ?? "")} onChange={(e) => { const arr = Array.isArray(user.address) ? [...user.address] : [String(user.address ?? ""), ""]; arr[0] = e.target.value; set("address", arr as any); }} className={inputClass} />
            </div>
            <div>
              <label className="block text-[11px] text-text-muted mb-1">{t("users.field.address2" as any)}</label>
              <input value={Array.isArray(user.address) ? user.address[1] ?? "" : ""} onChange={(e) => { const arr = Array.isArray(user.address) ? [...user.address] : [String(user.address ?? ""), ""]; arr[1] = e.target.value; set("address", arr as any); }} className={inputClass} />
            </div>
          </div>)}
        {dynField("Addresses", "full", <AddressesTable items={(user as any).addresses ?? []} onChange={(v) => setAny("addresses", v)} t={t} />)}
      </FormSection>
    </div>
  );

  // Tab 2: Profile — Professional + Personal
  const profileTab = (
    <div className="space-y-5">
      <FormSection title={t("users.section.professional" as any)}>
        {dynField("Affiliation", undefined, <input value={user.affiliation ?? ""} onChange={(e) => set("affiliation", e.target.value)} disabled={isFieldDisabled("Affiliation")} className={inputClass} />)}
        {dynField("Title", undefined, <input value={user.title ?? ""} onChange={(e) => setWithValidation("Title", "title", e.target.value)} disabled={isFieldDisabled("Title")} className={inputClass} />)}
        {dynField("Homepage", "full", <input value={user.homepage ?? ""} onChange={(e) => setWithValidation("Homepage", "homepage", e.target.value)} disabled={isFieldDisabled("Homepage")} className={inputClass} placeholder={t("help.placeholder.url" as any)} />)}
        {dynField("Bio", "full", <textarea value={user.bio ?? ""} onChange={(e) => setWithValidation("Bio", "bio", e.target.value)} disabled={isFieldDisabled("Bio")} rows={3} className={inputClass} />)}
      </FormSection>

      <FormSection title={t("users.section.personal" as any)}>
        {dynField("Tag", undefined, <input value={user.tag ?? ""} onChange={(e) => set("tag", e.target.value)} disabled={isFieldDisabled("Tag")} className={inputClass} />)}
        {dynField("Language", undefined, <input value={user.language ?? ""} onChange={(e) => set("language", e.target.value)} disabled={isFieldDisabled("Language")} className={inputClass} />)}
        {dynField("Gender", undefined, <select value={user.gender ?? ""} onChange={(e) => set("gender", e.target.value)} disabled={isFieldDisabled("Gender")} className={inputClass}>
            {GENDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>)}
        {dynField("Birthday", undefined, <input type="date" value={user.birthday ?? ""} onChange={(e) => setWithValidation("Birthday", "birthday", e.target.value)} disabled={isFieldDisabled("Birthday")} className={inputClass} />)}
        {dynField("Education", undefined, <input value={user.education ?? ""} onChange={(e) => setWithValidation("Education", "education", e.target.value)} disabled={isFieldDisabled("Education")} className={inputClass} />)}
      </FormSection>

      <FormSection title={t("users.section.verification" as any)}>
        {/* Row 1: idCardType + idCard + realName + verify button in 4 columns */}
        <div className="col-span-2">
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-[12px] font-medium text-text-secondary mb-1.5">{t("users.field.idCardType" as any)}</label>
              <select value={user.idCardType ?? ""} onChange={(e) => set("idCardType", e.target.value)} disabled={user.isVerified === true} className={inputClass}>
                {ID_CARD_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-text-secondary mb-1.5">{t("users.field.idCard" as any)}</label>
              <input value={user.idCard ?? ""} onChange={(e) => set("idCard", e.target.value)} disabled={user.isVerified === true} className={monoInputClass} />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-text-secondary mb-1.5">{t("users.field.realName" as any)}</label>
              <input value={user.realName ?? ""} onChange={(e) => set("realName", e.target.value)} disabled={user.isVerified === true} className={inputClass} />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-text-secondary mb-1.5">{t("users.field.isVerified" as any)}</label>
              {user.isVerified === true ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 border border-success/20 px-3 py-2 text-[12px] font-medium text-success">
                  ✓ {t("users.verify.verified" as any)}
                </span>
              ) : (
                <button
                  type="button"
                  disabled={!user.idCard || !user.idCardType || !user.realName}
                  onClick={async () => {
                    if (!user.idCard || !user.idCardType) { modal.toast(t("users.verify.fillIdCard" as any), "error"); return; }
                    if (!user.realName) { modal.toast(t("users.verify.fillRealName" as any), "error"); return; }
                    const res = await UserBackend.verifyIdentification(user.owner, user.name);
                    if (res.status === "ok") { modal.toast(t("users.verify.success" as any)); set("isVerified", true); }
                    else { modal.toast(res.msg || t("users.verify.failed" as any), "error"); }
                  }}
                  className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
                >
                  {t("users.verify.verifyIdentity" as any)}
                </button>
              )}
            </div>
          </div>
        </div>
        <FormField label={t("users.field.idCardInfo" as any)} span="full">
          <div className="grid grid-cols-3 gap-4">
            {([
              { key: "idCardFront", label: t("users.field.idCardFront" as any) },
              { key: "idCardBack", label: t("users.field.idCardBack" as any) },
              { key: "idCardWithPerson", label: t("users.field.idCardWithPerson" as any) },
            ] as const).map(({ key, label }) => {
              const url = (user.properties as any)?.[key] || "";
              return (
                <div key={key} className="flex flex-col items-center gap-2">
                  {url ? (
                    <img src={url} alt={key} className="h-28 w-full rounded-lg border border-border object-cover" />
                  ) : (
                    <div className="flex h-28 w-full items-center justify-center rounded-lg border-2 border-dashed border-border bg-surface-2">
                      <div className="text-center text-text-muted">
                        <span className="text-2xl block">+</span>
                        <span className="text-[11px]">({t("common.none" as any)})</span>
                      </div>
                    </div>
                  )}
                  <label className={`rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors whitespace-nowrap ${user.isVerified ? "opacity-50 pointer-events-none" : "cursor-pointer"}`}>
                    {label}
                    <input type="file" accept="image/*" className="hidden" disabled={!!user.isVerified} onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const { uploadResource } = await import("../backend/ResourceBackend");
                      const ext = file.name.split(".").pop() || "png";
                      const fullPath = `${key}/${user.owner}/${user.name}.${ext}`;
                      const res = await uploadResource(user.owner, user.name, key, "IdCard", fullPath, file);
                      if (res.status === "ok" && res.data) {
                        const props = { ...(user.properties ?? {}), [key]: res.data, isIdCardVerified: "false" };
                        set("properties", props);
                        modal.toast(t("faceId.uploadSuccess" as any));
                      } else {
                        modal.toast(res.msg || t("faceId.uploadFailed" as any), "error");
                      }
                      e.target.value = "";
                    }} />
                  </label>
                </div>
              );
            })}
          </div>
        </FormField>
      </FormSection>
    </div>
  );

  // Tab 3: Security & Finance
  const securityTab = (
    <div className="space-y-5">
      <FormSection title={t("users.section.security" as any)}>
        {dynField("Password", undefined, <div className="relative">
            <input type={showPassword ? "text" : "password"} value={user.password ?? ""} onChange={(e) => set("password", e.target.value)} disabled={isFieldDisabled("Password")} className={monoInputClass} placeholder="***" />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary">
              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>)}
        {dynField("IP whitelist", undefined, <input value={user.ipWhitelist ?? ""} onChange={(e) => set("ipWhitelist", e.target.value)} disabled={isFieldDisabled("IP whitelist")} className={inputClass} placeholder="192.168.1.1, 10.0.0.0/8" />)}
      </FormSection>

      <FormSection title={t("users.section.thirdPartyLogins" as any)}>
        <FormField label={t("users.field.thirdPartyLogins" as any)} span="full">
          <div className="flex flex-wrap gap-1.5">
            {(((user as any).oauth ?? "") || ((user as any).github ?? "") || ((user as any).google ?? "")) ? (
              <span className="text-[12px] text-text-secondary">{t("users.field.thirdPartyConfigured" as any)}</span>
            ) : (
              <span className="text-[12px] text-text-muted">—</span>
            )}
          </div>
        </FormField>
      </FormSection>

      <FormSection title={t("users.section.mfa" as any)}>
        <FormField label={t("users.field.multiFactorAuth" as any)} span="full">
          {((user as any).multiFactorAuths ?? (user as any).mfaProps ?? []).length > 0 ? (
            <div className="space-y-2">
              {((user as any).multiFactorAuths ?? (user as any).mfaProps ?? []).map((mfa: any, idx: number) => (
                <div key={idx} className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2">
                  <span className="text-[13px] font-medium text-text-primary">{(() => { const key = mfa.mfaType ?? mfa.type ?? ""; const translated = t(`users.mfa.${key}` as any); return translated.startsWith("users.mfa.") ? key : translated; })()}</span>
                  {mfa.isPreferred && <span className="rounded-full bg-accent/15 border border-accent/20 px-1.5 py-0.5 text-[10px] font-medium text-accent">{t("users.mfa.preferred" as any)}</span>}
                  <span className="ml-auto text-[12px] text-text-muted">{mfa.enabled ? t("common.enabled" as any) : t("common.disabled" as any)}</span>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-[12px] text-text-muted">—</span>
          )}
        </FormField>
        <FormField label={t("users.field.mfaAccounts" as any)} span="full">
          <SimpleTable data={(user as any).mfaAccounts ?? []} columns={["issuer", "accountName"]} emptyText={t("common.noData")} />
        </FormField>
        <FormField label={t("users.field.mfaItems" as any)} span="full">
          <MfaItemsTable
            items={(user as any).mfaItems ?? []}
            onChange={(v) => setAny("mfaItems", v)}
            t={t}
          />
        </FormField>
        <FormField label={t("users.field.webauthnCredentials" as any)} span="full">
          <WebAuthnTable
            items={(user as any).webauthnCredentials ?? []}
            onChange={(v) => setAny("webauthnCredentials", v)}
            isSelf={false}
            t={t}
          />
        </FormField>
        <FormField label={t("users.field.lastChangePasswordTime" as any)}>
          <input value={(user as any).lastChangePasswordTime ?? ""} disabled className={monoInputClass} />
        </FormField>
        <FormField label={t("users.field.managedAccounts" as any)} span="full">
          <ManagedAccountsTable
            items={(user as any).managedAccounts ?? []}
            onChange={(v) => setAny("managedAccounts", v)}
            applications={orgApps}
            t={t}
          />
        </FormField>
        <FormField label={t("users.field.faceIds" as any)} span="full">
          <FaceIdTable
            table={(user as any).faceIds ?? []}
            onUpdateTable={(v) => setAny("faceIds", v)}
            account={{ owner: user.owner, name: user.name }}
          />
        </FormField>
      </FormSection>

      <FormSection title={t("users.section.finance" as any)}>
        {dynField("Balance", undefined, <input type="number" value={user.balance ?? 0} onChange={(e) => set("balance", Number(e.target.value))} disabled={isFieldDisabled("Balance")} className={monoInputClass} />)}
        {dynField("Balance credit", undefined, <input type="number" value={user.balanceCredit ?? 0} onChange={(e) => set("balanceCredit", Number(e.target.value))} disabled={isFieldDisabled("Balance credit")} className={monoInputClass} />)}
        {dynField("Balance currency", undefined, <select value={user.balanceCurrency ?? "USD"} onChange={(e) => set("balanceCurrency", e.target.value)} disabled={isFieldDisabled("Balance currency")} className={inputClass}>
            {CURRENCIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>)}
      </FormSection>

      <FormSection title={t("users.section.cart" as any)}>
        <FormField label={t("users.field.cart" as any)} span="full">
          <SimpleTable data={(user as any).cart ?? []} columns={["name", "price", "quantity", "currency"]} emptyText={t("common.noData")} />
        </FormField>
        <FormField label={t("users.field.transactions" as any)} span="full">
          <SimpleTable data={(user as any).transactions ?? []} columns={["name", "amount", "currency", "createdTime"]} emptyText={t("common.noData")} />
        </FormField>
      </FormSection>

      <FormSection title={t("users.section.registration" as any)}>
        {dynField("Score", undefined, <input type="number" value={user.score ?? 0} onChange={(e) => set("score", Number(e.target.value))} disabled={isFieldDisabled("Score")} className={monoInputClass} />)}
        {dynField("Karma", undefined, <input type="number" value={user.karma ?? 0} onChange={(e) => set("karma", Number(e.target.value))} disabled={isFieldDisabled("Karma")} className={monoInputClass} />)}
        {dynField("Ranking", undefined, <input type="number" value={user.ranking ?? 0} onChange={(e) => set("ranking", Number(e.target.value))} disabled={isFieldDisabled("Ranking")} className={monoInputClass} />)}
        {dynField("Register type", undefined, <input value={user.registerType ?? ""} disabled className={inputClass} />)}
        {dynField("Register source", undefined, <input value={user.registerSource ?? ""} disabled className={inputClass} />)}
      </FormSection>
    </div>
  );

  // Tab 4: Administration
  const adminTab = (
    <div className="space-y-5">
      <FormSection title={t("users.section.admin" as any)}>
        {dynField("Is admin", undefined, <Switch checked={!!user.isAdmin} onChange={(v) => set("isAdmin", v)} disabled={isFieldDisabled("Is admin")} />)}
        {dynField("Is forbidden", undefined, <Switch checked={!!user.isForbidden} onChange={(v) => set("isForbidden", v)} disabled={isFieldDisabled("Is forbidden")} />)}
        {dynField("Is deleted", undefined, <Switch checked={!!user.isDeleted} onChange={(v) => set("isDeleted", v)} disabled={isFieldDisabled("Is deleted")} />)}
        {dynField("Need update password", undefined, <Switch checked={!!(user as any).needUpdatePassword} onChange={(v) => setAny("needUpdatePassword", v)} disabled={isFieldDisabled("Need update password")} />)}
        {dynField("Is online", undefined, <Switch checked={!!(user as any).isOnline} onChange={() => {}} disabled />)}
        <div />
        <FormField label={t("field.createdTime")}><input value={user.createdTime ?? ""} disabled className={monoInputClass} /></FormField>
        <FormField label={t("users.field.updatedTime" as any)}><input value={String((user as any).updatedTime ?? "")} disabled className={monoInputClass} /></FormField>
      </FormSection>

      <FormSection title={t("users.section.roles" as any)}>
        <FormField label={t("users.field.roles" as any)} span="full">
          <div className="flex flex-wrap gap-1.5">
            {((user as any).roles ?? []).length > 0 ? ((user as any).roles as { name: string; displayName?: string }[]).map((r, i) => (
              <Link key={i} to={`/roles/${user.owner}/${r.name}`} className="inline-flex items-center rounded-md bg-info/15 border border-info/20 px-2 py-0.5 text-[12px] font-mono font-medium text-info hover:underline">{r.displayName || r.name}</Link>
            )) : <span className="text-[12px] text-text-muted">—</span>}
          </div>
        </FormField>
        <FormField label={t("users.field.permissions" as any)} span="full">
          <div className="flex flex-wrap gap-1.5">
            {((user as any).permissions ?? []).length > 0 ? ((user as any).permissions as { name: string; displayName?: string }[]).map((p, i) => (
              <Link key={i} to={`/permissions/${user.owner}/${p.name}`} className="inline-flex items-center rounded-md bg-warning/15 border border-warning/20 px-2 py-0.5 text-[12px] font-mono font-medium text-warning hover:underline">{p.displayName || p.name}</Link>
            )) : <span className="text-[12px] text-text-muted">—</span>}
          </div>
        </FormField>
      </FormSection>

      <FormSection title={t("users.section.consents" as any)}>
        <FormField label={t("users.field.consents" as any)} span="full">
          <SimpleTable data={(user as any).consents ?? []} columns={["application", "grantedScopes"]} emptyText={t("common.noData")} />
        </FormField>
      </FormSection>

      <FormSection title={t("users.section.properties" as any)}>
        <FormField label={t("users.field.properties" as any)} span="full">
          {user.properties && Object.keys(user.properties).length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border bg-surface-2/30">
                    <th className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">Key</th>
                    <th className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(user.properties).map(([k, v]) => (
                    <tr key={k} className="border-b border-border-subtle">
                      <td className="px-3 py-1.5 text-[12px] font-mono text-text-secondary">{k}</td>
                      <td className="px-3 py-1.5 text-[12px] text-text-primary">{String(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <span className="text-[12px] text-text-muted">—</span>}
        </FormField>
      </FormSection>
    </div>
  );

  const tabContent: Record<string, React.ReactNode> = {
    basic: basicTab,
    profile: profileTab,
    security: securityTab,
    admin: adminTab,
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5 ">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={handleBack} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-3">
            {imgPreview(user.avatar)}
            <div>
              <h1 className="text-xl font-bold tracking-tight">{isAddMode ? t("common.add") : t("common.edit")} {t("users.title" as any)}</h1>
              <p className="text-[13px] text-text-muted font-mono mt-0.5">{owner}/{name}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isBuiltInAdmin && (
            <button onClick={handleDelete} className="flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-2 text-[13px] font-medium text-danger hover:bg-danger/10 transition-colors">
              <Trash2 size={14} /> {t("common.delete")}
            </button>
          )}
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 rounded-lg border border-accent px-3 py-2 text-[13px] font-semibold text-accent hover:bg-accent/10 disabled:opacity-50 transition-colors">
            {saving ? <div className="h-3.5 w-3.5 rounded-full border-2 border-accent/30 border-t-accent animate-spin" /> : <Save size={14} />}
            {t("common.save")}
          </button>
          <button onClick={handleSaveAndExit} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors">
            {saving ? <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <LogOut size={14} />}
            {t("common.saveAndExit" as any)}
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border">
        {tabs.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors ${
              activeTab === tab.key ? "border-accent text-accent" : "border-transparent text-text-muted hover:text-text-secondary"
            }`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tabContent[activeTab]}
    </motion.div>
  );
}

// Phone country code dropdown selector
function PhoneCodeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const locale = localStorage.getItem("locale") ?? "en";
  const isZh = locale.startsWith("zh");

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) { document.addEventListener("mousedown", handler); return () => document.removeEventListener("mousedown", handler); }
  }, [open]);

  const current = COUNTRIES.find((c) => c.code === value);
  const filtered = COUNTRIES.filter((c) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return c.code.toLowerCase().includes(s) || c.phone.includes(s) || c.en.toLowerCase().includes(s) || c.zh.includes(s);
  });

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`${inputClass} flex items-center gap-1.5 w-[130px] text-left`}
      >
        {current ? (
          <>
            <span>{current.flag}</span>
            <span className="font-mono text-[12px]">{current.phone}</span>
          </>
        ) : (
          <span className="text-text-muted text-[13px]">{value || "—"}</span>
        )}
        <ChevronDown size={12} className="text-text-muted ml-auto" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-72 rounded-lg border border-border bg-surface-2 shadow-[var(--shadow-elevated)] overflow-hidden">
          <div className="p-2 border-b border-border-subtle">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isZh ? "搜索国家..." : "Search country..."}
              className="w-full rounded border border-border bg-surface-1 px-2.5 py-1.5 text-[12px] text-text-primary placeholder:text-text-muted outline-none focus:border-accent"
              autoFocus
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {filtered.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => { onChange(c.code); setOpen(false); setSearch(""); }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-[13px] transition-colors ${
                  value === c.code ? "text-accent bg-accent-subtle" : "text-text-secondary hover:bg-surface-3"
                }`}
              >
                <span className="text-base">{c.flag}</span>
                <span className="flex-1 truncate">{isZh ? c.zh : c.en}</span>
                <span className="font-mono text-[11px] text-text-muted">{c.phone}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Multi-select searchable dropdown
function MultiSearchSelect({ selected, options, onChange, placeholder }: {
  selected: string[];
  options: { value: string; label: string }[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(""); } };
    if (open) { document.addEventListener("mousedown", handler); return () => document.removeEventListener("mousedown", handler); }
  }, [open]);

  const filtered = options.filter((o) =>
    !selected.includes(o.value) &&
    (o.label.toLowerCase().includes(search.toLowerCase()) || o.value.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div ref={ref}>
      <div onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}
        className={`flex flex-wrap gap-1.5 rounded-lg border bg-surface-2 px-2.5 py-2 min-h-[38px] cursor-text transition-colors ${open ? "border-accent ring-1 ring-accent/30" : "border-border"}`}>
        {selected.map((val) => {
          const label = options.find((o) => o.value === val)?.label ?? val;
          return (
            <span key={val} className="inline-flex items-center gap-1 rounded-full bg-accent/15 border border-accent/20 px-2 py-0.5 text-[11px] font-mono font-medium text-accent">
              {label}
              <button onClick={(e) => { e.stopPropagation(); onChange(selected.filter((s) => s !== val)); }} className="hover:text-danger transition-colors text-[10px] ml-0.5">×</button>
            </span>
          );
        })}
        <input ref={inputRef} value={search} onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
          placeholder={selected.length === 0 ? placeholder : ""} className="flex-1 min-w-[80px] bg-transparent text-[12px] text-text-primary outline-none placeholder:text-text-muted" />
        <svg className="h-4 w-4 text-text-muted shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-[60] mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border bg-surface-1 py-1 shadow-lg" style={{ width: ref.current?.offsetWidth }}>
          {filtered.map((opt) => (
            <button key={opt.value} type="button" onClick={() => { onChange([...selected, opt.value]); setSearch(""); }}
              className="flex w-full items-center px-3 py-2 text-[13px] text-left text-text-primary hover:bg-surface-2 transition-colors">
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Single-select searchable dropdown
function SingleSearchSelect({ value, options, onChange, placeholder }: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(""); } };
    if (open) { document.addEventListener("mousedown", handler); return () => document.removeEventListener("mousedown", handler); }
  }, [open]);

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase()) || o.value.toLowerCase().includes(search.toLowerCase())
  );
  const selectedLabel = options.find((o) => o.value === value)?.label ?? value;

  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen(!open)}
        className={`flex items-center rounded-lg border bg-surface-2 px-2.5 py-2 min-h-[38px] cursor-pointer transition-colors ${open ? "border-accent ring-1 ring-accent/30" : "border-border"}`}>
        {open ? (
          <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder={placeholder}
            className="flex-1 bg-transparent text-[13px] text-text-primary outline-none placeholder:text-text-muted" />
        ) : (
          <span className={`text-[13px] flex-1 ${value ? "text-text-primary" : "text-text-muted"}`}>{value ? selectedLabel : "—"}</span>
        )}
        <svg className="h-4 w-4 text-text-muted shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </div>
      {open && (
        <div className="absolute z-[60] mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border bg-surface-1 py-1 shadow-lg">
          <button type="button" onClick={() => { onChange(""); setOpen(false); setSearch(""); }}
            className={`flex w-full items-center px-3 py-2 text-[13px] text-left transition-colors ${!value ? "text-accent bg-accent/5" : "text-text-muted hover:bg-surface-2"}`}>—</button>
          {filtered.map((opt) => (
            <button key={opt.value} type="button" onClick={() => { onChange(opt.value); setOpen(false); setSearch(""); }}
              className={`flex w-full items-center px-3 py-2 text-[13px] text-left transition-colors ${opt.value === value ? "text-accent bg-accent/5 font-medium" : "text-text-primary hover:bg-surface-2"}`}>
              {opt.label}
            </button>
          ))}
          {filtered.length === 0 && <div className="px-3 py-2 text-[12px] text-text-muted">No results</div>}
        </div>
      )}
    </div>
  );
}

// Generic table for displaying array data (read-only)
function SimpleTable({ data, columns, emptyText }: { data: Record<string, unknown>[]; columns: string[]; emptyText: string }) {
  if (!data || data.length === 0) {
    return <div className="rounded-lg border border-border bg-surface-2/30 px-4 py-6 text-center text-[12px] text-text-muted">{emptyText}</div>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left" style={{ minWidth: "max-content" }}>
        <thead>
          <tr className="border-b border-border bg-surface-2/30">
            {columns.map((col) => (
              <th key={col} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={idx} className="border-b border-border-subtle">
              {columns.map((col) => (
                <td key={col} className="px-3 py-1.5 text-[12px] text-text-primary">{row[col] != null ? String(row[col]) : "—"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── MFA Items Table (Name + Rule, max 4) ──
const MFA_NAME_KEYS = ["Phone", "Email", "App", "Push"];
const MFA_RULE_KEYS = ["Optional", "Prompt", "Required"];

function MfaItemsTable({ items, onChange, t }: { items: { name: string; rule: string }[]; onChange: (v: { name: string; rule: string }[]) => void; t: (k: string) => string }) {
  const usedNames = new Set(items.map((i) => i.name));
  const addRow = () => {
    const nextName = MFA_NAME_KEYS.find((n) => !usedNames.has(n)) ?? "Phone";
    onChange([...items, { name: nextName, rule: "Optional" }]);
  };
  const updateField = (idx: number, key: string, value: string) => {
    const next = [...items]; next[idx] = { ...next[idx], [key]: value }; onChange(next);
  };
  const deleteRow = (idx: number) => onChange(items.filter((_, i) => i !== idx));
  const swap = (a: number, b: number) => { if (b < 0 || b >= items.length) return; const next = [...items]; [next[a], next[b]] = [next[b], next[a]]; onChange(next); };

  return (
    <div className="rounded-xl border border-border bg-surface-1 overflow-visible">
      <div className="px-4 py-2.5 border-b border-border-subtle bg-surface-2/30 flex items-center gap-2">
        <span className="text-[12px] font-semibold text-text-primary">{t("users.field.mfaItems" as any)}</span>
        <button disabled={items.length >= 4} onClick={addRow}
          className="rounded-lg bg-accent px-2 py-0.5 text-[11px] font-medium text-white hover:bg-accent-hover disabled:opacity-50 transition-colors">{t("common.add")}</button>
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12px] text-text-muted">{t("common.noData")}</div>
      ) : (
        <table className="w-full text-left">
          <thead><tr className="border-b border-border bg-surface-2/30">
            <th className="px-3 py-1.5 text-[11px] font-semibold uppercase text-text-muted">{t("common.name" as any)}</th>
            <th className="px-3 py-1.5 text-[11px] font-semibold uppercase text-text-muted w-32">{t("users.mfaTable.rule" as any)}</th>
            <th className="px-3 py-1.5 text-[11px] font-semibold uppercase text-text-muted w-24">{t("common.action" as any)}</th>
          </tr></thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={idx} className="border-b border-border-subtle">
                <td className="px-3 py-1.5">
                  <select value={item.name} onChange={(e) => updateField(idx, "name", e.target.value)}
                    className="rounded-lg border border-border bg-surface-2 px-2 py-1 text-[12px] text-text-primary outline-none focus:border-accent transition-colors">
                    <option value={item.name}>{t(`users.mfaName.${item.name}` as any)}</option>
                    {MFA_NAME_KEYS.filter((n) => !usedNames.has(n)).map((n) => <option key={n} value={n}>{t(`users.mfaName.${n}` as any)}</option>)}
                  </select>
                </td>
                <td className="px-3 py-1.5">
                  <select value={item.rule} onChange={(e) => updateField(idx, "rule", e.target.value)}
                    className="rounded border border-border bg-surface-2 px-2 py-1 text-[12px] text-text-primary outline-none">
                    {MFA_RULE_KEYS.map((r) => <option key={r} value={r}>{t(`users.mfaRule.${r}` as any)}</option>)}
                  </select>
                </td>
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-0.5">
                    <button disabled={idx === 0} onClick={() => swap(idx, idx - 1)} className="rounded p-0.5 text-text-muted hover:bg-surface-2 disabled:opacity-30">▲</button>
                    <button disabled={idx === items.length - 1} onClick={() => swap(idx, idx + 1)} className="rounded p-0.5 text-text-muted hover:bg-surface-2 disabled:opacity-30">▼</button>
                    <button onClick={() => deleteRow(idx)} className="rounded p-0.5 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors text-[12px]">✕</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── WebAuthn Credentials Table ──
function WebAuthnTable({ items, onChange, isSelf, t }: { items: { id?: string; name?: string }[]; onChange: (v: { id?: string; name?: string }[]) => void; isSelf?: boolean; t: (k: string) => string }) {
  const addRow = () => onChange([...items, { id: "", name: "" }]);
  const deleteRow = (idx: number) => onChange(items.filter((_, i) => i !== idx));

  return (
    <div className="rounded-xl border border-border bg-surface-1 overflow-visible">
      <div className="px-4 py-2.5 border-b border-border-subtle bg-surface-2/30 flex items-center gap-2">
        <span className="text-[12px] font-semibold text-text-primary">{t("users.field.webauthnCredentials" as any)}</span>
        <button onClick={addRow} disabled={!isSelf}
          className="rounded-lg border border-border px-2 py-0.5 text-[11px] font-medium text-text-secondary hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">{t("common.add")}</button>
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12px] text-text-muted">{t("common.noData")}</div>
      ) : (
        <table className="w-full text-left">
          <thead><tr className="border-b border-border bg-surface-2/30">
            <th className="px-3 py-1.5 text-[11px] font-semibold uppercase text-text-muted">{t("common.name" as any)}</th>
            <th className="px-3 py-1.5 text-[11px] font-semibold uppercase text-text-muted w-20">{t("common.action" as any)}</th>
          </tr></thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={idx} className="border-b border-border-subtle">
                <td className="px-3 py-1.5 text-[12px] font-mono text-text-secondary truncate max-w-[400px]">{item.id || item.name || "—"}</td>
                <td className="px-3 py-1.5">
                  <button onClick={() => deleteRow(idx)} className="rounded px-2 py-0.5 text-[11px] font-medium text-danger border border-danger/30 hover:bg-danger/10 transition-colors">{t("common.delete")}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Managed Accounts Table ──
function ManagedAccountsTable({ items, onChange, applications, t }: {
  items: { application?: string; signinUrl?: string; username?: string; password?: string }[];
  onChange: (v: { application?: string; signinUrl?: string; username?: string; password?: string }[]) => void;
  applications: { name: string; displayName?: string }[];
  t: (k: string) => string;
}) {
  const [showPw, setShowPw] = useState<Record<number, boolean>>({});
  const addRow = () => onChange([...items, { application: "", signinUrl: "", username: "", password: "" }]);
  const updateField = (idx: number, key: string, value: string) => { const next = [...items]; next[idx] = { ...next[idx], [key]: value }; onChange(next); };
  const deleteRow = (idx: number) => onChange(items.filter((_, i) => i !== idx));
  const swap = (a: number, b: number) => { if (b < 0 || b >= items.length) return; const next = [...items]; [next[a], next[b]] = [next[b], next[a]]; onChange(next); };
  const isValidUrl = (url: string) => !url || /^https?:\/\/.+/.test(url);

  return (
    <div className="rounded-xl border border-border bg-surface-1 overflow-visible">
      <div className="px-4 py-2.5 border-b border-border-subtle bg-surface-2/30 flex items-center gap-2">
        <span className="text-[12px] font-semibold text-text-primary">{t("users.field.managedAccounts" as any)}</span>
        <button onClick={addRow}
          className="rounded-lg bg-accent px-2 py-0.5 text-[11px] font-medium text-white hover:bg-accent-hover transition-colors">{t("common.add")}</button>
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12px] text-text-muted">{t("common.noData")}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left" style={{ minWidth: "max-content" }}>
            <thead><tr className="border-b border-border bg-surface-2/30">
              <th className="px-3 py-1.5 text-[11px] font-semibold uppercase text-text-muted">{t("users.managed.application" as any)}</th>
              <th className="px-3 py-1.5 text-[11px] font-semibold uppercase text-text-muted">{t("users.managed.signinUrl" as any)}</th>
              <th className="px-3 py-1.5 text-[11px] font-semibold uppercase text-text-muted w-[180px]">{t("users.managed.username" as any)}</th>
              <th className="px-3 py-1.5 text-[11px] font-semibold uppercase text-text-muted w-[180px]">{t("users.managed.password" as any)}</th>
              <th className="px-3 py-1.5 text-[11px] font-semibold uppercase text-text-muted w-24">{t("common.action" as any)}</th>
            </tr></thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx} className="border-b border-border-subtle">
                  <td className="px-3 py-1.5">
                    <select value={item.application ?? ""} onChange={(e) => updateField(idx, "application", e.target.value)}
                      className="rounded-lg border border-border bg-surface-2 px-2 py-1 text-[12px] text-text-primary outline-none focus:border-accent transition-colors">
                      <option value="">—</option>
                      {applications.map((a) => <option key={a.name} value={a.name}>{(a as any).displayName || a.name}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    <input value={item.signinUrl ?? ""} onChange={(e) => updateField(idx, "signinUrl", e.target.value)}
                      className={`w-full rounded-lg border bg-surface-2 px-2 py-1 text-[12px] text-text-primary outline-none transition-colors ${isValidUrl(item.signinUrl ?? "") ? "border-border focus:border-accent" : "border-danger"}`} placeholder="https://" />
                  </td>
                  <td className="px-3 py-1.5">
                    <input value={item.username ?? ""} onChange={(e) => updateField(idx, "username", e.target.value)}
                      className="w-full rounded-lg border border-border bg-surface-2 px-2 py-1 text-[12px] text-text-primary outline-none focus:border-accent transition-colors" />
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="relative">
                      <input type={showPw[idx] ? "text" : "password"} value={item.password ?? ""} onChange={(e) => updateField(idx, "password", e.target.value)}
                        className="w-full rounded-lg border border-border bg-surface-2 px-2 py-1 pr-7 text-[12px] text-text-primary outline-none focus:border-accent transition-colors" />
                      <button type="button" onClick={() => setShowPw((p) => ({ ...p, [idx]: !p[idx] }))}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary">
                        {showPw[idx] ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-0.5">
                      <button disabled={idx === 0} onClick={() => swap(idx, idx - 1)} className="rounded p-0.5 text-text-muted hover:bg-surface-2 disabled:opacity-30">▲</button>
                      <button disabled={idx === items.length - 1} onClick={() => swap(idx, idx + 1)} className="rounded p-0.5 text-text-muted hover:bg-surface-2 disabled:opacity-30">▼</button>
                      <button onClick={() => deleteRow(idx)} className="rounded p-0.5 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors text-[12px]">✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Region (Country) Select with flags ──
function RegionSelect({ value, onChange, t }: { value: string; onChange: (v: string) => void; t: (k: string) => string }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [dropUp, setDropUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isZh = t("common.yes" as any) === "是";

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(""); } };
    if (open) { document.addEventListener("mousedown", handler); return () => document.removeEventListener("mousedown", handler); }
  }, [open]);

  // Detect if dropdown should open upward
  useEffect(() => {
    if (open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setDropUp(spaceBelow < 250);
    }
  }, [open]);

  const filtered = COUNTRIES.filter((c) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return c.en.toLowerCase().includes(s) || c.zh.includes(s) || c.code.toLowerCase().includes(s);
  });

  const selected = COUNTRIES.find((c) => c.code === value);
  const displayLabel = selected ? `${selected.flag} ${isZh ? selected.zh : selected.en} (${selected.code})` : value || "—";

  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen(!open)}
        className={`flex items-center rounded-lg border bg-surface-2 px-3 py-2 min-h-[38px] cursor-pointer transition-colors ${open ? "border-accent ring-1 ring-accent/30" : "border-border"}`}>
        {open ? (
          <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={isZh ? "搜索国家/地区..." : "Search country/region..."}
            className="flex-1 bg-transparent text-[13px] text-text-primary outline-none placeholder:text-text-muted" />
        ) : (
          <span className="text-[13px] text-text-primary flex-1">{displayLabel}</span>
        )}
        <svg className="h-4 w-4 text-text-muted shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </div>
      {open && (
        <div className={`absolute z-[60] max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-surface-1 py-1 shadow-lg ${dropUp ? "bottom-full mb-1" : "top-full mt-1"}`}>
          <button type="button" onClick={() => { onChange(""); setOpen(false); setSearch(""); }}
            className={`flex w-full items-center gap-2 px-3 py-2 text-[13px] text-left transition-colors ${!value ? "text-accent bg-accent/5" : "text-text-muted hover:bg-surface-2"}`}>—</button>
          {filtered.map((c) => (
            <button key={c.code} type="button" onClick={() => { onChange(c.code); setOpen(false); setSearch(""); }}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-left transition-colors ${c.code === value ? "text-accent bg-accent/5 font-medium" : "text-text-primary hover:bg-surface-2"}`}>
              <span className="text-base">{c.flag}</span>
              <span>{isZh ? c.zh : c.en} ({c.code})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Editable Addresses Table ──
function AddressesTable({ items, onChange, t }: {
  items: { label?: string; addressLine1?: string; addressLine2?: string; city?: string; state?: string; zipCode?: string; region?: string }[];
  onChange: (v: typeof items) => void;
  t: (k: string) => string;
}) {
  const addRow = () => onChange([...items, { label: "", addressLine1: "", addressLine2: "", city: "", state: "", zipCode: "", region: "" }]);
  const updateField = (idx: number, key: string, value: string) => { const next = [...items]; next[idx] = { ...next[idx], [key]: value }; onChange(next); };
  const deleteRow = (idx: number) => onChange(items.filter((_, i) => i !== idx));

  const ic = "w-full rounded-lg border border-border bg-surface-2 px-2 py-1 text-[12px] text-text-primary outline-none focus:border-accent transition-colors";

  return (
    <div className="rounded-xl border border-border bg-surface-1 overflow-visible">
      <div className="px-4 py-2.5 border-b border-border-subtle bg-surface-2/30 flex items-center gap-2">
        <span className="text-[12px] font-semibold text-text-primary">{t("users.field.addresses" as any)}</span>
        <button onClick={addRow} className="rounded-lg bg-accent px-2 py-0.5 text-[11px] font-medium text-white hover:bg-accent-hover transition-colors">{t("common.add")}</button>
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12px] text-text-muted">{t("common.noData")}</div>
      ) : (
        <div className="overflow-visible">
          <table className="w-full text-left" style={{ minWidth: "max-content" }}>
            <thead><tr className="border-b border-border bg-surface-2/30">
              <th className="px-3 py-1.5 text-[11px] font-semibold uppercase text-text-muted">{t("users.addr.label" as any)}</th>
              <th className="px-3 py-1.5 text-[11px] font-semibold uppercase text-text-muted">{t("users.field.address1" as any)}</th>
              <th className="px-3 py-1.5 text-[11px] font-semibold uppercase text-text-muted">{t("users.field.address2" as any)}</th>
              <th className="px-3 py-1.5 text-[11px] font-semibold uppercase text-text-muted">{t("users.addr.city" as any)}</th>
              <th className="px-3 py-1.5 text-[11px] font-semibold uppercase text-text-muted">{t("users.addr.state" as any)}</th>
              <th className="px-3 py-1.5 text-[11px] font-semibold uppercase text-text-muted">{t("users.addr.zipCode" as any)}</th>
              <th className="px-3 py-1.5 text-[11px] font-semibold uppercase text-text-muted">{t("users.addr.region" as any)}</th>
              <th className="px-3 py-1.5 text-[11px] font-semibold uppercase text-text-muted w-16">{t("common.action" as any)}</th>
            </tr></thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx} className="border-b border-border-subtle">
                  <td className="px-3 py-1.5"><input value={item.label ?? ""} onChange={(e) => updateField(idx, "label", e.target.value)} className={ic} /></td>
                  <td className="px-3 py-1.5"><input value={item.addressLine1 ?? ""} onChange={(e) => updateField(idx, "addressLine1", e.target.value)} className={ic} /></td>
                  <td className="px-3 py-1.5"><input value={item.addressLine2 ?? ""} onChange={(e) => updateField(idx, "addressLine2", e.target.value)} className={ic} /></td>
                  <td className="px-3 py-1.5"><input value={item.city ?? ""} onChange={(e) => updateField(idx, "city", e.target.value)} className={ic} /></td>
                  <td className="px-3 py-1.5"><input value={item.state ?? ""} onChange={(e) => updateField(idx, "state", e.target.value)} className={ic} /></td>
                  <td className="px-3 py-1.5"><input value={item.zipCode ?? ""} onChange={(e) => updateField(idx, "zipCode", e.target.value)} className={ic} /></td>
                  <td className="px-3 py-1.5" style={{ minWidth: "180px" }}><RegionSelect value={item.region ?? ""} onChange={(v) => updateField(idx, "region", v)} t={t} /></td>
                  <td className="px-3 py-1.5">
                    <button onClick={() => deleteRow(idx)} className="rounded p-0.5 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors text-[12px]">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
