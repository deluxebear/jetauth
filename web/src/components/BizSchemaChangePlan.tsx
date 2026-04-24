import { useMemo } from "react";
import { AlertTriangle, ArrowRight, Plus, Minus, X } from "lucide-react";
import { useTranslation } from "../i18n";
import { diffLines, diffSchemas } from "./bizSchemaDiff";
import type { BizSchemaConflict } from "../backend/BizBackend";
import type { SchemaAST } from "./bizSchemaAst";

// Pre-save review modal for schema changes. Shows three stacked
// sections:
//   1. Structural summary (types/relations added/removed)
//   2. Line-level DSL diff (red/green)
//   3. Affected tuples grouped by the relation that was removed
//
// The admin can cancel, or acknowledge and save anyway (which, for
// the "conflict" outcome, requires deleting the affected tuples
// first — the button wording reflects that).

interface Props {
  open: boolean;
  savedDsl: string;
  nextDsl: string;
  /** Optional parsed ASTs. When provided, we use them directly; when
   *  omitted, the structural diff falls back to empty AST (so the
   *  component stays renderable even if the caller can't parse). */
  savedAst?: SchemaAST;
  nextAst?: SchemaAST;
  conflicts: BizSchemaConflict[];
  saving?: boolean;
  onCancel: () => void;
  onForceCleanupAndSave: () => void;
}

export default function BizSchemaChangePlan({
  open,
  savedDsl,
  nextDsl,
  savedAst,
  nextAst,
  conflicts,
  saving,
  onCancel,
  onForceCleanupAndSave,
}: Props) {
  const { t } = useTranslation();

  const lineDiff = useMemo(
    () => diffLines(savedDsl, nextDsl),
    [savedDsl, nextDsl],
  );
  const structural = useMemo(() => {
    const before: SchemaAST = savedAst ?? { schemaVersion: "1.1", types: [] };
    const after: SchemaAST = nextAst ?? { schemaVersion: "1.1", types: [] };
    return diffSchemas(before, after);
  }, [savedAst, nextAst]);
  const conflictsByRelation = useMemo(() => {
    const groups = new Map<string, BizSchemaConflict[]>();
    for (const c of conflicts) {
      const key = `${c.object.split(":")[0]}#${c.relation}`;
      const arr = groups.get(key) ?? [];
      arr.push(c);
      groups.set(key, arr);
    }
    return groups;
  }, [conflicts]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("rebac.schema.plan.title")}
    >
      <div className="w-full max-w-3xl max-h-[90vh] rounded-xl bg-surface-1 border border-border shadow-xl flex flex-col">
        <header className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-warning" aria-hidden />
            <h2 className="text-[14px] font-semibold text-text-primary">
              {t("rebac.schema.plan.title")}
            </h2>
          </div>
          <button
            type="button"
            aria-label={t("rebac.common.cancel")}
            className="text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40 rounded"
            onClick={onCancel}
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="overflow-auto p-4 flex flex-col gap-4">
          {/* Section 1: structural summary */}
          <section>
            <h3 className="text-[12px] font-semibold text-text-muted uppercase tracking-wide mb-2">
              {t("rebac.schema.plan.summary")}
            </h3>
            <ul className="text-[13px] space-y-1">
              {structural.typesAdded.length > 0 && (
                <li className="text-success">
                  <Plus className="inline w-3.5 h-3.5 mr-1" aria-hidden />
                  {structural.typesAdded.length}{" "}
                  {t("rebac.schema.plan.typesAdded")}
                  <span className="ml-2 font-mono text-[12px] text-text-muted">
                    {structural.typesAdded.join(", ")}
                  </span>
                </li>
              )}
              {structural.typesRemoved.length > 0 && (
                <li className="text-danger">
                  <Minus className="inline w-3.5 h-3.5 mr-1" aria-hidden />
                  {structural.typesRemoved.length}{" "}
                  {t("rebac.schema.plan.typesRemoved")}
                  <span className="ml-2 font-mono text-[12px] text-text-muted">
                    {structural.typesRemoved.join(", ")}
                  </span>
                </li>
              )}
              {structural.relationsAdded.length > 0 && (
                <li className="text-success">
                  <Plus className="inline w-3.5 h-3.5 mr-1" aria-hidden />
                  {structural.relationsAdded.length}{" "}
                  {t("rebac.schema.plan.relationsAdded")}
                  <span className="ml-2 font-mono text-[12px] text-text-muted">
                    {structural.relationsAdded.join(", ")}
                  </span>
                </li>
              )}
              {structural.relationsRemoved.length > 0 && (
                <li className="text-danger">
                  <Minus className="inline w-3.5 h-3.5 mr-1" aria-hidden />
                  {structural.relationsRemoved.length}{" "}
                  {t("rebac.schema.plan.relationsRemoved")}
                  <span className="ml-2 font-mono text-[12px] text-text-muted">
                    {structural.relationsRemoved.join(", ")}
                  </span>
                </li>
              )}
              {structural.typesAdded.length === 0 &&
                structural.typesRemoved.length === 0 &&
                structural.relationsAdded.length === 0 &&
                structural.relationsRemoved.length === 0 && (
                  <li className="text-text-muted text-[12px]">
                    {t("rebac.schema.plan.noStructuralChange")}
                  </li>
                )}
            </ul>
          </section>

          {/* Section 2: DSL line diff */}
          <section>
            <h3 className="text-[12px] font-semibold text-text-muted uppercase tracking-wide mb-2">
              {t("rebac.schema.plan.diff")}
            </h3>
            <pre className="rounded border border-border bg-surface-2 text-[12px] font-mono overflow-auto max-h-[260px]">
              {lineDiff.map((l, i) => {
                const bg =
                  l.kind === "added"
                    ? "bg-success/10"
                    : l.kind === "removed"
                      ? "bg-danger/10"
                      : "";
                const prefix =
                  l.kind === "added" ? "+" : l.kind === "removed" ? "-" : " ";
                return (
                  <div key={i} className={`px-2 ${bg}`}>
                    <span className="inline-block w-3 text-text-muted">
                      {prefix}
                    </span>
                    {l.text || " "}
                  </div>
                );
              })}
            </pre>
          </section>

          {/* Section 3: conflict tuples grouped */}
          {conflictsByRelation.size > 0 && (
            <section>
              <h3 className="text-[12px] font-semibold text-text-muted uppercase tracking-wide mb-2">
                {t("rebac.schema.plan.conflicts")} · {conflicts.length}{" "}
                {t("rebac.schema.plan.tuplesAffected")}
              </h3>
              <div className="space-y-2">
                {Array.from(conflictsByRelation.entries()).map(
                  ([key, group]) => (
                    <details
                      key={key}
                      className="rounded border border-danger/30 bg-danger/5"
                    >
                      <summary className="px-2 py-1 text-[12px] cursor-pointer font-mono">
                        {key}{" "}
                        <span className="text-text-muted">
                          · {group.length}{" "}
                          {t("rebac.schema.plan.tuplesAffected")}
                        </span>
                      </summary>
                      <ul className="px-2 py-1 space-y-0.5 max-h-40 overflow-auto">
                        {group.map((c) => (
                          <li
                            key={c.tupleId}
                            className="text-[11px] font-mono text-text-primary"
                          >
                            <span className="text-text-muted">
                              #{c.tupleId}
                            </span>{" "}
                            {c.object}#{c.relation}@{c.user}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ),
                )}
              </div>
            </section>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg text-[13px] border border-border hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40"
            onClick={onCancel}
          >
            {t("rebac.common.cancel")}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium bg-danger text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
            disabled={saving}
            onClick={onForceCleanupAndSave}
          >
            <ArrowRight className="w-3.5 h-3.5" />
            {conflicts.length > 0
              ? t("rebac.schema.plan.cleanupAndSave")
              : t("rebac.schema.plan.saveAnyway")}
          </button>
        </footer>
      </div>
    </div>
  );
}
