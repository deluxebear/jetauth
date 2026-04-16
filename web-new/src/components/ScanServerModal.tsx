import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, Plus } from "lucide-react";
import { useTranslation } from "../i18n";
import { useModal } from "./Modal";
import * as ServerBackend from "../backend/ServerBackend";
import type { ScannedServer } from "../backend/ServerBackend";

interface ScanServerModalProps {
  open: boolean;
  onClose: () => void;
  onAddServer: (server: ScannedServer) => void;
}

const CIDR_PRESETS = ["127.0.0.1/32", "10.0.0.0/24", "172.16.0.0/24", "192.168.1.0/24"];
const PORT_PRESETS = ["1-65535", "80", "443", "3000", "8080"];
const PATH_PRESETS = ["/", "/mcp", "/sse", "/mcp/sse"];

function TagInput({ values, onChange, presets, placeholder }: {
  values: string[];
  onChange: (v: string[]) => void;
  presets: string[];
  placeholder: string;
}) {
  const [input, setInput] = useState("");

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
    setInput("");
  };

  const removeTag = (tag: string) => {
    onChange(values.filter((v) => v !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && input.trim()) {
      e.preventDefault();
      addTag(input);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span key={v} className="flex items-center gap-1 rounded-md bg-accent/10 text-accent px-2 py-0.5 text-[12px] font-medium">
            {v}
            <button onClick={() => removeTag(v)} className="hover:text-danger transition-colors"><X size={11} /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-[12px] focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition-colors"
        />
      </div>
      <div className="flex flex-wrap gap-1">
        {presets.filter((p) => !values.includes(p)).map((p) => (
          <button key={p} onClick={() => addTag(p)} className="rounded-md border border-border bg-surface-1 px-2 py-0.5 text-[11px] text-text-muted hover:bg-surface-2 hover:text-text-secondary transition-colors">
            + {p}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ScanServerModal({ open, onClose, onAddServer }: ScanServerModalProps) {
  const { t } = useTranslation();
  const modal = useModal();

  const [cidrs, setCidrs] = useState<string[]>(["127.0.0.1/32"]);
  const [ports, setPorts] = useState<string[]>(["1-65535"]);
  const [paths, setPaths] = useState<string[]>(["/", "/mcp", "/sse", "/mcp/sse"]);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<{ scannedHosts: number; onlineHosts: string[]; servers: ScannedServer[] } | null>(null);
  const [addingUrl, setAddingUrl] = useState("");
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const handleScan = async () => {
    const cleanCidrs = cidrs.filter(Boolean);
    const cleanPorts = ports.filter(Boolean);

    if (cleanCidrs.length === 0) {
      modal.toast(t("scanServer.error.noCidr" as any), "error");
      return;
    }
    if (cleanPorts.length === 0) {
      modal.toast(t("scanServer.error.noPort" as any), "error");
      return;
    }

    // Validate ports
    for (const p of cleanPorts) {
      if (!/^\d+(-\d+)?$/.test(p)) {
        modal.toast(`${t("scanServer.error.invalidPort" as any)}: ${p}`, "error");
        return;
      }
    }

    setScanning(true);
    setResult(null);
    try {
      const res = await ServerBackend.syncIntranetServers({
        cidrs: cleanCidrs,
        ports: cleanPorts,
        paths: paths.filter(Boolean),
      });
      if (!mountedRef.current) return;
      if (res.status === "ok" && res.data) {
        setResult({
          scannedHosts: res.data.scannedHosts,
          onlineHosts: res.data.onlineHosts || [],
          servers: res.data.servers || [],
        });
      } else {
        modal.toast(res.msg || t("common.loadFailed" as any), "error");
      }
    } catch {
      if (mountedRef.current) modal.toast(t("common.loadFailed" as any), "error");
    } finally {
      if (mountedRef.current) setScanning(false);
    }
  };

  const handleAddScanned = async (server: ScannedServer) => {
    setAddingUrl(server.url);
    onAddServer(server);
    setAddingUrl("");
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/40"
          onClick={!scanning ? onClose : undefined}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }}
          className="relative w-full max-w-[960px] max-h-[85vh] bg-surface-0 rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col z-10"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h2 className="text-[16px] font-bold">{t("scanServer.title" as any)}</h2>
            <button onClick={onClose} disabled={scanning} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors disabled:opacity-50">
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            {/* CIDR */}
            <div>
              <label className="text-[13px] font-medium text-text-secondary mb-1.5 block">{t("scanServer.field.ipRange" as any)}</label>
              <TagInput values={cidrs} onChange={setCidrs} presets={CIDR_PRESETS} placeholder={t("scanServer.placeholder.cidr" as any)} />
            </div>

            {/* Ports */}
            <div>
              <label className="text-[13px] font-medium text-text-secondary mb-1.5 block">{t("scanServer.field.ports" as any)}</label>
              <TagInput values={ports} onChange={setPorts} presets={PORT_PRESETS} placeholder={t("scanServer.placeholder.ports" as any)} />
            </div>

            {/* Paths */}
            <div>
              <label className="text-[13px] font-medium text-text-secondary mb-1.5 block">{t("scanServer.field.paths" as any)}</label>
              <TagInput values={paths} onChange={setPaths} presets={PATH_PRESETS} placeholder={t("scanServer.placeholder.paths" as any)} />
            </div>

            {/* Results */}
            {result && (
              <div className="space-y-2">
                <div className="text-[12px] text-text-muted">
                  {t("scanServer.result.scannedHosts" as any)}: {result.scannedHosts} &nbsp;|&nbsp;
                  {t("scanServer.result.onlineHosts" as any)}: {result.onlineHosts.length} &nbsp;|&nbsp;
                  {t("scanServer.result.foundServers" as any)}: {result.servers.length}
                </div>
                {result.servers.length > 0 ? (
                  <div className="overflow-hidden rounded-lg border border-border max-h-[320px] overflow-y-auto">
                    <table className="w-full text-[12px]">
                      <thead className="sticky top-0">
                        <tr className="bg-surface-1 border-b border-border">
                          <th className="px-3 py-2 text-left font-medium text-text-secondary w-[140px]">Host</th>
                          <th className="px-3 py-2 text-left font-medium text-text-secondary w-[90px]">Port</th>
                          <th className="px-3 py-2 text-left font-medium text-text-secondary w-[120px]">Path</th>
                          <th className="px-3 py-2 text-left font-medium text-text-secondary">URL</th>
                          <th className="px-3 py-2 text-center font-medium text-text-secondary w-[80px]">{t("common.action" as any)}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.servers.map((s, i) => (
                          <tr key={`${s.url}-${i}`} className="border-b border-border last:border-b-0 hover:bg-surface-1/50">
                            <td className="px-3 py-1.5 font-mono">{s.host}</td>
                            <td className="px-3 py-1.5 font-mono">{s.port}</td>
                            <td className="px-3 py-1.5 font-mono">{s.path}</td>
                            <td className="px-3 py-1.5">
                              <a href={s.url} target="_blank" rel="noreferrer" className="text-accent hover:underline font-mono truncate block max-w-[300px]">{s.url}</a>
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              <button
                                onClick={() => handleAddScanned(s)}
                                disabled={addingUrl === s.url}
                                className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
                              >
                                <Plus size={11} /> {t("common.add" as any)}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-text-muted text-[13px]">{t("common.noData")}</div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-border">
            <button onClick={onClose} disabled={scanning} className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-text-secondary hover:bg-surface-2 transition-colors disabled:opacity-50">
              {t("common.cancel" as any)}
            </button>
            <button
              onClick={handleScan}
              disabled={scanning}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {scanning ? (
                <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                <Search size={14} />
              )}
              {t("scanServer.scan" as any)}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
