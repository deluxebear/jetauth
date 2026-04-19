import type { SigninItem } from "../api/types";

export interface SigninItemVisibility {
  /** True iff the admin hasn't explicitly hidden this item. */
  isVisible: (name: string) => boolean;
  /** Returns the item's label if overridden, else undefined. */
  labelOf: (name: string) => string | undefined;
  /** Returns the item's placeholder override, or undefined if none. */
  placeholderOf: (name: string) => string | undefined;
  /**
   * True when the admin has explicitly listed this item in signinItems
   * (regardless of visible flag). Used for default-off widgets like
   * Agreement / Captcha / Auto sign in where we only render when the admin
   * has opted in — isVisible alone would default to true for unlisted items.
   */
  isListed: (name: string) => boolean;
  /** Returns the item's `required` flag if defined, else undefined. */
  requiredOf: (name: string) => boolean | undefined;
  /** Custom (isCustom=true) items in declared order. */
  customItems: SigninItem[];
}

/**
 * Interprets application.signinItems[] into a visibility/label accessor.
 *
 * Defaults: when signinItems is empty (admin hasn't customized) OR the item
 * is not in the list, every built-in widget IS visible. This matches
 * Casdoor-era behavior and keeps backward compatibility.
 *
 * Explicit items with `visible: false` are hidden. Items with a non-empty
 * `label` override the built-in label (e.g. "Back button" → "返回首页").
 * Items with `isCustom: true` are returned in `customItems` for the page to
 * render inline wherever it wants (typically below the form).
 */
export function useSigninItemVisibility(items: SigninItem[] | undefined | null): SigninItemVisibility {
  const map = new Map<string, SigninItem>();
  const customs: SigninItem[] = [];
  for (const item of items ?? []) {
    if (!item || !item.name) continue;
    if (item.isCustom) {
      customs.push(item);
    } else {
      map.set(item.name, item);
    }
  }
  return {
    isVisible: (name: string) => {
      const it = map.get(name);
      if (!it) return true; // unlisted = visible by default
      return it.visible !== false;
    },
    labelOf: (name: string) => {
      const it = map.get(name);
      if (!it) return undefined;
      return it.label && it.label.length > 0 ? it.label : undefined;
    },
    placeholderOf: (name: string) => {
      const it = map.get(name);
      if (!it) return undefined;
      return it.placeholder && it.placeholder.length > 0 ? it.placeholder : undefined;
    },
    isListed: (name: string) => map.has(name),
    requiredOf: (name: string) => {
      const it = map.get(name);
      if (!it) return undefined;
      // Preserve "not set" vs "false" so callers can apply their own defaults.
      return it.required;
    },
    customItems: customs,
  };
}
