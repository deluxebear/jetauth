// Shared navigation structure — used by both Sidebar and Organization NavItem editor.
// Single source of truth: add a menu item here → it appears in sidebar AND in the org nav tree.

import type { TranslationKeys } from "./locales/en";

export interface NavItemDef {
  to: string;         // route path, also used as tree node key
  labelKey: TranslationKeys;
  iconName: string;   // lucide icon name, resolved in Sidebar
}

export interface NavGroupDef {
  key: string;        // tree node key for the group, e.g. "/identity-top"
  labelKey: TranslationKeys;
  items: NavItemDef[];
}

export const navGroups: NavGroupDef[] = [
  {
    key: "/overview-top",
    labelKey: "nav.overview",
    items: [
      { to: "/", labelKey: "nav.dashboard", iconName: "LayoutDashboard" },
    ],
  },
  {
    key: "/identity-top",
    labelKey: "nav.identity",
    items: [
      { to: "/organizations", labelKey: "nav.organizations", iconName: "Building2" },
      { to: "/groups", labelKey: "nav.groups", iconName: "Boxes" },
      { to: "/users", labelKey: "nav.users", iconName: "Users" },
      { to: "/invitations", labelKey: "nav.invitations", iconName: "MailPlus" },
    ],
  },
  {
    key: "/authentication-top",
    labelKey: "nav.authentication",
    items: [
      { to: "/applications", labelKey: "nav.applications", iconName: "AppWindow" },
      { to: "/providers", labelKey: "nav.providers", iconName: "Plug" },
      { to: "/resources", labelKey: "nav.resources", iconName: "FolderOpen" },
      { to: "/certs", labelKey: "nav.certificates", iconName: "FileKey2" },
      { to: "/keys", labelKey: "nav.keys", iconName: "Key" },
    ],
  },
  {
    key: "/authorization-top",
    labelKey: "nav.authorization",
    items: [
      { to: "/roles", labelKey: "nav.roles", iconName: "KeyRound" },
      { to: "/permissions", labelKey: "nav.permissions", iconName: "ShieldCheck" },
      { to: "/models", labelKey: "nav.models", iconName: "Lock" },
      { to: "/adapters", labelKey: "nav.adapters", iconName: "Database" },
      { to: "/enforcers", labelKey: "nav.enforcers", iconName: "Gavel" },
    ],
  },
  {
    key: "/llmai-top",
    labelKey: "nav.llmAi",
    items: [
      { to: "/agents", labelKey: "nav.agents", iconName: "Bot" },
      { to: "/servers", labelKey: "nav.mcpServers", iconName: "Server" },
      { to: "/server-store", labelKey: "nav.mcpStore", iconName: "Store" },
      { to: "/entries", labelKey: "nav.entries", iconName: "FileInput" },
      { to: "/sites", labelKey: "nav.sites", iconName: "Globe2" },
      { to: "/rules", labelKey: "nav.rules", iconName: "Scale" },
    ],
  },
  {
    key: "/audit-top",
    labelKey: "nav.audit",
    items: [
      { to: "/sessions", labelKey: "nav.sessions", iconName: "Monitor" },
      { to: "/records", labelKey: "nav.records", iconName: "ScrollText" },
      { to: "/tokens", labelKey: "nav.tokens", iconName: "Globe" },
      { to: "/verifications", labelKey: "nav.verifications", iconName: "BadgeCheck" },
    ],
  },
  {
    key: "/business-top",
    labelKey: "nav.business",
    items: [
      { to: "/product-store", labelKey: "nav.productStore", iconName: "Storefront" },
      { to: "/products", labelKey: "nav.products", iconName: "ShoppingBag" },
      { to: "/cart", labelKey: "nav.cart", iconName: "ShoppingCart" },
      { to: "/orders", labelKey: "nav.orders", iconName: "Receipt" },
      { to: "/payments", labelKey: "nav.payments", iconName: "CreditCard" },
      { to: "/plans", labelKey: "nav.plans", iconName: "CalendarCheck" },
      { to: "/pricings", labelKey: "nav.pricings", iconName: "Tag" },
      { to: "/subscriptions", labelKey: "nav.subscriptions", iconName: "BookOpen" },
      { to: "/transactions", labelKey: "nav.transactions", iconName: "ArrowLeftRight" },
    ],
  },
  {
    key: "/admin-top",
    labelKey: "nav.admin",
    items: [
      { to: "/sysinfo", labelKey: "nav.sysInfo", iconName: "Info" },
      { to: "/forms", labelKey: "nav.forms", iconName: "FileText" },
      { to: "/syncers", labelKey: "nav.syncers", iconName: "RefreshCw" },
      { to: "/webhooks", labelKey: "nav.webhooks", iconName: "Webhook" },
      { to: "/webhook-events", labelKey: "nav.webhookEvents", iconName: "Zap" },
      { to: "/tickets", labelKey: "nav.tickets", iconName: "Ticket" },
      { to: "/swagger", labelKey: "nav.swagger", iconName: "FileCode" },
    ],
  },
];

// Widget items — for the organization widget tree editor
export interface WidgetItemDef {
  key: string;
  labelKey: TranslationKeys;
}

export const widgetItems: WidgetItemDef[] = [
  { key: "tour", labelKey: "widgetTree.tour" as TranslationKeys },
  { key: "ai-assistant", labelKey: "widgetTree.aiAssistant" as TranslationKeys },
  { key: "language", labelKey: "widgetTree.language" as TranslationKeys },
  { key: "theme", labelKey: "widgetTree.theme" as TranslationKeys },
];
