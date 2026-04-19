// web-new/src/auth/templates/index.ts
//
// Auto-discovery registry. Drop a new template into `templates/<id>/index.tsx`
// (exporting `meta` + default component) and Vite's `import.meta.glob` picks
// it up at build time — no edits to this file required.

import type { TemplateComponent, TemplateEntry, TemplateMeta } from "./types";

const mods = import.meta.glob<{
  meta: TemplateMeta;
  default: TemplateComponent;
}>("./*/index.tsx", { eager: true });

const registry: Record<string, TemplateEntry> = {};
for (const mod of Object.values(mods)) {
  registry[mod.meta.id] = { meta: mod.meta, Component: mod.default };
}

export const templates = registry;
export const templateList: TemplateMeta[] = Object.values(registry).map(
  (e) => e.meta,
);
export const DEFAULT_TEMPLATE_ID = "centered-card";

/**
 * Resolve a template by id. Unknown / missing ids fall back to the default
 * — pages never throw on a stale or experimental `application.template`.
 */
export function resolveTemplate(id: string | undefined | null): TemplateEntry {
  const entry = (id && registry[id]) || registry[DEFAULT_TEMPLATE_ID];
  if (!entry) {
    throw new Error(
      "No auth templates registered — expected templates/centered-card/index.tsx",
    );
  }
  return entry;
}

export type {
  TemplateCategory,
  TemplateComponent,
  TemplateEntry,
  TemplateMeta,
  TemplateProps,
  TemplateSlots,
  TemplateVariant,
} from "./types";
