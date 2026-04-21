// web/src/auth/templates/minimal-inline/index.tsx
//
// T04 "Minimal" — top-aligned, wider column, no decorative chrome. Feels
// like GitHub / Vercel / Railway — understated, right for developer tools.
// Pure layout shift vs T01: top-aligned instead of center-of-viewport, and
// max-w-md instead of max-w-sm. No options.

/* eslint-disable react-refresh/only-export-components */

import type { TemplateMeta, TemplateProps } from "../types";

export const meta: TemplateMeta = {
  id: "minimal-inline",
  name: { en: "Minimal", zh: "极简" },
  description: {
    en: "Top-aligned, wider column. GitHub / Vercel vibe for developer tools.",
    zh: "顶部对齐、列宽更宽。GitHub / Vercel 风格，适合开发者工具。",
  },
  preview: "/templates/minimal-inline.svg",
  category: "developer",
  defaultOptions: {},
};

export default function MinimalInlineTemplate({ slots }: TemplateProps) {
  return (
    <div className="min-h-screen flex flex-col relative">
      {slots.topBar}
      <div className="flex-1 px-6 pt-16 lg:pt-24 flex justify-center">
        <div className="w-full max-w-md">
          {slots.branding !== undefined && <div className="mb-8">{slots.branding}</div>}
          {slots.content}
          {slots.htmlInjection}
        </div>
      </div>
    </div>
  );
}
