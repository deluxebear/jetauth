import { useEffect, useState, useRef } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  LayoutDashboard, Users, Building2, AppWindow, Crown, ShieldCheck,
  ScrollText, Globe2, Plug, FileKey2, ChevronLeft, ChevronRight, Blocks,
  CreditCard, Boxes, ShoppingBag, ShoppingCart, CalendarCheck, Tag, Repeat, ClipboardList,
  ArrowLeftRight, Monitor, TicketCheck, FolderOpen, Key, Cable, Gavel,
  Bot, Server, Store, DoorOpen, Scale, BadgeCheck, Info, FileText, KeySquare,
  RefreshCw, Webhook, Zap, Ticket, FileCode, Search, Check, ChevronsUpDown,
} from "lucide-react";
import { type ReactNode } from "react";
import { useTranslation } from "../i18n";
import { useTheme } from "../theme";
import { useSidebar } from "../SidebarContext";
import { useOrganization } from "../OrganizationContext";
import { navGroups } from "../navConfig";
import { isGlobalAdmin, isLocalAdmin, type Account } from "../utils/auth";

// Map iconName string → React element
const iconMap: Record<string, ReactNode> = {
  LayoutDashboard: <LayoutDashboard size={18} />,
  Users: <Users size={18} />,
  Building2: <Building2 size={18} />,
  AppWindow: <AppWindow size={18} />,
  Crown: <Crown size={18} />,
  ShieldCheck: <ShieldCheck size={18} />,
  ScrollText: <ScrollText size={18} />,
  KeySquare: <KeySquare size={18} />,
  Globe2: <Globe2 size={18} />,
  Plug: <Plug size={18} />,
  FileKey2: <FileKey2 size={18} />,
  Blocks: <Blocks size={18} />,
  CreditCard: <CreditCard size={18} />,
  Boxes: <Boxes size={18} />,
  ShoppingBag: <ShoppingBag size={18} />,
  ShoppingCart: <ShoppingCart size={18} />,
  CalendarCheck: <CalendarCheck size={18} />,
  Tag: <Tag size={18} />,
  Repeat: <Repeat size={18} />,
  ClipboardList: <ClipboardList size={18} />,
  ArrowLeftRight: <ArrowLeftRight size={18} />,
  Monitor: <Monitor size={18} />,
  TicketCheck: <TicketCheck size={18} />,
  FolderOpen: <FolderOpen size={18} />,
  Key: <Key size={18} />,
  Cable: <Cable size={18} />,
  Gavel: <Gavel size={18} />,
  Bot: <Bot size={18} />,
  Server: <Server size={18} />,
  Store: <Store size={18} />,
  Storefront: <Store size={18} />,
  DoorOpen: <DoorOpen size={18} />,
  Scale: <Scale size={18} />,
  BadgeCheck: <BadgeCheck size={18} />,
  Info: <Info size={18} />,
  FileText: <FileText size={18} />,
  RefreshCw: <RefreshCw size={18} />,
  Webhook: <Webhook size={18} />,
  Zap: <Zap size={18} />,
  Ticket: <Ticket size={18} />,
  FileCode: <FileCode size={18} />,
};

// Admin-only groups: only visible to global admins
const GLOBAL_ADMIN_GROUPS = ["/admin-top"];
// Admin-only items: only visible to local admins
const LOCAL_ADMIN_ITEMS = ["/models", "/adapters", "/enforcers"];
// Global admin-only items
const GLOBAL_ADMIN_ITEMS = ["/sysinfo", "/swagger"];

/** Read the organization object saved by App.tsx on login */
function getStoredOrganization(): Record<string, unknown> | null {
  try {
    return JSON.parse(localStorage.getItem("organizationData") ?? "null");
  } catch {
    return null;
  }
}

/** Collect all allowed nav keys (group keys + item paths) from the org config.
 *  Returns null when not configured or "all" is in the list (= show everything).
 *  Returns empty Set when configured but nothing selected (= show nothing). */
function getAllowedKeys(items: unknown): Set<string> | null {
  if (!Array.isArray(items) || items.includes("all")) {
    return null; // not configured or explicitly "all"
  }
  return new Set(items as string[]);
}

// ── Organization Selector (sidebar top) ──
function SidebarOrgSelector({
  collapsed, isGlobalAdmin, selectedOrg, setSelectedOrg, orgOptions, t,
}: {
  collapsed: boolean;
  isGlobalAdmin: boolean;
  selectedOrg: string;
  setSelectedOrg: (org: string) => void;
  orgOptions: { name: string; displayName: string }[];
  t: (key: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [favicon, setFavicon] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(""); }
    };
    if (open) { document.addEventListener("mousedown", handler); return () => document.removeEventListener("mousedown", handler); }
  }, [open]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => searchRef.current?.focus());
  }, [open]);

  // Fetch favicon for the selected org
  useEffect(() => {
    if (selectedOrg === "All") { setFavicon(null); return; }
    // Try localStorage first (user's own org)
    try {
      const orgData = JSON.parse(localStorage.getItem("organizationData") ?? "null");
      if (orgData?.name === selectedOrg && orgData?.favicon) { setFavicon(orgData.favicon); return; }
    } catch {}
    // Fetch from API for other orgs
    fetch(`/api/get-organization?id=admin/${encodeURIComponent(selectedOrg)}`, { credentials: "include" })
      .then((r) => r.json())
      .then((res) => { if (res.status === "ok" && res.data?.favicon) setFavicon(res.data.favicon); else setFavicon(null); })
      .catch(() => setFavicon(null));
  }, [selectedOrg]);

  const currentLabel = selectedOrg === "All"
    ? t("common.all" as any)
    : orgOptions.find((o) => o.name === selectedOrg)?.displayName || selectedOrg;

  const filtered = orgOptions.filter((o) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return o.name.toLowerCase().includes(s) || (o.displayName || "").toLowerCase().includes(s);
  });

  const orgIcon = favicon
    ? <img src={favicon} alt="" className="h-[18px] w-[18px] rounded object-contain shrink-0" />
    : <Building2 size={18} className="text-text-muted shrink-0" />;

  const orgIconSmall = favicon
    ? <img src={favicon} alt="" className="h-4 w-4 rounded object-contain shrink-0" />
    : <Building2 size={16} className="text-text-muted shrink-0" />;

  // Collapsed: show icon only, click to expand dropdown
  if (collapsed) {
    return (
      <div className="px-2 py-2 border-b border-border-subtle" ref={ref}>
        <button
          onClick={() => { if (isGlobalAdmin) setOpen(!open); }}
          title={currentLabel}
          className={`flex items-center justify-center w-full h-8 rounded-lg transition-colors ${
            isGlobalAdmin ? "hover:bg-surface-2 cursor-pointer" : "cursor-default"
          }`}
        >
          {orgIcon}
        </button>
        {open && (
          <div className="absolute left-full top-14 ml-1 z-50 w-64 rounded-xl border border-border bg-surface-1 shadow-[var(--shadow-elevated)] overflow-hidden">
            <div className="p-2 border-b border-border-subtle">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                <input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("common.search" as any)}
                  className="w-full rounded-lg border border-border bg-surface-2 pl-8 pr-3 py-1.5 text-[12px] text-text-primary placeholder:text-text-muted outline-none focus:border-accent transition-colors" />
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto py-1">
              <button onClick={() => { setSelectedOrg("All"); setOpen(false); setSearch(""); }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-[13px] transition-colors ${
                  selectedOrg === "All" ? "text-accent bg-accent/8 font-medium" : "text-text-primary hover:bg-surface-2"
                }`}>
                <span className="flex-1 text-left">{t("common.all" as any)}</span>
                {selectedOrg === "All" && <Check size={14} className="text-accent shrink-0" />}
              </button>
              {filtered.map((o) => (
                <button key={o.name} onClick={() => { setSelectedOrg(o.name); setOpen(false); setSearch(""); }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-[13px] transition-colors ${
                    selectedOrg === o.name ? "text-accent bg-accent/8 font-medium" : "text-text-primary hover:bg-surface-2"
                  }`}>
                  <span className="flex-1 text-left truncate">{o.displayName || o.name}</span>
                  {selectedOrg === o.name && <Check size={14} className="text-accent shrink-0" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Expanded: full org selector
  return (
    <div className="px-2 py-2 border-b border-border-subtle" ref={ref}>
      <button
        onClick={() => { if (isGlobalAdmin) setOpen(!open); }}
        className={`flex items-center gap-2 w-full rounded-lg px-2.5 py-2 transition-colors ${
          isGlobalAdmin ? "hover:bg-surface-2 cursor-pointer" : "cursor-default"
        } ${open ? "bg-surface-2" : ""}`}
      >
        {orgIconSmall}
        <span className="text-[13px] font-medium text-text-primary truncate flex-1 text-left">{currentLabel}</span>
        {isGlobalAdmin && <ChevronsUpDown size={14} className="text-text-muted shrink-0" />}
      </button>
      {open && (
        <div className="mt-1 rounded-xl border border-border bg-surface-1 shadow-[var(--shadow-elevated)] overflow-hidden">
          <div className="p-2 border-b border-border-subtle">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              <input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={t("common.search" as any)}
                className="w-full rounded-lg border border-border bg-surface-2 pl-8 pr-3 py-1.5 text-[12px] text-text-primary placeholder:text-text-muted outline-none focus:border-accent transition-colors" />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            <button onClick={() => { setSelectedOrg("All"); setOpen(false); setSearch(""); }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-[13px] transition-colors ${
                selectedOrg === "All" ? "text-accent bg-accent/8 font-medium" : "text-text-primary hover:bg-surface-2"
              }`}>
              <span className="flex-1 text-left">{t("common.all" as any)}</span>
              {selectedOrg === "All" && <Check size={14} className="text-accent shrink-0" />}
            </button>
            {filtered.map((o) => (
              <button key={o.name} onClick={() => { setSelectedOrg(o.name); setOpen(false); setSearch(""); }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-[13px] transition-colors ${
                  selectedOrg === o.name ? "text-accent bg-accent/8 font-medium" : "text-text-primary hover:bg-surface-2"
                }`}>
                <span className="flex-1 text-left truncate">{o.displayName || o.name}</span>
                {selectedOrg === o.name && <Check size={14} className="text-accent shrink-0" />}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-center text-[12px] text-text-muted">{t("common.noResults" as any)}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ account }: { account?: Account | null }) {
  const { collapsed, toggle, width, setVisible } = useSidebar();
  const location = useLocation();
  const { t } = useTranslation();
  const { selectedOrg, setSelectedOrg, orgOptions, isGlobalAdmin: isGAOrg } = useOrganization();

  const isGA = isGlobalAdmin(account);
  const isLA = isLocalAdmin(account);

  const { theme } = useTheme();

  // Get org-level nav restrictions
  const org = getStoredOrganization();
  // Use dark logo variant when in dark mode (if available)
  const sidebarLogo = (theme === "dark" && org?.logoDark) ? org.logoDark : org?.logo;
  const allowedKeys = isGA
    ? null // global admins always see everything
    : getAllowedKeys(isLA ? org?.navItems : org?.userNavItems);

  // Filter nav groups based on user permissions + org nav settings
  const filteredGroups = navGroups
    .filter((group) => {
      if (GLOBAL_ADMIN_GROUPS.includes(group.key) && !isGA) return false;
      // If org restricts nav items, hide groups not in the allowed list
      if (allowedKeys && !allowedKeys.has(group.key)) return false;
      return true;
    })
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (GLOBAL_ADMIN_ITEMS.includes(item.to) && !isGA) return false;
        if (LOCAL_ADMIN_ITEMS.includes(item.to) && !isLA) return false;
        if (allowedKeys && !allowedKeys.has(item.to)) return false;
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);

  // Sync visibility state so Layout can remove the left margin
  const hasItems = filteredGroups.length > 0;
  useEffect(() => { setVisible(hasItems); }, [hasItems, setVisible]);

  // Hide sidebar entirely when user has no nav items
  if (!hasItems) return null;

  return (
    <motion.aside
      initial={false}
      animate={{ width }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className="fixed left-0 top-0 bottom-0 z-30 flex flex-col border-r border-border bg-surface-1"
    >
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 px-4 border-b border-border-subtle">
        {collapsed ? (
          // Collapsed: show favicon or fallback icon
          org?.favicon ? (
            <img src={String(org.favicon)} alt="" className="h-8 w-8 shrink-0 rounded-lg object-contain" />
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent font-bold text-sm font-mono">J</div>
          )
        ) : (
          // Expanded: show full logo or text fallback
          sidebarLogo ? (
            <motion.img initial={{ opacity: 0 }} animate={{ opacity: 1 }} src={String(sidebarLogo)} alt="" className="h-10 max-w-[160px] object-contain" />
          ) : (
            <>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent font-bold text-sm font-mono">J</div>
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm font-semibold tracking-tight text-text-primary">JetAuth</motion.span>
            </>
          )
        )}
      </div>

      {/* Organization Selector */}
      <SidebarOrgSelector
        collapsed={collapsed}
        isGlobalAdmin={isGAOrg}
        selectedOrg={selectedOrg}
        setSelectedOrg={setSelectedOrg}
        orgOptions={orgOptions}
        t={t}
      />

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {filteredGroups.map((group) => (
          <div key={group.key} className="mb-4">
            {!collapsed && (
              <div className="px-2 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                {t(group.labelKey)}
              </div>
            )}
            {group.items.map((item) => {
              const active =
                item.to === "/"
                  ? location.pathname === "/"
                  : location.pathname.startsWith(item.to);

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  title={collapsed ? t(item.labelKey) : undefined}
                  className={`relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors mb-0.5 ${
                    active
                      ? "text-accent bg-accent-subtle"
                      : "text-text-secondary hover:text-text-primary hover:bg-surface-2"
                  } ${collapsed ? "justify-center" : ""}`}
                >
                  <span className="shrink-0">{iconMap[item.iconName] ?? <Globe2 size={18} />}</span>
                  {!collapsed && <span>{t(item.labelKey)}</span>}
                  {active && (
                    <motion.div
                      layoutId="sidebar-indicator"
                      className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full bg-accent"
                      transition={{ type: "spring", stiffness: 500, damping: 35 }}
                    />
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={toggle}
        className="flex h-10 items-center justify-center border-t border-border-subtle text-text-muted hover:text-text-secondary transition-colors"
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </motion.aside>
  );
}
