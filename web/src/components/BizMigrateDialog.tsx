import { useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "../i18n";
import * as BizBackend from "../backend/BizBackend";

type OnConflict = "skip" | "overwrite";

interface Props {
  appId: string; // owner/appName
  onClose: () => void;
  /** Called after a successful (committed) import so the caller can refresh its data. */
  onImported: (report: BizBackend.BizMigrationReport) => void;
}

// "Import from platform permissions": dry-run preview first, then confirm.
// Changing the conflict policy invalidates the preview, so the admin always
// confirms exactly what they saw.
export default function BizMigrateDialog({ appId, onClose, onImported }: Props) {
  const { t } = useTranslation();
  const [onConflict, setOnConflict] = useState<OnConflict>("skip");
  const [report, setReport] = useState<BizBackend.BizMigrationReport | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const [error, setError] = useState("");

  const run = async (dryRun: boolean) => {
    setBusy(dryRun ? "preview" : "import");
    setError("");
    try {
      const res = await BizBackend.migrateBizFromPermission(appId, { dryRun, onConflict });
      if (res.status !== "ok" || !res.data) {
        setError(res.msg || t("common.error"));
        return;
      }
      if (dryRun) {
        setReport(res.data);
      } else {
        onImported(res.data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(null);
    }
  };

  const changeConflict = (v: OnConflict) => {
    setOnConflict(v);
    setReport(null); // preview no longer matches the chosen policy
  };

  const issues = report?.issues ?? [];
  const writes = report
    ? report.roles.create + report.roles.update + report.permissions.create + report.permissions.update +
      report.memberAdds + report.granteeAdds + report.inheritanceAdds
    : 0;

  const counts = (label: string, c: BizBackend.BizMigrationCounts) => (
    <div className="rounded-lg border border-border bg-surface-2/50 px-3 py-2">
      <div className="text-[11px] font-semibold text-text-muted">{label}</div>
      <div className="mt-1 flex flex-wrap gap-x-3 text-[12px] text-text-primary">
        <span>{c.create} {t("bizMigrate.create")}</span>
        <span>{c.update} {t("bizMigrate.update")}</span>
        <span>{c.skip} {t("bizMigrate.skip")}</span>
        {c.failed > 0 && <span className="text-danger">{c.failed} {t("bizMigrate.invalid")}</span>}
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("bizMigrate.title")}
        className="relative z-10 w-full max-w-2xl rounded-xl border border-border bg-surface-1 shadow-[var(--shadow-elevated)] max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-[15px] font-semibold">{t("bizMigrate.title")}</h3>
          <button onClick={onClose} aria-label={t("common.cancel")} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-[12px] text-text-secondary">{t("bizMigrate.intro")}</p>

          <fieldset className="space-y-1.5">
            <legend className="text-[12px] font-medium text-text-primary mb-1">{t("bizMigrate.onConflict")}</legend>
            {(["skip", "overwrite"] as const).map((v) => (
              <label key={v} className="flex items-center gap-2 text-[12px] text-text-secondary">
                <input
                  type="radio"
                  name="bizMigrateOnConflict"
                  checked={onConflict === v}
                  onChange={() => changeConflict(v)}
                />
                {t(`bizMigrate.conflict.${v}`)}
              </label>
            ))}
          </fieldset>

          {error && <div role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[12px] text-danger">{error}</div>}

          {report && (
            <div className="space-y-3" data-testid="bizMigrateReport">
              <div className="grid grid-cols-2 gap-3">
                {counts(t("bizMigrate.roles"), report.roles)}
                {counts(t("bizMigrate.permissions"), report.permissions)}
              </div>
              <div className="text-[12px] text-text-secondary">
                {t("bizMigrate.relations", { members: report.memberAdds, grantees: report.granteeAdds, edges: report.inheritanceAdds })}
              </div>
              {writes === 0 && <div className="text-[12px] text-text-muted">{t("bizMigrate.nothingToDo")}</div>}
              {issues.length === 0 ? (
                <div className="text-[12px] text-text-muted">{t("bizMigrate.noIssues")}</div>
              ) : (
                <div>
                  <div className="text-[12px] font-semibold text-text-primary mb-1">{t("bizMigrate.issues", { count: issues.length })}</div>
                  <ul className="max-h-56 overflow-y-auto space-y-1 rounded-lg border border-border p-2">
                    {issues.map((is, i) => (
                      <li key={i} className="text-[11px] text-text-secondary">
                        <span className={`mr-1.5 rounded px-1 py-0.5 text-[10px] font-semibold ${
                          is.kind === "invalid" ? "bg-danger/10 text-danger" : is.kind === "conflict" ? "bg-warning/15 text-warning" : "bg-surface-3 text-text-muted"
                        }`}>{t(`bizMigrate.kind.${is.kind}`)}</span>
                        <span className="font-mono">{is.entity}:{is.name}</span>
                        {is.field ? <span className="font-mono text-text-muted"> [{is.field}]</span> : null}
                        {" — "}{is.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors">
            {t("common.cancel")}
          </button>
          <button
            onClick={() => run(true)}
            disabled={busy !== null}
            className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-text-primary hover:bg-surface-2 disabled:opacity-50 transition-colors"
          >
            {busy === "preview" ? t("bizMigrate.previewing") : t("bizMigrate.preview")}
          </button>
          <button
            onClick={() => run(false)}
            disabled={busy !== null || !report || writes === 0}
            className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {busy === "import" ? t("bizMigrate.importing") : t("bizMigrate.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
