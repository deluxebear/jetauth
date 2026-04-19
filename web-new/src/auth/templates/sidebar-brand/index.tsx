// web-new/src/auth/templates/sidebar-brand/index.tsx
//
// T05 "Sidebar Brand" — persistent lg sidebar with branding + feature list
// + footer text on the left, form on the right. Below lg the sidebar hides
// and the layout falls back to stacked Centered. Enterprise portal vibe.

/* eslint-disable react-refresh/only-export-components */

import type { TemplateMeta, TemplateProps } from "../types";

const WIDTH_MAP: Record<string, string> = {
  narrow: "lg:w-[200px]",
  standard: "lg:w-[280px]",
  wide: "lg:w-[340px]",
};

const BG_MAP: Record<string, string> = {
  surface: "bg-surface-2",
  accent: "bg-accent text-white",
  gradient: "bg-gradient-to-b from-accent/90 to-accent/50 text-white",
};

export const meta: TemplateMeta = {
  id: "sidebar-brand",
  name: { en: "Sidebar Brand", zh: "左栏品牌" },
  description: {
    en: "Narrow brand rail with feature list, form on the right. Enterprise portal.",
    zh: "左侧品牌栏含功能列表，右侧表单。企业门户风格。",
  },
  preview: "/templates/sidebar-brand.svg",
  category: "enterprise",
  defaultOptions: {
    sidebarWidth: "standard",
    sidebarBackground: "surface",
    sidebarFeatureList: [],
    sidebarFooterText: "",
  },
};

export default function SidebarBrandTemplate({ slots, options }: TemplateProps) {
  const widthClass =
    (typeof options.sidebarWidth === "string" && WIDTH_MAP[options.sidebarWidth]) ||
    WIDTH_MAP.standard;
  const bgClass =
    (typeof options.sidebarBackground === "string" && BG_MAP[options.sidebarBackground]) ||
    BG_MAP.surface;
  const features = Array.isArray(options.sidebarFeatureList)
    ? options.sidebarFeatureList
        .filter((f): f is string => typeof f === "string" && f.length > 0)
        .slice(0, 8)
    : [];
  const footerText =
    typeof options.sidebarFooterText === "string" ? options.sidebarFooterText : "";

  return (
    <div className="min-h-screen flex relative">
      {slots.topBar}
      <aside
        className={`hidden lg:flex flex-col border-r border-border p-8 ${widthClass} ${bgClass}`}
      >
        {slots.branding !== undefined && <div className="mb-10">{slots.branding}</div>}
        {features.length > 0 && (
          <ul className="space-y-2.5 text-[13px] font-medium opacity-90">
            {features.map((f, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-1 h-1 w-1 rounded-full bg-current" aria-hidden="true" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        )}
        {footerText && (
          <div className="mt-auto text-[11px] opacity-60 pt-8">{footerText}</div>
        )}
      </aside>
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm">
          {/* Mobile-only branding — sidebar is hidden below lg */}
          {slots.branding !== undefined && (
            <div className="mb-10 lg:hidden">{slots.branding}</div>
          )}
          {slots.content}
          {slots.htmlInjection}
        </div>
      </div>
    </div>
  );
}
