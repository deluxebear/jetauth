import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Cpu, HardDrive, MemoryStick, Network, ExternalLink, Globe, MessageSquare } from "lucide-react";
import { useTranslation } from "../i18n";
import * as SystemBackend from "../backend/SystemBackend";
import type { SystemInfo, VersionInfo, PrometheusInfo } from "../backend/SystemBackend";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

function ProgressBar({ percent, label }: { percent: number; label?: string }) {
  const color = percent >= 90 ? "bg-danger" : percent >= 70 ? "bg-warning" : "bg-accent";
  return (
    <div className="flex items-center gap-3">
      {label && <span className="text-[12px] text-text-muted w-14 shrink-0">{label}</span>}
      <div className="flex-1 h-2 rounded-full bg-surface-3 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
      <span className="text-[12px] font-mono text-text-secondary w-12 text-right">{percent.toFixed(1)}%</span>
    </div>
  );
}

function CircleProgress({ percent, size = 100 }: { percent: number; size?: number }) {
  const r = (size - 8) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (Math.min(percent, 100) / 100) * circumference;
  const color = percent >= 90 ? "stroke-danger" : percent >= 70 ? "stroke-warning" : "stroke-accent";
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={6} className="stroke-surface-3" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={6} className={`${color} transition-all duration-500`}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <span className="absolute text-[14px] font-bold font-mono text-text-primary">{percent.toFixed(1)}%</span>
    </div>
  );
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};

export default function SystemInfoPage() {
  const { t } = useTranslation();
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [promInfo, setPromInfo] = useState<PrometheusInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Initial fetch
    SystemBackend.getSystemInfo().then((res) => {
      if (res.status === "ok") setSysInfo(res.data);
      setLoading(false);
    }).catch(() => setLoading(false));

    SystemBackend.getVersionInfo().then((res) => {
      if (res.status === "ok") setVersionInfo(res.data);
    }).catch(() => {});

    SystemBackend.getPrometheusInfo().then((res) => {
      if (res.status === "ok") setPromInfo(res.data);
    }).catch(() => {});

    // Poll every 2 seconds (same as original)
    intervalRef.current = setInterval(() => {
      SystemBackend.getSystemInfo().then((res) => {
        if (res.status === "ok") setSysInfo(res.data);
      }).catch(() => {});
      SystemBackend.getPrometheusInfo().then((res) => {
        if (res.status === "ok") setPromInfo(res.data);
      }).catch(() => {});
    }, 2000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const memPercent = sysInfo && sysInfo.memoryTotal > 0 ? (sysInfo.memoryUsed / sysInfo.memoryTotal) * 100 : 0;
  const diskPercent = sysInfo && sysInfo.diskTotal > 0 ? (sysInfo.diskUsed / sysInfo.diskTotal) * 100 : 0;

  let versionText = versionInfo?.version || t("sysinfo.unknownVersion" as any);
  if (versionInfo && versionInfo.commitOffset > 0) {
    versionText += ` (ahead+${versionInfo.commitOffset})`;
  }
  const versionLink = versionInfo?.version ? `https://github.com/casdoor/casdoor/releases/tag/${versionInfo.version}` : "";

  return (
    <div className="space-y-6  mx-auto">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{t("sysinfo.title" as any)}</h1>
        <p className="text-[13px] text-text-muted mt-0.5">{t("sysinfo.subtitle" as any)}</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
        </div>
      ) : (
        <>
          {/* CPU + Memory */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <motion.div variants={fadeUp} initial="hidden" animate="show" className="rounded-xl border border-border bg-surface-1 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Cpu size={16} className="text-accent" />
                <h2 className="text-sm font-semibold">{t("sysinfo.cpuUsage" as any)}</h2>
              </div>
              <div className="space-y-2.5">
                {sysInfo?.cpuUsage?.length ? sysInfo.cpuUsage.map((usage, i) => (
                  <ProgressBar key={i} percent={Number(usage.toFixed(1))} label={`Core ${i}`} />
                )) : <span className="text-[13px] text-text-muted">{t("sysinfo.noData" as any)}</span>}
              </div>
            </motion.div>

            <motion.div variants={fadeUp} initial="hidden" animate="show" className="rounded-xl border border-border bg-surface-1 p-5">
              <div className="flex items-center gap-2 mb-4">
                <MemoryStick size={16} className="text-info" />
                <h2 className="text-sm font-semibold">{t("sysinfo.memoryUsage" as any)}</h2>
              </div>
              <div className="flex flex-col items-center gap-3">
                <CircleProgress percent={memPercent} />
                <span className="text-[13px] font-mono text-text-secondary">
                  {sysInfo ? `${formatBytes(sysInfo.memoryUsed)} / ${formatBytes(sysInfo.memoryTotal)}` : "—"}
                </span>
              </div>
            </motion.div>
          </div>

          {/* Disk + Network */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <motion.div variants={fadeUp} initial="hidden" animate="show" className="rounded-xl border border-border bg-surface-1 p-5">
              <div className="flex items-center gap-2 mb-4">
                <HardDrive size={16} className="text-warning" />
                <h2 className="text-sm font-semibold">{t("sysinfo.diskUsage" as any)}</h2>
              </div>
              <div className="flex flex-col items-center gap-3">
                <CircleProgress percent={diskPercent} />
                <span className="text-[13px] font-mono text-text-secondary">
                  {sysInfo ? `${formatBytes(sysInfo.diskUsed)} / ${formatBytes(sysInfo.diskTotal)}` : "—"}
                </span>
              </div>
            </motion.div>

            <motion.div variants={fadeUp} initial="hidden" animate="show" className="rounded-xl border border-border bg-surface-1 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Network size={16} className="text-success" />
                <h2 className="text-sm font-semibold">{t("sysinfo.networkUsage" as any)}</h2>
              </div>
              <div className="space-y-3 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-text-muted">{t("sysinfo.sent" as any)}</span>
                  <span className="font-mono text-text-secondary">{sysInfo ? formatBytes(sysInfo.networkSent) : "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">{t("sysinfo.received" as any)}</span>
                  <span className="font-mono text-text-secondary">{sysInfo ? formatBytes(sysInfo.networkRecv) : "—"}</span>
                </div>
                <div className="border-t border-border-subtle pt-3 flex justify-between">
                  <span className="font-semibold text-text-primary">{t("sysinfo.totalThroughput" as any)}</span>
                  <span className="font-mono font-semibold text-text-primary">{sysInfo ? formatBytes(sysInfo.networkTotal) : "—"}</span>
                </div>
              </div>
            </motion.div>
          </div>

          {/* API Latency */}
          {promInfo?.apiLatency && promInfo.apiLatency.length > 0 && (
            <motion.div variants={fadeUp} initial="hidden" animate="show" className="rounded-xl border border-border bg-surface-1 p-5">
              <h2 className="text-sm font-semibold mb-4">{t("sysinfo.apiLatency" as any)}</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-border text-left text-text-muted">
                      <th className="py-2 pr-4">{t("sysinfo.endpoint" as any)}</th>
                      <th className="py-2 pr-4">{t("records.field.method" as any)}</th>
                      <th className="py-2 pr-4 text-right">{t("sysinfo.requestCount" as any)}</th>
                      <th className="py-2 text-right">{t("sysinfo.avgLatency" as any)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {promInfo.apiLatency.map((item, i) => (
                      <tr key={i} className="border-b border-border-subtle hover:bg-surface-2/30">
                        <td className="py-2 pr-4 font-mono text-text-primary">{item.name}</td>
                        <td className="py-2 pr-4 font-mono">{item.method}</td>
                        <td className="py-2 pr-4 text-right font-mono">{item.count}</td>
                        <td className="py-2 text-right font-mono">{item.latency}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {/* API Throughput */}
          {promInfo?.apiThroughput && promInfo.apiThroughput.length > 0 && (
            <motion.div variants={fadeUp} initial="hidden" animate="show" className="rounded-xl border border-border bg-surface-1 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold">{t("sysinfo.apiThroughput" as any)}</h2>
                <span className="text-[12px] font-mono text-text-muted">{t("sysinfo.totalThroughput" as any)}: {promInfo.totalThroughput?.toFixed(2)} req/s</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-border text-left text-text-muted">
                      <th className="py-2 pr-4">{t("sysinfo.endpoint" as any)}</th>
                      <th className="py-2 pr-4">{t("records.field.method" as any)}</th>
                      <th className="py-2 text-right">{t("sysinfo.throughput" as any)} (req/s)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {promInfo.apiThroughput.map((item, i) => (
                      <tr key={i} className="border-b border-border-subtle hover:bg-surface-2/30">
                        <td className="py-2 pr-4 font-mono text-text-primary">{item.name}</td>
                        <td className="py-2 pr-4 font-mono">{item.method}</td>
                        <td className="py-2 text-right font-mono">{item.throughput?.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {/* About Casdoor */}
          <motion.div variants={fadeUp} initial="hidden" animate="show" className="rounded-xl border border-border bg-surface-1 p-5">
            <h2 className="text-sm font-semibold mb-4">{t("sysinfo.aboutCasdoor" as any)}</h2>
            <p className="text-[13px] text-text-secondary mb-4">{t("sysinfo.description" as any)}</p>
            <div className="space-y-2 text-[13px]">
              <div className="flex items-center gap-2">
                <ExternalLink size={14} className="text-text-muted" />
                <span className="text-text-muted">GitHub:</span>
                <a href="https://github.com/casdoor/casdoor" target="_blank" rel="noreferrer" className="text-accent hover:underline">Casdoor</a>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3.5" />
                <span className="text-text-muted">{t("sysinfo.version" as any)}:</span>
                {versionLink ? (
                  <a href={versionLink} target="_blank" rel="noreferrer" className="text-accent hover:underline font-mono">{versionText}</a>
                ) : (
                  <span className="font-mono text-text-secondary">{versionText}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Globe size={14} className="text-text-muted" />
                <span className="text-text-muted">{t("sysinfo.website" as any)}:</span>
                <a href="https://casdoor.org" target="_blank" rel="noreferrer" className="text-accent hover:underline">https://casdoor.org</a>
              </div>
              <div className="flex items-center gap-2">
                <MessageSquare size={14} className="text-text-muted" />
                <span className="text-text-muted">{t("sysinfo.community" as any)}:</span>
                <a href="https://casdoor.org/#:~:text=Casdoor%20API-,Community,-GitHub" target="_blank" rel="noreferrer" className="text-accent hover:underline">Get in Touch!</a>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
}
