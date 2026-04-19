// web-new/src/pages/ApplicationEditPage/SigninFeatureToggles.tsx
//
// Grid of on/off cards for well-known signinItems. Sits above the raw
// EditableTable (which stays as the power-user escape hatch). Toggles
// read/write directly on the same signinItems array the table uses —
// single source of truth.
//
// Visibility contract matches useSigninItemVisibility:
//   unlisted         → visible (true default)
//   listed + false   → hidden
//   listed + true    → visible
// Toggle writes always ensure the row exists with an explicit `visible`
// value, so both "Agreement"-style default-off items and "Password"-style
// default-on items share one code path.

import type { ReactNode } from "react";
import {
  Layers,
  Image as ImageIcon,
  ArrowLeft,
  Globe,
  User,
  Lock,
  MessageSquare,
  Puzzle,
  FileCheck,
  HelpCircle,
  LogIn,
  UserPlus,
  Shield,
  Repeat,
  Building2,
} from "lucide-react";
import { Switch } from "../../components/FormSection";
import { useTranslation } from "../../i18n";
import type { SigninItem } from "../../auth/api/types";

const ICON_MAP: Record<string, ReactNode> = {
  "Signin methods":      <Layers size={14} />,
  "Logo":                <ImageIcon size={14} />,
  "Back button":         <ArrowLeft size={14} />,
  "Languages":           <Globe size={14} />,
  "Username":            <User size={14} />,
  "Password":            <Lock size={14} />,
  "Verification code":   <MessageSquare size={14} />,
  "Providers":           <Puzzle size={14} />,
  "Agreement":           <FileCheck size={14} />,
  "Forgot password?":    <HelpCircle size={14} />,
  "Login button":        <LogIn size={14} />,
  "Signup link":         <UserPlus size={14} />,
  "Captcha":             <Shield size={14} />,
  "Auto sign in":        <Repeat size={14} />,
  "Select organization": <Building2 size={14} />,
};

interface Props {
  items: SigninItem[];
  onChange: (items: SigninItem[]) => void;
  knownNames: readonly string[];
  i18n: Record<string, { label: string; desc: string }>;
}

export default function SigninFeatureToggles({
  items,
  onChange,
  knownNames,
  i18n,
}: Props) {
  const { t } = useTranslation();

  const indexByName = new Map<string, number>();
  items.forEach((it, idx) => {
    if (it && !it.isCustom && it.name) indexByName.set(it.name, idx);
  });

  const isOn = (name: string): boolean => {
    const idx = indexByName.get(name);
    if (idx === undefined) return true; // unlisted defaults to visible
    return items[idx].visible !== false;
  };

  const setOn = (name: string, on: boolean) => {
    const idx = indexByName.get(name);
    if (idx === undefined) {
      // Add a minimal row — other fields (label, placeholder, customCss)
      // stay empty and the raw table below is where the admin edits them.
      onChange([
        ...items,
        {
          name,
          visible: on,
          label: "",
          customCss: "",
          placeholder: "",
          rule: "",
          isCustom: false,
        },
      ]);
      return;
    }
    onChange(items.map((it, i) => (i === idx ? { ...it, visible: on } : it)));
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
      {knownNames.map((name) => {
        const meta = i18n[name];
        const on = isOn(name);
        const label = meta ? t(meta.label as never) : name;
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
            <span className="text-text-muted shrink-0">{ICON_MAP[name] ?? null}</span>
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
