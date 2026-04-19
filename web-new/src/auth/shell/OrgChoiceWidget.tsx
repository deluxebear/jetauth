import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "../../i18n";

interface OrgChoiceWidgetProps {
  /** "None" | "Select" | "Input" — anything else renders nothing */
  mode: string | undefined;
  /** Organization currently in the URL, if any — used to pre-fill input */
  currentOrg?: string;
}

const LS_RECENT_ORGS_KEY = "jetauth.recentOrgs";

/**
 * Organization-choice widget above the signin form. Three variants:
 *   - "None"   → nothing rendered
 *   - "Select" → dropdown fed from localStorage recent-orgs history, with a
 *                free-text fallback. (True server-side org enumeration would
 *                require an anonymous endpoint which doesn't exist today.)
 *   - "Input"  → text input + "Remember" checkbox; on submit navigates to
 *                /login/<value>.
 *
 * Only renders when the URL is bare /login (i.e. no org already in the
 * route) — caller is responsible for that gating via currentOrg prop.
 */
export default function OrgChoiceWidget({ mode, currentOrg }: OrgChoiceWidgetProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [remember, setRemember] = useState(true);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_RECENT_ORGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setRecent(parsed.filter((x) => typeof x === "string"));
      }
    } catch {
      // ignore corrupt localStorage
    }
  }, []);

  if (!mode || mode === "None") return null;
  const isPreview =
    typeof window !== "undefined" &&
    (new URLSearchParams(window.location.search).has("preview") ||
      new URLSearchParams(window.location.search).has("asGuest"));
  if (!isPreview && currentOrg && currentOrg !== "built-in") return null; // URL already has org

  const commit = (org: string) => {
    const trimmed = org.trim();
    if (!trimmed) return;
    if (remember) {
      const next = [trimmed, ...recent.filter((r) => r !== trimmed)].slice(0, 5);
      try {
        localStorage.setItem(LS_RECENT_ORGS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
    }
    window.location.href = `/login/${encodeURIComponent(trimmed)}`;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    commit(value);
  };

  if (mode === "Select") {
    return (
      <div className="mb-4">
        <label className="block text-[12px] font-medium text-text-secondary mb-1.5">
          {t("auth.org.selectLabel")}
        </label>
        {recent.length > 0 ? (
          <select
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (e.target.value) commit(e.target.value);
            }}
            className="w-full rounded-lg border border-border bg-surface-1 px-3.5 py-2.5 text-[14px] text-text-primary focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition-all"
          >
            <option value="">{t("auth.org.selectPrompt")}</option>
            {recent.map((org) => (
              <option key={org} value={org}>{org}</option>
            ))}
          </select>
        ) : (
          /* No recent orgs yet — render as plain input */
          <form onSubmit={handleSubmit}>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={t("auth.org.selectPrompt")}
              className="w-full rounded-lg border border-border bg-surface-1 px-3.5 py-2.5 text-[14px] text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition-all"
            />
          </form>
        )}
      </div>
    );
  }

  // mode === "Input"
  return (
    <form onSubmit={handleSubmit} className="mb-4 space-y-2">
      <label className="block text-[12px] font-medium text-text-secondary">
        {t("auth.org.inputLabel")}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        list={recent.length > 0 ? "org-autocomplete" : undefined}
        placeholder={t("auth.org.selectPrompt")}
        className="w-full rounded-lg border border-border bg-surface-1 px-3.5 py-2.5 text-[14px] text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition-all"
      />
      {recent.length > 0 && (
        <datalist id="org-autocomplete">
          {recent.map((org) => (
            <option key={org} value={org} />
          ))}
        </datalist>
      )}
      <label className="flex items-center gap-2 text-[12px] text-text-muted cursor-pointer">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          className="rounded border-border"
        />
        {t("auth.org.rememberLabel")}
      </label>
    </form>
  );
}
