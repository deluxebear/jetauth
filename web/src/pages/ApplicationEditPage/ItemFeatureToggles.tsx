// web/src/pages/ApplicationEditPage/ItemFeatureToggles.tsx
//
// Grid of on/off cards for well-known signin / signup / forget items.
// Sits above the raw EditableTable (which stays as the power-user escape
// hatch). Toggles read/write directly on the same items array the table
// uses — single source of truth.
//
// Visibility contract (same as useSigninItemVisibility):
//   unlisted         → visible (true default)
//   listed + false   → hidden
//   listed + true    → visible
// Toggle writes always ensure the row exists with an explicit `visible`
// value, so both "Agreement"-style default-off items and "Password"-style
// default-on items share one code path.

import type { ReactNode } from "react";
import { Switch } from "../../components/FormSection";
import { useTranslation } from "../../i18n";

type ItemLike = { name?: string; visible?: boolean; isCustom?: boolean };

interface Props<T extends ItemLike> {
  items: T[];
  onChange: (items: T[]) => void;
  knownNames: readonly string[];
  i18n?: Record<string, { label: string; desc: string }>;
  iconMap?: Record<string, ReactNode>;
  /**
   * Template for rows added when an unlisted item is toggled on/off.
   * Called with the item name + the visible flag and must return a row
   * shape compatible with the caller's item type (SigninItem / SignupItem /
   * etc.) so no fields get dropped during JSON round-trip.
   */
  createRow: (name: string, visible: boolean) => T;
}

export default function ItemFeatureToggles<T extends ItemLike>({
  items,
  onChange,
  knownNames,
  i18n,
  iconMap,
  createRow,
}: Props<T>) {
  const { t } = useTranslation();

  const indexByName = new Map<string, number>();
  items.forEach((it, idx) => {
    if (it && !it.isCustom && it.name) indexByName.set(it.name, idx);
  });

  const isOn = (name: string): boolean => {
    const idx = indexByName.get(name);
    if (idx === undefined) return true;
    return items[idx].visible !== false;
  };

  const setOn = (name: string, on: boolean) => {
    const idx = indexByName.get(name);
    if (idx === undefined) {
      onChange([...items, createRow(name, on)]);
      return;
    }
    onChange(items.map((it, i) => (i === idx ? { ...it, visible: on } : it)));
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
      {knownNames.map((name) => {
        const meta = i18n?.[name];
        const on = isOn(name);
        const label = meta ? t(meta.label as never) : name;
        const icon = iconMap?.[name];
        return (
          <label
            key={name}
            className={[
              "flex items-center gap-2.5 rounded-lg border px-3 py-2 cursor-pointer transition-colors",
              on
                ? "border-border bg-surface-1"
                : "border-border bg-surface-0 opacity-60 hover:opacity-80",
            ].join(" ")}
          >
            {icon ? <span className="text-text-muted shrink-0">{icon}</span> : null}
            <span className="flex-1 min-w-0 text-[12px] font-medium text-text-primary truncate">
              {label}
            </span>
            <Switch checked={on} onChange={(v) => setOn(name, v)} />
          </label>
        );
      })}
    </div>
  );
}
