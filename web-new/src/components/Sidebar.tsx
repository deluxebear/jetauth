import { NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  LayoutDashboard, Users, Building2, AppWindow, KeyRound, ShieldCheck,
  ScrollText, Globe, Globe2, Plug, FileKey2, ChevronLeft, ChevronRight, Lock,
  CreditCard, Boxes, ShoppingBag, ShoppingCart, CalendarCheck, Tag, BookOpen, Receipt,
  ArrowLeftRight, Monitor, MailPlus, FolderOpen, Key, Database, Gavel,
  Bot, Server, Store, FileInput, Scale, BadgeCheck, Info, FileText,
  RefreshCw, Webhook, Zap, Ticket, FileCode,
} from "lucide-react";
import { type ReactNode } from "react";
import { useTranslation } from "../i18n";
import { useSidebar } from "../SidebarContext";
import { navGroups } from "../navConfig";
import { isGlobalAdmin, isLocalAdmin, type Account } from "../utils/auth";

// Map iconName string → React element
const iconMap: Record<string, ReactNode> = {
  LayoutDashboard: <LayoutDashboard size={18} />,
  Users: <Users size={18} />,
  Building2: <Building2 size={18} />,
  AppWindow: <AppWindow size={18} />,
  KeyRound: <KeyRound size={18} />,
  ShieldCheck: <ShieldCheck size={18} />,
  ScrollText: <ScrollText size={18} />,
  Globe: <Globe size={18} />,
  Globe2: <Globe2 size={18} />,
  Plug: <Plug size={18} />,
  FileKey2: <FileKey2 size={18} />,
  Lock: <Lock size={18} />,
  CreditCard: <CreditCard size={18} />,
  Boxes: <Boxes size={18} />,
  ShoppingBag: <ShoppingBag size={18} />,
  ShoppingCart: <ShoppingCart size={18} />,
  CalendarCheck: <CalendarCheck size={18} />,
  Tag: <Tag size={18} />,
  BookOpen: <BookOpen size={18} />,
  Receipt: <Receipt size={18} />,
  ArrowLeftRight: <ArrowLeftRight size={18} />,
  Monitor: <Monitor size={18} />,
  MailPlus: <MailPlus size={18} />,
  FolderOpen: <FolderOpen size={18} />,
  Key: <Key size={18} />,
  Database: <Database size={18} />,
  Gavel: <Gavel size={18} />,
  Bot: <Bot size={18} />,
  Server: <Server size={18} />,
  Store: <Store size={18} />,
  Storefront: <Store size={18} />,
  FileInput: <FileInput size={18} />,
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

export default function Sidebar({ account }: { account?: Account | null }) {
  const { collapsed, toggle, width } = useSidebar();
  const location = useLocation();
  const { t } = useTranslation();

  const isGA = isGlobalAdmin(account);
  const isLA = isLocalAdmin(account);

  // Filter nav groups based on user permissions
  const filteredGroups = navGroups
    .filter((group) => {
      if (GLOBAL_ADMIN_GROUPS.includes(group.key) && !isGA) return false;
      return true;
    })
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (GLOBAL_ADMIN_ITEMS.includes(item.to) && !isGA) return false;
        if (LOCAL_ADMIN_ITEMS.includes(item.to) && !isLA) return false;
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <motion.aside
      initial={false}
      animate={{ width }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className="fixed left-0 top-0 bottom-0 z-30 flex flex-col border-r border-border bg-surface-1"
    >
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 px-4 border-b border-border-subtle">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent font-bold text-sm font-mono">
          C
        </div>
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm font-semibold tracking-tight text-text-primary"
          >
            JetAuth
          </motion.span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {filteredGroups.map((group) => (
          <div key={group.key} className="mb-4">
            {!collapsed && (
              <div className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
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
                  <span className="shrink-0">{iconMap[item.iconName] ?? <Globe size={18} />}</span>
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
