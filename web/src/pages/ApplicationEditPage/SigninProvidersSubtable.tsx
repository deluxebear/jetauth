// web/src/pages/ApplicationEditPage/SigninProvidersSubtable.tsx
//
// Per-app, per-provider display config for the login page.
//
// Admins attach a list of { name, size, group, visible } entries to the
// `Providers` signinItem. The login page (ProvidersRow) reads this list to
// control which provider buttons appear, in what order, at what size, and
// grouped under Primary vs. Secondary.
//
// When the list is empty the login page falls back to legacy behavior — all
// configured providers render in server order at default size. This keeps
// existing apps untouched and avoids surprising admins who never open this
// sub-table.
//
// This component is rendered below the signinItems EditableTable (not nested
// inside it) — the row-level EditableTable isn't designed for expandable
// children and slotting a sub-table inline would force invasive changes.

import { useMemo, useState, useRef, useEffect } from "react";
import { ArrowUp, ArrowDown, Plus } from "lucide-react";
import SimpleSelect from "../../components/SimpleSelect";
import { Switch } from "../../components/FormSection";
import { useTranslation } from "../../i18n";
import type { SigninItemProvider } from "../../auth/api/types";

interface AppProviderRow {
  /** Provider name configured on the app's Providers tab. */
  name: string;
}

interface Props {
  /** All providers configured on this application (the Providers tab rows). */
  appProviders: AppProviderRow[];
  /** The current per-provider display config (signinItem.providers). */
  value: SigninItemProvider[] | undefined;
  /** Called whenever the admin edits a row. */
  onChange: (next: SigninItemProvider[]) => void;
}

export default function SigninProvidersSubtable({ appProviders, value, onChange }: Props) {
  const { t } = useTranslation();
  const rows = value ?? [];

  // Providers that are configured on the app but not yet in the display list.
  // Shown in an "Add" dropdown so admins can pull them in.
  const missing = useMemo(() => {
    const listed = new Set(rows.map((r) => r.name));
    return appProviders
      .map((p) => p.name)
      .filter((n) => !!n && !listed.has(n));
  }, [appProviders, rows]);

  const updateRow = (i: number, patch: Partial<SigninItemProvider>) => {
    const next = rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    onChange(next);
  };

  const removeRow = (i: number) => {
    onChange(rows.filter((_, idx) => idx !== i));
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    const tmp = next[i];
    next[i] = next[j];
    next[j] = tmp;
    onChange(next);
  };

  const addRow = (name: string) => {
    if (!name) return;
    onChange([
      ...rows,
      { name, size: "small", group: "primary", visible: true },
    ]);
  };

  const addAll = () => {
    const seeded = appProviders
      .filter((p) => !!p.name && !rows.some((r) => r.name === p.name))
      .map((p) => ({ name: p.name, size: "small" as const, group: "primary" as const, visible: true }));
    if (seeded.length === 0) return;
    onChange([...rows, ...seeded]);
  };

  const sizeOpts = [
    { value: "small", label: t("apps.providerConfig.size.small" as any) },
    { value: "large", label: t("apps.providerConfig.size.large" as any) },
  ];
  const groupOpts = [
    { value: "primary", label: t("apps.providerConfig.group.primary" as any) },
    { value: "secondary", label: t("apps.providerConfig.group.secondary" as any) },
  ];

  return (
    <div className="rounded-xl border border-border bg-surface-1 overflow-visible">
      <div className="px-4 py-2.5 border-b border-border-subtle bg-surface-2/30 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-[13px] font-semibold text-text-primary">
            {t("apps.providerConfig.title" as any)}
          </h4>
          <p className="mt-0.5 text-[11px] text-text-muted">
            {t("apps.providerConfig.hint" as any)}
          </p>
        </div>
        {missing.length > 0 && (
          <div className="shrink-0">
            <AddProviderMenu options={missing} onPick={addRow} />
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12px] text-text-muted">
          {appProviders.length === 0 ? (
            <>
              <p>{t("apps.providerConfig.emptyNoProviders" as any)}</p>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <p>{t("apps.providerConfig.emptyWithProviders" as any).replace("{count}", String(appProviders.length))}</p>
              <button
                type="button"
                onClick={addAll}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-accent-hover transition-colors"
              >
                <Plus size={13} />
                {t("apps.providerConfig.addAll" as any)}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div>
          {/* Header */}
          <div
            className="grid items-center gap-2 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-text-muted border-b border-border-subtle"
            style={{ gridTemplateColumns: "minmax(0, 1.8fr) 80px 120px 120px 80px" }}
          >
            <div>{t("apps.providerConfig.col.provider" as any)}</div>
            <div>{t("apps.providerConfig.col.visible" as any)}</div>
            <div>{t("apps.providerConfig.col.size" as any)}</div>
            <div>{t("apps.providerConfig.col.group" as any)}</div>
            <div />
          </div>

          {rows.map((row, i) => {
            const configured = appProviders.some((p) => p.name === row.name);
            return (
              <div
                key={`${row.name}-${i}`}
                className="grid items-center gap-2 px-4 py-2 border-b border-border last:border-b-0"
                style={{ gridTemplateColumns: "minmax(0, 1.8fr) 80px 120px 120px 80px" }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate text-[12px] text-text-primary">{row.name || "—"}</span>
                  {!configured && (
                    <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning" title="Provider is not configured on the Providers tab">
                      !
                    </span>
                  )}
                </div>
                <div>
                  <Switch
                    checked={row.visible !== false}
                    onChange={(v) => updateRow(i, { visible: v })}
                  />
                </div>
                <div>
                  <SimpleSelect
                    compact
                    value={row.size}
                    options={sizeOpts}
                    onChange={(v) => updateRow(i, { size: v as "large" | "small" })}
                  />
                </div>
                <div>
                  <SimpleSelect
                    compact
                    value={row.group}
                    options={groupOpts}
                    onChange={(v) => updateRow(i, { group: v as "primary" | "secondary" })}
                  />
                </div>
                <div className="flex items-center gap-1 justify-end">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    className="rounded p-1 text-text-muted hover:text-text-primary hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Move up"
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === rows.length - 1}
                    className="rounded p-1 text-text-muted hover:text-text-primary hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Move down"
                  >
                    <ArrowDown size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="rounded p-1 text-text-muted hover:text-danger hover:bg-danger/10"
                    aria-label="Remove"
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AddProviderMenu({ options, onPick }: { options: string[]; onPick: (name: string) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-[12px] font-medium text-white hover:bg-accent-hover transition-colors"
      >
        <Plus size={13} />
        <span>{t("common.add")}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] max-h-60 overflow-y-auto rounded-xl border border-border bg-surface-1 py-1 shadow-[var(--shadow-elevated)]">
          {options.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => { onPick(n); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-[12px] text-text-primary hover:bg-surface-2 transition-colors"
            >
              {n}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
