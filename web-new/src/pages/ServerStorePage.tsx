import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Search, X, ExternalLink, Plus, Globe } from "lucide-react";
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

function normalizeServers(data: any): NormalizedServer[] {
  // Extract server array from various response shapes
  let raw: any[] = [];
  if (Array.isArray(data?.servers)) raw = data.servers;
  else if (Array.isArray(data)) raw = data;
  else if (Array.isArray(data?.data)) raw = data.data;

  return raw
    .map((s: any, i: number) => {
      const categoriesRaw = [s?.category].filter((c: any) => typeof c === "string" && c.trim() !== "");
      return {
        id: s.id ?? `${s.name ?? "server"}-${i}`,
        name: s.name ?? "",
        nameText: (s.name ?? "").toLowerCase(),
        categoriesRaw,
        categoriesLower: categoriesRaw.map((c: string) => c.toLowerCase()),
        endpoint: s.endpoints?.production ?? s.endpoint ?? "",
        description: s.description ?? "",
        website: s?.maintainer?.website ?? s?.website ?? "",
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

  const servers = useMemo(() => normalizeServers(mcpRegistry), []);
  const [nameFilter, setNameFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [creatingId, setCreatingId] = useState("");

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
        modal.toast(res.msg || t("common.addFailed" as any), "error");
      }
    } catch {
      modal.toast(t("common.addFailed" as any), "error");
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/servers")} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors" title={t("common.back" as any)}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{t("serverStore.title" as any)}</h1>
            <p className="text-[13px] text-text-muted mt-0.5">{t("serverStore.subtitle" as any)}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-[360px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            placeholder={t("serverStore.searchPlaceholder" as any)}
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
      {filtered.length === 0 ? (
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
                  {t("common.add" as any)}
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
