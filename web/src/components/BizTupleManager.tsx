import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Upload, X as XIcon } from "lucide-react";
import { useTranslation } from "../i18n";
import DataTable, { type Column } from "./DataTable";
import { useModal } from "./Modal";
import * as BizBackend from "../backend/BizBackend";
import type { BizTuple, BizWriteTuplesRequest } from "../backend/BizBackend";

// BizTupleManager — Task 7. List + filter + add + bulk import + bulk
// delete of (object, relation, user) tuples for one ReBAC app. The
// backend does full schema validation on write, so we don't duplicate
// that here — we surface the backend's error verbatim when a row is
// rejected.
//
// Schema-aware validation (restricting subject types per relation) is
// fancy UX but not required for functional correctness; the write
// endpoint catches everything. We only do shape checks client-side
// before sending bulk imports.

interface Props {
  appId: string;
}

interface BulkRow {
  object: string;
  relation: string;
  user: string;
  conditionName?: string;
  conditionContext?: string;
  error?: string;
}

export default function BizTupleManager({ appId }: Props) {
  const { t } = useTranslation();
  const modal = useModal();

  const [tuples, setTuples] = useState<BizTuple[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ object: "", relation: "", user: "" });
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await BizBackend.readBizTuples(appId, filter);
      if (res.status === "ok" && Array.isArray(res.data)) {
        setTuples(res.data);
      } else {
        modal.toast(res.msg || t("rebac.common.error"), "error");
      }
    } finally {
      setLoading(false);
    }
  }, [appId, filter, modal, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleDelete = useCallback(
    async (rows: BizTuple[]) => {
      if (rows.length === 0) return;
      const req: BizWriteTuplesRequest = {
        appId,
        deletes: rows.map((r) => ({
          object: r.object,
          relation: r.relation,
          user: r.user,
        })),
      };
      try {
        const res = await BizBackend.writeBizTuples(req);
        if (res.status !== "ok") {
          modal.toast(res.msg || t("rebac.common.error"), "error");
          return;
        }
        modal.toast(
          `${res.data?.deleted ?? 0} ${t("rebac.tuples.delete")}`,
          "success",
        );
        void refresh();
      } catch (err) {
        modal.toast(err instanceof Error ? err.message : String(err), "error");
      }
    },
    [appId, modal, refresh, t],
  );

  const columns = useMemo<Column<BizTuple>[]>(
    () => [
      {
        key: "object",
        title: t("rebac.tuples.columns.object"),
        sortable: true,
        mono: true,
        sortFn: (a, b) => a.object.localeCompare(b.object),
      },
      {
        key: "relation",
        title: t("rebac.tuples.columns.relation"),
        sortable: true,
        mono: true,
        sortFn: (a, b) => a.relation.localeCompare(b.relation),
      },
      {
        key: "user",
        title: t("rebac.tuples.columns.user"),
        sortable: true,
        mono: true,
        sortFn: (a, b) => a.user.localeCompare(b.user),
      },
      {
        key: "conditionName",
        title: t("rebac.tuples.columns.condition"),
        sortable: true,
        mono: true,
        hideable: true,
        render: (_, r) => r.conditionName || "—",
        sortFn: (a, b) =>
          (a.conditionName || "").localeCompare(b.conditionName || ""),
      },
      {
        key: "actions",
        title: "",
        width: "80px",
        render: (_, r) => (
          <button
            type="button"
            className="p-1 text-text-muted hover:text-danger hover:bg-danger/10 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40"
            aria-label={t("rebac.tuples.delete")}
            onClick={(e) => {
              e.stopPropagation();
              modal.showConfirm(
                `${t("rebac.tuples.delete")}: ${r.object}#${r.relation}@${r.user}`,
                () => void handleDelete([r]),
              );
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        ),
      },
    ],
    [handleDelete, modal, t],
  );

  const rowKey = useCallback(
    (r: BizTuple) => `${r.object}|${r.relation}|${r.user}`,
    [],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <input
            className="px-2 py-1 rounded border border-border bg-surface-0 text-[13px]"
            placeholder={t("rebac.tuples.filter.object")}
            value={filter.object}
            onChange={(e) =>
              setFilter((f) => ({ ...f, object: e.target.value }))
            }
          />
          <input
            className="px-2 py-1 rounded border border-border bg-surface-0 text-[13px]"
            placeholder={t("rebac.tuples.filter.relation")}
            value={filter.relation}
            onChange={(e) =>
              setFilter((f) => ({ ...f, relation: e.target.value }))
            }
          />
          <input
            className="px-2 py-1 rounded border border-border bg-surface-0 text-[13px]"
            placeholder={t("rebac.tuples.filter.user")}
            value={filter.user}
            onChange={(e) =>
              setFilter((f) => ({ ...f, user: e.target.value }))
            }
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] border border-border text-text-primary hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40"
            onClick={() => setImportOpen(true)}
          >
            <Upload className="w-3.5 h-3.5" />
            {t("rebac.tuples.bulkImport")}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium bg-accent-primary text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="w-3.5 h-3.5" />
            {t("rebac.tuples.add")}
          </button>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={tuples}
        rowKey={rowKey}
        loading={loading}
        emptyText={t("rebac.tuples.empty")}
        selectable
        clientSort
        persistKey={`biz-tuples:${appId}`}
        bulkActions={({ selected, clear }) => (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-[12px] bg-danger/10 text-danger hover:bg-danger/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40"
            onClick={() => {
              modal.showConfirm(
                `${t("rebac.tuples.bulkDelete")} (${selected.length})`,
                () => {
                  void handleDelete(selected).then(() => clear());
                },
              );
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
            {t("rebac.tuples.bulkDelete")} ({selected.length})
          </button>
        )}
      />

      {addOpen && (
        <AddTupleDialog
          onClose={() => setAddOpen(false)}
          onSubmit={async (row) => {
            const res = await BizBackend.writeBizTuples({
              appId,
              writes: [row],
            });
            if (res.status !== "ok") {
              modal.toast(res.msg || t("rebac.common.error"), "error");
              return false;
            }
            modal.toast(`${res.data?.written ?? 0} ${t("rebac.tuples.add")}`, "success");
            void refresh();
            return true;
          }}
        />
      )}

      {importOpen && (
        <BulkImportDialog
          onClose={() => setImportOpen(false)}
          onSubmit={async (rows) => {
            const res = await BizBackend.writeBizTuples({
              appId,
              writes: rows,
            });
            if (res.status !== "ok") {
              modal.toast(res.msg || t("rebac.common.error"), "error");
              return false;
            }
            modal.toast(
              `${res.data?.written ?? 0} ${t("rebac.tuples.add")}`,
              "success",
            );
            void refresh();
            return true;
          }}
        />
      )}
    </div>
  );
}

// ── Add tuple dialog ────────────────────────────────────────────────

function AddTupleDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (row: {
    object: string;
    relation: string;
    user: string;
    conditionName?: string;
    conditionContext?: string;
  }) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [object, setObject] = useState("");
  const [relation, setRelation] = useState("");
  const [user, setUser] = useState("");
  const [conditionName, setConditionName] = useState("");
  const [conditionContext, setConditionContext] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = object.trim() && relation.trim() && user.trim() && !saving;

  return (
    <DialogShell title={t("rebac.tuples.addDialog.title")} onClose={onClose}>
      <div className="flex flex-col gap-2.5">
        <Field label={t("rebac.tuples.columns.object")} value={object} onChange={setObject} mono placeholder="document:d1" />
        <Field label={t("rebac.tuples.columns.relation")} value={relation} onChange={setRelation} mono placeholder="viewer" />
        <Field label={t("rebac.tuples.columns.user")} value={user} onChange={setUser} mono placeholder="user:alice" />
        <Field
          label={t("rebac.typeRestriction.condition")}
          value={conditionName}
          onChange={setConditionName}
          mono
          placeholder="(optional)"
        />
        {conditionName && (
          <Field
            label={t("rebac.tuples.conditionContextLabel")}
            value={conditionContext}
            onChange={setConditionContext}
            mono
            placeholder='{"region":"us-east-1"}'
          />
        )}
      </div>
      <div className="flex items-center justify-end gap-2 mt-4">
        <button
          type="button"
          className="px-3 py-1.5 rounded-lg text-[13px] border border-border hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40"
          onClick={onClose}
        >
          {t("rebac.common.cancel")}
        </button>
        <button
          type="button"
          className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-accent-primary text-white hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40"
          disabled={!canSubmit}
          onClick={async () => {
            setSaving(true);
            try {
              const ok = await onSubmit({
                object: object.trim(),
                relation: relation.trim(),
                user: user.trim(),
                conditionName: conditionName.trim() || undefined,
                conditionContext: conditionContext.trim() || undefined,
              });
              if (ok) onClose();
            } finally {
              setSaving(false);
            }
          }}
        >
          {t("rebac.common.save")}
        </button>
      </div>
    </DialogShell>
  );
}

// ── Bulk import dialog ──────────────────────────────────────────────

function BulkImportDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (rows: BulkRow[]) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [format, setFormat] = useState<"csv" | "json">("csv");
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState<BulkRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reparse = useCallback(() => {
    try {
      setParsed(format === "csv" ? parseCsv(raw) : parseJson(raw));
      setParseError(null);
    } catch (err) {
      setParsed([]);
      setParseError(err instanceof Error ? err.message : String(err));
    }
  }, [raw, format]);

  useEffect(() => {
    if (!raw.trim()) {
      setParsed([]);
      setParseError(null);
      return;
    }
    reparse();
  }, [raw, format, reparse]);

  const validCount = parsed.filter((r) => !r.error).length;

  return (
    <DialogShell title={t("rebac.tuples.bulkImportDialog.title")} onClose={onClose} wide>
      <div className="flex items-center gap-2 mb-2">
        <select
          className="px-2 py-1 rounded border border-border bg-surface-0 text-[13px]"
          value={format}
          onChange={(e) => setFormat(e.target.value as "csv" | "json")}
        >
          <option value="csv">CSV</option>
          <option value="json">JSON</option>
        </select>
        <span className="text-[12px] text-text-muted">
          {format === "csv"
            ? "object,relation,user[,conditionName][,conditionContext]"
            : '[{"object":"document:d1","relation":"viewer","user":"user:alice"}]'}
        </span>
      </div>
      <textarea
        className="w-full h-40 px-2 py-1 rounded border border-border bg-surface-0 text-[12px] font-mono"
        placeholder={t("rebac.tuples.bulkImportPlaceholder")}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
      />
      {parseError && (
        <div className="mt-2 px-2 py-1 rounded bg-danger/10 text-danger text-[12px]">
          {parseError}
        </div>
      )}
      {parsed.length > 0 && (
        <div className="mt-2 max-h-48 overflow-auto border border-border rounded">
          <table className="w-full text-[12px]">
            <thead className="bg-surface-1 sticky top-0">
              <tr>
                <th className="px-2 py-1 text-left">#</th>
                <th className="px-2 py-1 text-left">object</th>
                <th className="px-2 py-1 text-left">relation</th>
                <th className="px-2 py-1 text-left">user</th>
                <th className="px-2 py-1 text-left">cond</th>
                <th className="px-2 py-1 text-left">error</th>
              </tr>
            </thead>
            <tbody>
              {parsed.map((r, i) => (
                <tr key={i} className={r.error ? "bg-danger/5" : ""}>
                  <td className="px-2 py-1 text-text-muted font-mono">{i + 1}</td>
                  <td className="px-2 py-1 font-mono">{r.object}</td>
                  <td className="px-2 py-1 font-mono">{r.relation}</td>
                  <td className="px-2 py-1 font-mono">{r.user}</td>
                  <td className="px-2 py-1 font-mono">{r.conditionName || ""}</td>
                  <td className="px-2 py-1 text-danger font-mono">
                    {r.error || ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center justify-between gap-2 mt-3">
        <span className="text-[12px] text-text-muted">
          {validCount} / {parsed.length} valid
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg text-[13px] border border-border hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40"
            onClick={onClose}
          >
            {t("rebac.common.cancel")}
          </button>
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-accent-primary text-white hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40"
            disabled={validCount === 0 || saving}
            onClick={async () => {
              setSaving(true);
              try {
                const ok = await onSubmit(parsed.filter((r) => !r.error));
                if (ok) onClose();
              } finally {
                setSaving(false);
              }
            }}
          >
            {t("rebac.common.save")} ({validCount})
          </button>
        </div>
      </div>
    </DialogShell>
  );
}

// ── Shared dialog shell ─────────────────────────────────────────────

function DialogShell({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className={`bg-surface-0 rounded-xl shadow-2xl border border-border p-5 ${
          wide ? "w-[720px] max-w-[95vw]" : "w-[480px] max-w-[95vw]"
        }`}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[14px] font-semibold text-text-primary">
            {title}
          </h3>
          <button
            type="button"
            className="p-1 text-text-muted hover:text-text-primary rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40"
            aria-label="close"
            onClick={onClose}
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-text-muted font-medium">{label}</label>
      <input
        className={`px-2 py-1 rounded border border-border bg-surface-1 text-[13px] ${
          mono ? "font-mono" : ""
        }`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

// ── Parsers ─────────────────────────────────────────────────────────

function parseCsv(text: string): BulkRow[] {
  const rows: BulkRow[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip a header row that looks like "object,relation,user".
    if (i === 0 && /^object\s*,/i.test(line)) continue;
    const parts = splitCsvLine(line);
    const row: BulkRow = {
      object: (parts[0] || "").trim(),
      relation: (parts[1] || "").trim(),
      user: (parts[2] || "").trim(),
      conditionName: (parts[3] || "").trim() || undefined,
      conditionContext: (parts[4] || "").trim() || undefined,
    };
    rows.push(annotate(row));
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  // Minimal CSV parser with support for "quoted, fields".
  const out: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuote = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuote = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseJson(text: string): BulkRow[] {
  const raw = JSON.parse(text);
  if (!Array.isArray(raw)) throw new Error("expected a JSON array");
  return raw.map((r: unknown) => {
    const v = r as Record<string, unknown>;
    const row: BulkRow = {
      object: String(v.object || ""),
      relation: String(v.relation || ""),
      user: String(v.user || ""),
      conditionName: v.conditionName ? String(v.conditionName) : undefined,
      conditionContext: v.conditionContext ? String(v.conditionContext) : undefined,
    };
    return annotate(row);
  });
}

function annotate(r: BulkRow): BulkRow {
  if (!r.object || !r.relation || !r.user) {
    return { ...r, error: "missing object/relation/user" };
  }
  if (!r.object.includes(":")) {
    return { ...r, error: "object must be type:id" };
  }
  return r;
}
