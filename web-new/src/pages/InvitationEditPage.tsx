import { useEffect, useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Trash2, Copy, Send, LogOut, RefreshCw } from "lucide-react";
import StickyEditHeader from "../components/StickyEditHeader";
import { FormField, FormSection, Switch, inputClass, monoInputClass } from "../components/FormSection";
import SimpleSelect from "../components/SimpleSelect";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useOrganization } from "../OrganizationContext";
import * as InvBackend from "../backend/InvitationBackend";
import * as AppBackend from "../backend/ApplicationBackend";
import * as GroupBackend from "../backend/GroupBackend";
import type { Invitation } from "../backend/InvitationBackend";
import { friendlyError } from "../utils/errorHelper";
import SaveButton from "../components/SaveButton";
import UnsavedBanner from "../components/UnsavedBanner";
import { useUnsavedWarning } from "../hooks/useUnsavedWarning";

// ---------------------------------------------------------------------------
// Obfuscation helpers
// ---------------------------------------------------------------------------
type CharSet = "alphanumeric" | "numbers" | "letters";

const CHAR_POOLS: Record<CharSet, string> = {
  alphanumeric: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  numbers: "0123456789",
  letters: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
};

function randomChars(length: number, charSet: CharSet): string {
  const pool = CHAR_POOLS[charSet];
  let result = "";
  for (let i = 0; i < length; i++) {
    result += pool[Math.floor(Math.random() * pool.length)];
  }
  return result;
}

/** Build a regex pattern from obfuscation settings */
function buildRegex(coreCode: string, prefixLen: number, suffixLen: number, charSet: CharSet): string {
  const charClass = charSet === "numbers" ? "[0-9]" : charSet === "letters" ? "[a-zA-Z]" : "[a-zA-Z0-9]";
  const prefix = prefixLen > 0 ? `${charClass}{${prefixLen}}` : "";
  const suffix = suffixLen > 0 ? `${charClass}{${suffixLen}}` : "";
  return `${prefix}${coreCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${suffix}`;
}

/** Generate a defaultCode string from obfuscation settings */
function generateObfuscatedCode(coreCode: string, prefixLen: number, suffixLen: number, charSet: CharSet): string {
  return `${randomChars(prefixLen, charSet)}${coreCode}${randomChars(suffixLen, charSet)}`;
}

/** Try to parse existing regex back into obfuscation settings */
function parseRegexToSettings(regex: string, _coreCode: string): { prefixLen: number; suffixLen: number; charSet: CharSet } | null {
  // Patterns like [a-zA-Z0-9]{3}coreCode[a-zA-Z0-9]{4}
  const match = regex.match(/^(?:\[[\w-]+\]\{(\d+)\})?(.+?)(?:\[[\w-]+\]\{(\d+)\})?$/);
  if (!match) return null;
  const prefixLen = match[1] ? parseInt(match[1]) : 0;
  const suffixLen = match[3] ? parseInt(match[3]) : 0;
  let charSet: CharSet = "alphanumeric";
  if (regex.includes("[0-9]") && !regex.includes("a-z")) charSet = "numbers";
  else if (regex.includes("[a-zA-Z]") && !regex.includes("0-9")) charSet = "letters";
  return { prefixLen, suffixLen, charSet };
}

// ---------------------------------------------------------------------------
// SearchableSelect – reusable inline dropdown
// ---------------------------------------------------------------------------
function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = options.filter(
    (o) =>
      o.label.toLowerCase().includes(search.toLowerCase()) ||
      o.value.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="relative" ref={ref}>
      <input
        value={open ? search : options.find((o) => o.value === value)?.label || value}
        onChange={(e) => {
          setSearch(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setSearch("");
          setOpen(true);
        }}
        className={inputClass}
        placeholder={placeholder}
      />
      {open && (
        <div className="absolute left-0 top-full mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-border bg-surface-0 py-1 shadow-lg z-50">
          {filtered.map((o) => (
            <button
              key={o.value}
              onClick={() => {
                onChange(o.value);
                setSearch("");
                setOpen(false);
              }}
              className={`flex w-full items-center px-3 py-2 text-[13px] transition-colors ${
                value === o.value
                  ? "text-accent bg-accent/5 font-medium"
                  : "text-text-secondary hover:bg-surface-2"
              }`}
            >
              {o.label}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-[13px] text-text-muted">{t("common.noResults" as any)}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function InvitationEditPage() {
  const { owner, name } = useParams<{ owner: string; name: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAddMode, setIsAddMode] = useState((location.state as any)?.mode === "add");
  const { t } = useTranslation();
  const modal = useModal();
  const queryClient = useQueryClient();
  const { orgOptions, isGlobalAdmin } = useOrganization();
  const [inv, setInv] = useState<Invitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (saved) { const t = setTimeout(() => setSaved(false), 1500); return () => clearTimeout(t); } }, [saved]);
  const [sendEmails, setSendEmails] = useState("");
  const [sending, setSending] = useState(false);
  const [originalJson, setOriginalJson] = useState("");

  // --- Obfuscation settings ------------------------------------------------
  const [obfuscate, setObfuscate] = useState(false);
  const [coreCode, setCoreCode] = useState(""); // extracted plain string, kept in sync
  const [prefixLen, setPrefixLen] = useState(0);
  const [suffixLen, setSuffixLen] = useState(0);
  const [charSet, setCharSet] = useState<CharSet>("alphanumeric");

  // --- Org autocomplete ---------------------------------------------------
  const [orgSearch, setOrgSearch] = useState("");
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  const orgDropdownRef = useRef<HTMLDivElement>(null);

  const filteredOrgs = orgOptions.filter(
    (o) =>
      o.name.toLowerCase().includes(orgSearch.toLowerCase()) ||
      (o.displayName || "").toLowerCase().includes(orgSearch.toLowerCase()),
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (orgDropdownRef.current && !orgDropdownRef.current.contains(e.target as Node))
        setOrgDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // --- Applications & Groups for current org ------------------------------
  const [apps, setApps] = useState<{ name: string; displayName: string }[]>([]);
  const [groups, setGroups] = useState<{ name: string; displayName: string }[]>([]);

  useEffect(() => {
    if (!inv?.owner) return;
    AppBackend.getApplicationsByOrganization({
      owner: "admin",
      organization: inv.owner,
      p: 1,
      pageSize: 100,
    }).then((res) => {
      if (res.status === "ok" && Array.isArray(res.data)) setApps(res.data);
    });
  }, [inv?.owner]);

  useEffect(() => {
    if (!inv?.owner) return;
    GroupBackend.getGroups({ owner: inv.owner, p: 1, pageSize: 100 }).then((res) => {
      if (res.status === "ok" && Array.isArray(res.data)) setGroups(res.data);
    });
  }, [inv?.owner]);

  const invalidateList = () => queryClient.invalidateQueries({ queryKey: ["invitations"] });

  const fetchData = useCallback(async () => {
    if (!owner || !name) return;
    setLoading(true);
    try {
      const res = await InvBackend.getInvitation(owner, name);
      if (res.status === "ok" && res.data) {
        setInv(res.data);
        setOriginalJson(JSON.stringify(res.data));
        // Detect if existing code uses obfuscation (regex)
        if (res.data.code && /[.*+?^${}()|[\]\\]/.test(res.data.code)) {
          setObfuscate(true);
          // Extract core code: strip regex parts to get the literal chars
          const extractedCore = (res.data.code || "").replace(/\[[\w-]+\]\{\d+,?\d*\}/g, "").replace(/\\(.)/g, "$1");
          setCoreCode(extractedCore);
          const parsed = parseRegexToSettings(res.data.code, extractedCore);
          if (parsed) {
            setPrefixLen(parsed.prefixLen);
            setSuffixLen(parsed.suffixLen);
            setCharSet(parsed.charSet);
          }
        } else {
          setCoreCode(res.data.code || "");
        }
      } else {
        modal.showError(res.msg || t("invitations.loadFailed" as any));
        navigate("/invitations");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [owner, name, navigate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const isDirty = !!inv && originalJson !== "" && JSON.stringify(inv) !== originalJson;
  const showBanner = useUnsavedWarning({ isAddMode, isDirty });

  if (loading || !inv) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  const set = <K extends keyof Invitation>(key: K, val: Invitation[K]) =>
    setInv((prev) => (prev ? { ...prev, [key]: val } : prev));

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await InvBackend.updateInvitation(owner!, name!, inv);
      if (res.status === "ok") {
        invalidateList();
        if (inv.name !== name) {
          navigate(`/invitations/${inv.owner}/${inv.name}`, { replace: true });
        }
        modal.toast(t("common.saveSuccess" as any));
        setSaved(true);
        setIsAddMode(false);
        setOriginalJson(JSON.stringify(inv));
      } else {
        modal.toast(friendlyError(res.msg, t) || t("common.saveFailed" as any), "error");
      }
    } catch (e: any) {
      modal.toast(e.message || t("common.saveFailed" as any), "error");
    } finally {
      setSaving(false);
    }
  };
  const handleSaveAndExit = async () => {
    setSaving(true);
    try {
      const res = await InvBackend.updateInvitation(owner!, name!, inv);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        invalidateList();
        navigate("/invitations");
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
      await InvBackend.deleteInvitation(inv);
      invalidateList();
    }
    navigate("/invitations");
  };

  const handleDelete = async () => {
    modal.showConfirm(
      `${t("common.confirmDelete")} [${inv.displayName || inv.name}]`,
      async () => {
        try {
          const res = await InvBackend.deleteInvitation(inv);
          if (res.status === "ok") {
            invalidateList();
            navigate("/invitations");
          } else {
            modal.showError(res.msg || t("common.deleteFailed" as any));
          }
        } catch (e) {
          console.error(e);
        }
      },
    );
  };

  const handleCopySignupLink = () => {
    const app = inv.application === "All" ? "" : inv.application;
    const defaultApp = app || "app-built-in";
    const url = `${window.location.origin}/signup/${defaultApp}?invitationCode=${inv.defaultCode || inv.code}`;
    navigator.clipboard.writeText(url);
    modal.toast(t("common.copySuccess" as any));
  };

  const handleSendEmail = async () => {
    const emails = sendEmails
      .split(/[\n,;]+/)
      .map((e) => e.trim())
      .filter((e) => e.length > 0);
    if (emails.length === 0) {
      modal.showError(t("invitations.enterEmail" as any));
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = emails.filter((e) => !emailRegex.test(e));
    if (invalidEmails.length > 0) {
      modal.showError(t("invitations.invalidEmail" as any, { emails: invalidEmails.join(", ") }));
      return;
    }
    const remaining = inv.quota - inv.usedCount;
    if (emails.length > remaining) {
      modal.showError(t("invitations.emailExceedQuota" as any, { count: emails.length, remaining }));
      return;
    }
    modal.showConfirm(t("invitations.sendConfirm" as any, { count: emails.length }), async () => {
      setSending(true);
      try {
        const res = await InvBackend.sendInvitation(inv, emails);
        if (res.status === "ok") {
          modal.toast(t("common.sendSuccess" as any));
          setSendEmails("");
        } else {
          modal.toast(res.msg || t("common.sendFailed" as any), "error");
        }
      } catch (e: any) {
        modal.toast(e.message || t("common.sendFailed" as any), "error");
      } finally {
        setSending(false);
      }
    });
  };

  // --- Obfuscation helpers -------------------------------------------------
  const handleObfuscateToggle = (enabled: boolean) => {
    setObfuscate(enabled);
    // Use current code as the core (it's plain text when obfuscation was off)
    const core = enabled ? (inv?.code || "") : coreCode;
    if (enabled) {
      const pLen = prefixLen || 3;
      const sLen = suffixLen || 3;
      setPrefixLen(pLen);
      setSuffixLen(sLen);
      setCoreCode(core);
      set("code", buildRegex(core, pLen, sLen, charSet));
      set("defaultCode", generateObfuscatedCode(core, pLen, sLen, charSet));
    } else {
      // Restore plain code from core
      set("code", core);
      set("defaultCode", core);
    }
  };

  /** Called when any obfuscation param changes — rebuilds code + defaultCode */
  const rebuildObfuscation = (core: string, pLen: number, sLen: number, cs: CharSet) => {
    setCoreCode(core);
    set("code", buildRegex(core, pLen, sLen, cs));
    set("defaultCode", generateObfuscatedCode(core, pLen, sLen, cs));
  };

  const handleRegenerateDefault = () => {
    if (obfuscate) {
      set("defaultCode", generateObfuscatedCode(coreCode, prefixLen, suffixLen, charSet));
    }
  };

  const isCreatedByPlan = !!inv.isCreatedByPlan;

  // --- Dropdown options ----------------------------------------------------
  const appOptions: { value: string; label: string }[] = [
    { value: "All", label: t("common.all" as any) },
    ...apps.map((a) => ({
      value: a.name,
      label: a.displayName ? `${a.displayName} (${a.name})` : a.name,
    })),
  ];

  const groupOptions: { value: string; label: string }[] = [
    { value: "", label: `-- ${t("common.none" as any)} --` },
    ...groups.map((g) => ({
      value: g.name,
      label: g.displayName ? `${g.displayName} (${g.name})` : g.name,
    })),
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5 "
    >
      <StickyEditHeader
        title={`${isAddMode ? t("common.add") : t("common.edit")} ${t("invitations.title" as any)}`}
        subtitle={`${owner}/${name}`}
        onBack={handleBack}
      >
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-2 text-[13px] font-medium text-danger hover:bg-danger/10 transition-colors"
          >
            <Trash2 size={14} /> {t("common.delete")}
          </button>
          <SaveButton onClick={handleSave} saving={saving} saved={saved} label={t("common.save")} />
          <button
            onClick={handleSaveAndExit}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            ) : (
              <LogOut size={14} />
            )}
            {t("common.saveAndExit" as any)}
          </button>
      </StickyEditHeader>

      {showBanner && <UnsavedBanner isAddMode={isAddMode} />}

      {/* Basic Info */}
      <FormSection title={t("invitations.section.basic" as any)}>
        {/* Organization - searchable dropdown */}
        <FormField label={t("field.owner")}>
          <div className="relative" ref={orgDropdownRef}>
            <input
              value={
                orgDropdownOpen
                  ? orgSearch
                  : orgOptions.find((o) => o.name === inv.owner)?.displayName ||
                    inv.owner
              }
              disabled={isCreatedByPlan || !isGlobalAdmin}
              onChange={(e) => {
                setOrgSearch(e.target.value);
                setOrgDropdownOpen(true);
              }}
              onFocus={() => {
                if (!isGlobalAdmin) return;
                setOrgSearch("");
                setOrgDropdownOpen(true);
              }}
              className={inputClass}
            />
            {orgDropdownOpen && (
              <div className="absolute left-0 top-full mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-border bg-surface-0 py-1 shadow-lg z-50">
                {filteredOrgs.map((o) => (
                  <button
                    key={o.name}
                    onClick={() => {
                      set("owner", o.name);
                      setOrgSearch("");
                      setOrgDropdownOpen(false);
                    }}
                    className={`flex w-full items-center px-3 py-2 text-[13px] transition-colors ${
                      inv.owner === o.name
                        ? "text-accent bg-accent/5 font-medium"
                        : "text-text-secondary hover:bg-surface-2"
                    }`}
                  >
                    {o.displayName ? `${o.displayName} (${o.name})` : o.name}
                  </button>
                ))}
                {filteredOrgs.length === 0 && (
                  <div className="px-3 py-2 text-[13px] text-text-muted">{t("common.noResults" as any)}</div>
                )}
              </div>
            )}
          </div>
        </FormField>

        <FormField label={t("field.name")} required>
          <input
            value={inv.name}
            disabled={isCreatedByPlan}
            onChange={(e) => set("name", e.target.value)}
            className={monoInputClass}
          />
        </FormField>
        <FormField label={t("field.displayName")}>
          <input
            value={inv.displayName ?? ""}
            onChange={(e) => set("displayName", e.target.value)}
            className={inputClass}
          />
        </FormField>

        {/* Invitation Code */}
        <FormField label={t("invitations.field.code" as any)} span="full">
          <div className="space-y-3">
            {/* Main code input — always editable */}
            <input
              value={obfuscate ? coreCode : (inv.code ?? "")}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/[^a-zA-Z0-9]/g, "");
                setCoreCode(cleaned);
                if (obfuscate) {
                  rebuildObfuscation(cleaned, prefixLen, suffixLen, charSet);
                } else {
                  set("code", cleaned);
                  set("defaultCode", cleaned);
                }
              }}
              placeholder={t("help.onlyAlphanumeric" as any)}
              className={monoInputClass}
            />

            {/* Show constructed regex when obfuscation is on */}
            {obfuscate && inv.code && (
              <div className="rounded-lg bg-surface-2/50 px-3 py-2 font-mono text-[12px] text-text-muted break-all">
                {inv.code}
              </div>
            )}

            {/* Obfuscation toggle */}
            <div className="flex items-center gap-3 py-1">
              <Switch checked={obfuscate} onChange={handleObfuscateToggle} />
              <div>
                <span className="text-[13px] font-medium text-text-primary">{t("invitations.obfuscate" as any)}</span>
                <p className="text-[11px] text-text-muted mt-0.5">{t("invitations.obfuscateHelp" as any)}</p>
              </div>
            </div>

            {/* Obfuscation settings — only when enabled */}
            {obfuscate && (
              <div className="rounded-lg border border-border-subtle bg-surface-2/30 p-4 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-text-muted mb-1">{t("invitations.obfuscate.prefix" as any)}</label>
                    <input type="number" min={0} max={20} value={prefixLen}
                      onChange={(e) => { const v = Math.max(0, Number(e.target.value)); setPrefixLen(v); rebuildObfuscation(coreCode, v, suffixLen, charSet); }}
                      className={`${monoInputClass} w-full`} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-text-muted mb-1">{t("invitations.obfuscate.suffix" as any)}</label>
                    <input type="number" min={0} max={20} value={suffixLen}
                      onChange={(e) => { const v = Math.max(0, Number(e.target.value)); setSuffixLen(v); rebuildObfuscation(coreCode, prefixLen, v, charSet); }}
                      className={`${monoInputClass} w-full`} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-text-muted mb-1">{t("invitations.obfuscate.charType" as any)}</label>
                    <SimpleSelect value={charSet}
                      options={[
                        { value: "alphanumeric", label: t("invitations.charType.alphanumeric" as any) },
                        { value: "numbers", label: t("invitations.charType.numbers" as any) },
                        { value: "letters", label: t("invitations.charType.letters" as any) },
                      ]}
                      onChange={(v) => { setCharSet(v as CharSet); rebuildObfuscation(coreCode, prefixLen, suffixLen, v as CharSet); }}
                      className="w-full" />
                  </div>
                </div>
                {/* Visual preview */}
                <div className="flex items-center gap-1.5 text-[12px] font-mono">
                  {prefixLen > 0 && <span className="rounded bg-warning/15 text-warning px-1.5 py-0.5">{randomChars(prefixLen, charSet)}</span>}
                  <span className="rounded bg-accent/15 text-accent px-1.5 py-0.5 font-semibold">{coreCode || "code"}</span>
                  {suffixLen > 0 && <span className="rounded bg-warning/15 text-warning px-1.5 py-0.5">{randomChars(suffixLen, charSet)}</span>}
                </div>
              </div>
            )}
          </div>
        </FormField>

        {/* Default Code (auto-generated) */}
        <FormField label={t("invitations.field.defaultCode" as any)} span="full">
          <div className="flex gap-2">
            <input value={inv.defaultCode || ""} readOnly className={`${monoInputClass} flex-1 bg-surface-3 cursor-default`} />
            {obfuscate && (
              <button onClick={handleRegenerateDefault}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[13px] text-text-muted hover:bg-surface-2 transition-colors"
                title={t("invitations.regenerate" as any)}>
                <RefreshCw size={14} />
              </button>
            )}
          </div>
        </FormField>
      </FormSection>

      {/* Signup Link & Send */}
      <FormSection title={t("invitations.section.link" as any)}>
        <FormField label={t("invitations.field.signupUrl" as any)} span="full">
          <div className="flex gap-2">
            <input
              value={`${window.location.origin}/signup/${inv.application === "All" ? "app-built-in" : inv.application}?invitationCode=${inv.defaultCode || inv.code}`}
              readOnly
              className={`${monoInputClass} flex-1 text-[11px]`}
            />
            <button
              onClick={handleCopySignupLink}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[13px] font-medium text-text-secondary hover:bg-surface-2 transition-colors"
            >
              <Copy size={14} />
              {t("common.copy" as any)}
            </button>
          </div>
        </FormField>
        <FormField
          label={t("invitations.field.sendEmails" as any)}
          span="full"
          help={t("invitations.field.sendEmails.help" as any)}
        >
          <div className="flex gap-2 items-start">
            <textarea
              value={sendEmails}
              onChange={(e) => setSendEmails(e.target.value)}
              rows={3}
              className={`${inputClass} flex-1`}
              placeholder={"user1@example.com\nuser2@example.com"}
            />
            <button
              onClick={handleSendEmail}
              disabled={sending || !sendEmails.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {sending ? (
                <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                <Send size={14} />
              )}
              {t("common.send" as any)}
            </button>
          </div>
        </FormField>
      </FormSection>

      {/* Limits & Application */}
      <FormSection title={t("invitations.section.limits" as any)}>
        <FormField label={t("invitations.field.quota" as any)}>
          <input
            type="number"
            value={inv.quota ?? 1}
            onChange={(e) => set("quota", Number(e.target.value))}
            min={0}
            className={monoInputClass}
          />
        </FormField>
        <FormField label={t("invitations.field.usedCount" as any)}>
          <input
            type="number"
            value={inv.usedCount ?? 0}
            onChange={(e) =>
              set("usedCount", Math.min(Number(e.target.value), inv.quota))
            }
            min={0}
            max={inv.quota}
            className={monoInputClass}
          />
        </FormField>
        <FormField label={t("invitations.field.application" as any)}>
          <SearchableSelect
            value={inv.application ?? "All"}
            onChange={(v) => set("application", v)}
            options={appOptions}
            placeholder={t("common.all" as any)}
          />
        </FormField>
        <FormField label={t("invitations.field.signupGroup" as any)}>
          <SearchableSelect
            value={inv.signupGroup ?? ""}
            onChange={(v) => set("signupGroup", v)}
            options={groupOptions}
            placeholder={t("invitations.selectGroup" as any)}
          />
        </FormField>
      </FormSection>

      {/* Pre-fill Fields */}
      <FormSection title={t("invitations.section.prefill" as any)}>
        <FormField label={t("invitations.field.username" as any)}>
          <input
            value={inv.username ?? ""}
            onChange={(e) => set("username", e.target.value)}
            className={inputClass}
          />
        </FormField>
        <FormField label={t("field.email")}>
          <input
            value={inv.email ?? ""}
            onChange={(e) => set("email", e.target.value)}
            type="email"
            className={inputClass}
          />
        </FormField>
        <FormField label={t("field.phone")}>
          <input
            value={inv.phone ?? ""}
            onChange={(e) => set("phone", e.target.value)}
            className={inputClass}
          />
        </FormField>
      </FormSection>

      {/* State */}
      <FormSection title={t("invitations.section.state" as any)}>
        <FormField label={t("field.state")}>
          <SimpleSelect
            value={inv.state ?? "Active"}
            options={[
              { value: "Active", label: t("invitations.state.active" as any) },
              { value: "Suspended", label: t("invitations.state.suspended" as any) },
            ]}
            onChange={(v) => set("state", v)}
          />
        </FormField>
      </FormSection>
    </motion.div>
  );
}
