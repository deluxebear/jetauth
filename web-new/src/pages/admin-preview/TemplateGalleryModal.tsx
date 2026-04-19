import { useCallback, useEffect, useState } from "react";
import {
  X,
  Sparkles,
  LayoutTemplate,
  Check,
  ArrowUpCircle,
  Globe,
  Settings,
  AlertTriangle,
  Plus,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { useTranslation } from "../../i18n";
import { AUTH_TEMPLATES, type AuthTemplate } from "./templates";
import { templates as LAYOUT_TEMPLATES } from "../../auth/templates";
import {
  addRegistryUrl,
  clearAllCaches,
  getRegistryUrls,
  loadAllRegistries,
  removeRegistryUrl,
  type RegistryLoadResult,
} from "./remoteRegistry";

interface Props {
  open: boolean;
  onClose: () => void;
  onApply: (t: AuthTemplate) => void;
  /**
   * Tombstone stamped on the app at last apply (templateOptions._manifest).
   * When set, the matching card renders a "Currently applied" badge; if
   * the version in the catalog has moved on, the Apply button becomes
   * "Update to v{new}" instead.
   */
  currentManifest?: { id: string; version: string };
}

/**
 * Full-screen template gallery. Styled to mirror the live-preview modal in
 * ApplicationEditPage for visual continuity.
 *
 * - ESC closes
 * - Backdrop click closes
 * - "Apply" on a card delegates to the parent; the parent performs the
 *   config merge and closes.
 */
export default function TemplateGalleryModal({ open, onClose, onApply, currentManifest }: Props) {
  const { t } = useTranslation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [registries, setRegistries] = useState<RegistryLoadResult[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (getRegistryUrls().length === 0) {
      setRegistries([]);
      return;
    }
    setLoading(true);
    try {
      const results = await loadAllRegistries();
      setRegistries(results);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      data-testid="template-gallery-backdrop"
    >
      <div
        className="w-[90vw] h-[90vh] max-w-[1400px] rounded-2xl border border-border bg-surface-0 shadow-[var(--shadow-elevated)] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-gallery-title"
      >
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-border bg-surface-1">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-accent" />
              <h3 id="template-gallery-title" className="text-[16px] font-semibold text-text-primary">
                {t("apps.template.title" as any)}
              </h3>
            </div>
            <p className="mt-1 text-[13px] text-text-muted">
              {t("apps.template.subtitle" as any)}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => { clearAllCaches(); void refresh(); }}
              disabled={loading}
              title={t("apps.template.refresh" as never)}
              className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 disabled:opacity-50 transition-colors"
              aria-label={t("apps.template.refresh" as never)}
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen((s) => !s)}
              title={t("apps.template.registrySettings" as never)}
              className={[
                "rounded-lg p-1.5 transition-colors",
                settingsOpen ? "bg-surface-2 text-text-primary" : "text-text-muted hover:bg-surface-2",
              ].join(" ")}
              aria-label={t("apps.template.registrySettings" as never)}
              aria-expanded={settingsOpen}
            >
              <Settings size={16} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors"
              aria-label={t("apps.template.cancel" as any)}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {settingsOpen && (
          <RegistrySettings
            onChange={() => void refresh()}
            onClose={() => setSettingsOpen(false)}
          />
        )}

        <div className="flex-1 overflow-auto p-6 bg-surface-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {AUTH_TEMPLATES.map((tmpl) => {
              const isCurrent = currentManifest?.id === tmpl.id;
              const hasUpdate = isCurrent && currentManifest?.version !== tmpl.version;
              const applyLabel = hasUpdate
                ? `${t("apps.template.update" as never)} → v${tmpl.version}`
                : isCurrent
                ? t("apps.template.reapply" as never)
                : t("apps.template.apply" as never);
              return (
                <TemplateCard
                  key={tmpl.id}
                  template={tmpl}
                  applyLabel={applyLabel}
                  onApply={() => onApply(tmpl)}
                  isCurrent={isCurrent}
                  hasUpdate={hasUpdate}
                  currentBadgeLabel={t("apps.template.current" as never)}
                />
              );
            })}
            {registries.flatMap((reg) =>
              reg.manifests.map((tmpl) => {
                const isCurrent = currentManifest?.id === tmpl.id;
                const hasUpdate = isCurrent && currentManifest?.version !== tmpl.version;
                const applyLabel = hasUpdate
                  ? `${t("apps.template.update" as never)} → v${tmpl.version}`
                  : isCurrent
                  ? t("apps.template.reapply" as never)
                  : t("apps.template.apply" as never);
                return (
                  <TemplateCard
                    key={`remote:${reg.url}:${tmpl.id}`}
                    template={tmpl}
                    applyLabel={applyLabel}
                    onApply={() => onApply(tmpl)}
                    isCurrent={isCurrent}
                    hasUpdate={hasUpdate}
                    currentBadgeLabel={t("apps.template.current" as never)}
                    thirdPartyHost={reg.host}
                  />
                );
              }),
            )}
          </div>

          {registries.filter((r) => r.error).length > 0 && (
            <div className="mt-6 space-y-1.5">
              {registries
                .filter((r) => r.error)
                .map((r) => (
                  <div
                    key={r.url}
                    className="flex items-center gap-2 text-[12px] text-warning"
                  >
                    <AlertTriangle size={12} />
                    <span className="font-mono">{r.host}</span>
                    <span className="text-text-muted">— {r.error}</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Registry settings (add/remove URLs) ───────────────────────────────────

function RegistrySettings({ onChange, onClose }: { onChange: () => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [urls, setUrls] = useState(getRegistryUrls());
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const url = input.trim();
    if (!url) return;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new Error("must be http(s)");
      }
    } catch {
      setError(t("apps.template.registry.invalidUrl" as never));
      return;
    }
    addRegistryUrl(url);
    setUrls(getRegistryUrls());
    setInput("");
    setError("");
    onChange();
  };

  const handleRemove = (url: string) => {
    removeRegistryUrl(url);
    setUrls(getRegistryUrls());
    onChange();
  };

  return (
    <div className="border-b border-border bg-surface-0 px-6 py-4 shrink-0">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-text-primary">
            {t("apps.template.registrySettings" as never)}
          </div>
          <p className="mt-0.5 text-[12px] text-text-muted">
            {t("apps.template.registry.hint" as never)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-text-muted hover:bg-surface-2 transition-colors shrink-0"
          aria-label="close"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 mb-3">
        <AlertTriangle size={14} className="text-warning shrink-0" />
        <p className="text-[11px] text-warning leading-snug">
          {t("apps.template.registry.warning" as never)}
        </p>
      </div>

      <form onSubmit={handleAdd} className="flex items-stretch gap-2 mb-3">
        <input
          type="url"
          value={input}
          onChange={(e) => { setInput(e.target.value); setError(""); }}
          placeholder="https://example.com/templates.json"
          className="flex-1 rounded-lg border border-border bg-surface-1 px-3 py-1.5 text-[13px] text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
        >
          <Plus size={13} />
          {t("apps.template.registry.add" as never)}
        </button>
      </form>

      {error && (
        <p className="text-[11px] text-danger mb-2">{error}</p>
      )}

      {urls.length > 0 ? (
        <ul className="space-y-1">
          {urls.map((u) => (
            <li key={u} className="flex items-center justify-between gap-3 text-[12px]">
              <span className="font-mono text-text-secondary truncate">{u}</span>
              <button
                type="button"
                onClick={() => handleRemove(u)}
                className="shrink-0 rounded-md p-1 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                aria-label={t("apps.template.registry.remove" as never)}
              >
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-text-muted">
          {t("apps.template.registry.empty" as never)}
        </p>
      )}
    </div>
  );
}

interface CardProps {
  template: AuthTemplate;
  applyLabel: string;
  onApply: () => void;
  isCurrent: boolean;
  hasUpdate: boolean;
  currentBadgeLabel: string;
  /** Set for manifests loaded from a remote registry — drives the warning badge. */
  thirdPartyHost?: string;
}

function TemplateCard({
  template,
  applyLabel,
  onApply,
  isCurrent,
  hasUpdate,
  currentBadgeLabel,
  thirdPartyHost,
}: CardProps) {
  const layoutId = template.config.template;
  const layoutMeta = layoutId ? LAYOUT_TEMPLATES[layoutId]?.meta : undefined;
  const previewOk = template.preview && template.preview.startsWith("<svg");
  return (
    <div
      className={[
        "flex flex-col rounded-xl border bg-surface-0 overflow-hidden transition-all",
        isCurrent
          ? "border-accent ring-2 ring-accent/30"
          : "border-border hover:border-accent/60 hover:shadow-[var(--shadow-card)]",
      ].join(" ")}
      data-testid={`template-card-${template.id}`}
    >
      <div className="relative">
        {previewOk ? (
          <div
            className="aspect-[12/7] bg-surface-2 border-b border-border overflow-hidden [&>svg]:h-full [&>svg]:w-full"
            // Curated tier ships its preview SVG as a string literal that we authored.
            // Remote tier previews are filtered in validateRegistryPayload — we only
            // render previews that pass `startsWith("<svg")` above, and the browser's
            // SVG parser rejects non-XML content. Scripts inside SVG still run though,
            // so this is the piece that would benefit most from DOMPurify in v1.2.
            dangerouslySetInnerHTML={{ __html: template.preview }}
            aria-hidden="true"
          />
        ) : (
          <div className="aspect-[12/7] bg-surface-2 border-b border-border flex items-center justify-center text-text-muted">
            <LayoutTemplate size={24} />
          </div>
        )}
        {layoutMeta && (
          <span
            className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-surface-0/90 border border-border px-2 py-0.5 text-[10px] font-semibold text-text-secondary backdrop-blur-sm"
            title={layoutMeta.description.en}
          >
            <LayoutTemplate size={10} />
            {layoutMeta.name.en}
          </span>
        )}
        {thirdPartyHost && (
          <span
            className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-warning/15 border border-warning/40 px-2 py-0.5 text-[10px] font-semibold text-warning backdrop-blur-sm"
            title={`Third-party registry — unsigned. Review before applying.`}
          >
            <Globe size={10} />
            {thirdPartyHost}
          </span>
        )}
        {isCurrent && (
          <span
            className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm"
            data-testid={`template-current-${template.id}`}
          >
            <Check size={10} />
            {currentBadgeLabel}
          </span>
        )}
      </div>
      <div className="flex-1 flex flex-col gap-3 p-4">
        <div>
          <h4 className="text-[14px] font-semibold text-text-primary">
            {template.name}
            <span className="ml-2 text-[11px] font-mono text-text-muted">
              v{template.version}
            </span>
          </h4>
          <p className="mt-1 text-[12px] leading-relaxed text-text-muted">{template.description}</p>
        </div>
        <div className="mt-auto pt-1">
          <button
            type="button"
            onClick={onApply}
            className={[
              "w-full inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors",
              hasUpdate
                ? "bg-warning text-white hover:opacity-90"
                : isCurrent
                ? "bg-surface-2 text-text-secondary hover:bg-surface-1 border border-border"
                : "bg-accent text-white hover:bg-accent-hover",
            ].join(" ")}
            data-testid={`template-apply-${template.id}`}
          >
            {hasUpdate && <ArrowUpCircle size={13} />}
            {applyLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
