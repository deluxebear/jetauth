import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Search, X, ExternalLink, Plus, Globe, RefreshCw, Cloud, HardDrive, AlertCircle } from "lucide-react";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useOrganization } from "../OrganizationContext";
import * as ServerBackend from "../backend/ServerBackend";
import mcpRegistry from "../data/mcp-registry.json";

interface NormalizedServer {
  id: string;
  name: string;
  nameText: string;
  categoriesRaw: string[];
  categoriesLower: string[];
  endpoint: string;
  description: string;
  website: string;
}

// "online" = data fetched live from backend (which proxies mcp.casdoor.org/registry.json).
// "local"  = baked-in fallback when the backend / network is unreachable.
type Source = "online" | "local";

function normalizeServers(data: unknown): NormalizedServer[] {
  // Extract server array from various response shapes — the upstream JSON
  // schema has changed shape across versions; we accept all of them.
  type Raw = Record<string, unknown>;
  let raw: Raw[] = [];
  const obj = data as Raw | null;
  if (obj && typeof obj === "object") {
    if (Array.isArray(obj.servers)) raw = obj.servers as Raw[];
    else if (Array.isArray(obj.data)) raw = obj.data as Raw[];
  }
  if (raw.length === 0 && Array.isArray(data)) raw = data as Raw[];

  return raw
    .map((s, i) => {
      const name = typeof s.name === "string" ? s.name : "";
      const description = typeof s.description === "string" ? s.description : "";
      const id = typeof s.id === "string" ? s.id : `${name || "server"}-${i}`;
      const category = typeof s.category === "string" && s.category.trim() ? s.category : "";
      const categoriesRaw = category ? [category] : [];
      const endpoints = (s.endpoints && typeof s.endpoints === "object")
        ? (s.endpoints as Record<string, unknown>)
        : null;
      const endpoint = (endpoints && typeof endpoints.production === "string" ? endpoints.production : "")
        || (typeof s.endpoint === "string" ? s.endpoint : "");
      const maintainer = (s.maintainer && typeof s.maintainer === "object")
        ? (s.maintainer as Record<string, unknown>)
        : null;
      const website = (maintainer && typeof maintainer.website === "string" ? maintainer.website : "")
        || (typeof s.website === "string" ? s.website : "");
      return {
        id,
        name,
        nameText: name.toLowerCase(),
        categoriesRaw,
        categoriesLower: categoriesRaw.map((c) => c.toLowerCase()),
        endpoint,
        description,
        website,
      };
    })
    .filter((s) => s.endpoint.startsWith("http"));
}

function ensureUrl(url: string) {
  if (!url) return "";
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export default function ServerStorePage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const modal = useModal();
  const { getNewEntityOwner } = useOrganization();

  // Dynamic source: try the backend (which proxies mcp.casdoor.org/registry.json)
  // and fall back to the embedded snapshot if it fails. We keep both pieces
  // of state so the UI can show which source is currently displayed and a
  // banner when we had to fall back.
  const [rawData, setRawData] = useState<unknown>(null);
  const [source, setSource] = useState<Source>("online");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nameFilter, setNameFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [creatingId, setCreatingId] = useState("");

  const loadOnline = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await ServerBackend.getOnlineServers();
      if (res.status === "ok" && res.data != null) {
        setRawData(res.data);
        setSource("online");
      } else {
        // Backend reachable but registry fetch failed upstream — fall back
        // to the embedded snapshot so the page is still usable.
        setRawData(mcpRegistry);
        setSource("local");
        setError(res.msg || t("serverStore.error.upstream"));
      }
    } catch (e: unknown) {
      setRawData(mcpRegistry);
      setSource("local");
      setError(e instanceof Error ? e.message : t("serverStore.error.upstream"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { loadOnline(); }, [loadOnline]);

  const servers = useMemo(() => normalizeServers(rawData ?? mcpRegistry), [rawData]);

  const categories = useMemo(() => {
    const all = servers.flatMap((s) => s.categoriesRaw);
    return [...new Set(all)].sort((a, b) => a.localeCompare(b));
  }, [servers]);

  const filtered = useMemo(() => {
    const nf = nameFilter.trim().toLowerCase();
    return servers.filter((s) => {
      const nameOk = !nf || s.nameText.includes(nf);
      const catOk = categoryFilter.length === 0 || categoryFilter.some((c) => s.categoriesLower.includes(c.toLowerCase()));
      return nameOk && catOk;
    });
  }, [servers, nameFilter, categoryFilter]);

  const handleAdd = async (s: NormalizedServer) => {
    const ownerVal = getNewEntityOwner();
    const serverName = (s.id || s.name || "server").toLowerCase().replace(/[^a-z0-9_-]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "") || "server";
    const rand = Math.random().toString(36).substring(2, 8);
    const newServer = ServerBackend.newServer(ownerVal);
    newServer.name = `${serverName}_${rand}`;
    newServer.displayName = s.name || serverName;
    newServer.url = s.endpoint;

    setCreatingId(s.id);
    try {
      const res = await ServerBackend.addServer(newServer);
      if (res.status === "ok") {
        navigate(`/servers/${newServer.owner}/${newServer.name}`, { state: { mode: "add" } });
      } else {
        modal.toast(res.msg || t("common.addFailed"), "error");
      }
    } catch {
      modal.toast(t("common.addFailed"), "error");
    } finally {
      setCreatingId("");
    }
  };

  const toggleCategory = (cat: string) => {
    setCategoryFilter((prev) =>
      prev.includes(cat.toLowerCase()) ? prev.filter((c) => c !== cat.toLowerCase()) : [...prev, cat.toLowerCase()]
    );
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate("/servers")} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors" title={t("common.back")}>
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight">{t("serverStore.title")}</h1>
            <p className="text-[13px] text-text-muted mt-0.5">{t("serverStore.subtitle")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Source pill — tells admins whether we're showing the live registry or the bundled fallback. */}
          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium ${source === "online" ? "border-success/30 bg-success/10 text-success" : "border-warning/40 bg-warning/10 text-warning"}`}>
            {source === "online" ? <Cloud size={12} /> : <HardDrive size={12} />}
            {source === "online" ? t("serverStore.source.online") : t("serverStore.source.local")}
          </span>
          <motion.button
            whileHover={{ rotate: 180 }}
            transition={{ duration: 0.3 }}
            onClick={loadOnline}
            disabled={loading}
            className="rounded-lg border border-border p-2 text-text-muted hover:bg-surface-2 transition-colors disabled:opacity-50"
            title={t("common.refresh")}
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </motion.button>
        </div>
      </div>

      {/* Fallback banner — shown only when we had to fall back to local data */}
      {error && source === "local" && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5">
          <AlertCircle size={14} className="shrink-0 mt-0.5 text-warning" />
          <div className="text-[12px] text-text-secondary">
            <p className="font-medium text-text-primary">{t("serverStore.fallback.title")}</p>
            <p className="text-text-muted mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-[360px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            placeholder={t("serverStore.searchPlaceholder")}
            className="w-full rounded-lg border border-border bg-surface-2 pl-9 pr-3 py-2 text-[13px] focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition-colors"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => toggleCategory(cat)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors ${
                categoryFilter.includes(cat.toLowerCase())
                  ? "bg-accent/10 text-accent border-accent/30"
                  : "bg-surface-2 text-text-muted border-border hover:bg-surface-3"
              }`}
            >
              {cat}
            </button>
          ))}
          {categoryFilter.length > 0 && (
            <button onClick={() => setCategoryFilter([])} className="rounded-full px-2 py-1 text-[11px] text-text-muted hover:text-text-secondary transition-colors">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading && servers.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-text-muted text-[13px]">{t("common.noData")}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((s) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-border bg-surface-1 p-4 flex flex-col hover:shadow-md hover:border-accent/20 transition-all"
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-[14px] font-semibold text-text-primary truncate flex-1 mr-2">{s.name || "\u2014"}</h3>
                <button
                  onClick={() => handleAdd(s)}
                  disabled={creatingId === s.id}
                  className="flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors shrink-0"
                >
                  {creatingId === s.id ? (
                    <div className="h-3 w-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  ) : (
                    <Plus size={12} />
                  )}
                  {t("common.add")}
                </button>
              </div>

              <p className="text-[12px] text-text-muted mb-3 line-clamp-2 min-h-[32px]">{s.description || "\u2014"}</p>

              <div className="space-y-1.5 text-[12px] mb-3">
                <div className="flex items-center gap-1.5 text-text-secondary">
                  <Globe size={12} className="shrink-0 text-text-muted" />
                  <a href={ensureUrl(s.endpoint)} target="_blank" rel="noreferrer" className="text-accent hover:underline truncate">{s.endpoint}</a>
                </div>
                {s.website && (
                  <div className="flex items-center gap-1.5 text-text-secondary">
                    <ExternalLink size={12} className="shrink-0 text-text-muted" />
                    <a href={ensureUrl(s.website)} target="_blank" rel="noreferrer" className="text-accent hover:underline truncate">{s.website}</a>
                  </div>
                )}
              </div>

              {s.categoriesRaw.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-auto pt-2 border-t border-border">
                  {s.categoriesRaw.map((cat) => (
                    <span key={cat} className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-text-muted">{cat}</span>
                  ))}
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
