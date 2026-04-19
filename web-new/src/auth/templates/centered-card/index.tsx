// web-new/src/auth/templates/centered-card/index.tsx
//
// T01 "Centered" — single-column layout centered on a neutral background.
// Visually 1:1 with the pre-template UI, so existing apps default to this
// template after migration and see zero regression.

// Templates co-locate their `meta` constant with the component so the
// registry glob only needs one entry per folder. Fast refresh on template
// edits would require a dev-server restart anyway — the ergonomic win from
// one-file-per-template beats the HMR loss here.
/* eslint-disable react-refresh/only-export-components */

import type { TemplateMeta, TemplateProps } from "../types";

export const meta: TemplateMeta = {
  id: "centered-card",
  name: { en: "Centered", zh: "居中（默认）" },
  description: {
    en: "Single-column centered layout. The default for most SaaS products.",
    zh: "单列居中布局。绝大多数 SaaS 产品的默认选择。",
  },
  preview: "/templates/centered-card.svg",
  category: "saas",
  defaultOptions: {},
};

export default function CenteredTemplate({ slots }: TemplateProps) {
  return (
    <div className="min-h-screen flex relative">
      {slots.topBar}
      <div className="w-full flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm">
          {slots.branding !== undefined && (
            <div className="mb-10">{slots.branding}</div>
          )}
          {slots.content}
          {slots.htmlInjection}
        </div>
      </div>
    </div>
  );
}
