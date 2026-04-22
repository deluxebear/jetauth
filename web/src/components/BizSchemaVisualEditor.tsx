import { useEffect, useState, type Dispatch } from "react";
import { Plus, Trash2, Pencil, Check as CheckIcon, X as XIcon } from "lucide-react";
import { useTranslation } from "../i18n";
import {
  type RelationDef,
  type RewriteNode,
  type SchemaAST,
  type SchemaAction,
  type TypeDef,
  type TypeRestriction,
} from "./bizSchemaAst";
import {
  BizRewriteEditor,
  BizTypeRestrictionsEditor,
  rewriteTouchesThis,
} from "./BizRewriteEditor";

// Controlled visual editor. State (AST + selection) lives in the
// parent BizSchemaEditor so the DSL and Visual tabs share a single
// source of truth. All edits go out as SchemaAction dispatches.

interface Props {
  ast: SchemaAST;
  dispatch: Dispatch<SchemaAction>;
  selectedTypeId: string | null;
  onSelectType: (id: string | null) => void;
}

export default function BizSchemaVisualEditor({
  ast,
  dispatch,
  selectedTypeId,
  onSelectType,
}: Props) {
  const { t } = useTranslation();
  const selectedType =
    ast.types.find((t) => t.id === selectedTypeId) || ast.types[0] || null;

  // Keep the parent's selection in sync if the current pick evaporates
  // (e.g. the type was removed). Falls back to the first remaining
  // type so the right rail never goes blank while the AST still has
  // types.
  useEffect(() => {
    if (ast.types.length === 0) {
      if (selectedTypeId !== null) onSelectType(null);
      return;
    }
    if (!ast.types.some((ty) => ty.id === selectedTypeId)) {
      onSelectType(ast.types[0].id);
    }
  }, [ast.types, selectedTypeId, onSelectType]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-3">
      <TypeRail
        types={ast.types}
        selectedId={selectedType?.id ?? null}
        onSelect={onSelectType}
        onAdd={(name) => dispatch({ type: "TYPE_ADD", name })}
        onRename={(typeId, name) =>
          dispatch({ type: "TYPE_RENAME", typeId, name })
        }
        onRemove={(typeId) => dispatch({ type: "TYPE_REMOVE", typeId })}
        t={t}
      />
      <RelationPane
        type={selectedType}
        onAdd={(name) =>
          selectedType &&
          dispatch({
            type: "RELATION_ADD",
            typeId: selectedType.id,
            name,
          })
        }
        onRename={(relationId, name) =>
          selectedType &&
          dispatch({
            type: "RELATION_RENAME",
            typeId: selectedType.id,
            relationId,
            name,
          })
        }
        onRemove={(relationId) =>
          selectedType &&
          dispatch({
            type: "RELATION_REMOVE",
            typeId: selectedType.id,
            relationId,
          })
        }
        onSetRewrite={(relationId, rewrite) =>
          selectedType &&
          dispatch({
            type: "RELATION_SET_REWRITE",
            typeId: selectedType.id,
            relationId,
            rewrite,
          })
        }
        onSetRestrictions={(relationId, restrictions) =>
          selectedType &&
          dispatch({
            type: "RELATION_SET_RESTRICTIONS",
            typeId: selectedType.id,
            relationId,
            restrictions,
          })
        }
        t={t}
      />
    </div>
  );
}

// ── Left rail: types ────────────────────────────────────────────────

function TypeRail({
  types,
  selectedId,
  onSelect,
  onAdd,
  onRename,
  onRemove,
  t,
}: {
  types: TypeDef[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  t: (k: any) => string;
}) {
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-border bg-surface-1 flex flex-col">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <span className="text-[12px] font-semibold text-text-primary">
          {t("rebac.types.label")}
        </span>
      </div>
      <div className="flex-1 overflow-auto max-h-96">
        {types.length === 0 ? (
          <p className="p-4 text-[12px] text-text-muted text-center">
            {t("rebac.types.empty")}
          </p>
        ) : (
          <ul>
            {types.map((tp) => (
              <li key={tp.id}>
                <TypeRailRow
                  type={tp}
                  selected={tp.id === selectedId}
                  editing={tp.id === editingId}
                  onSelect={() => onSelect(tp.id)}
                  onStartEdit={() => setEditingId(tp.id)}
                  onCommitEdit={(name) => {
                    const trimmed = name.trim();
                    if (trimmed && trimmed !== tp.name) {
                      onRename(tp.id, trimmed);
                    }
                    setEditingId(null);
                  }}
                  onCancelEdit={() => setEditingId(null)}
                  onRemove={() => onRemove(tp.id)}
                  t={t}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
      <form
        className="p-3 border-t border-border flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = draft.trim();
          if (!trimmed) return;
          onAdd(trimmed);
          setDraft("");
        }}
      >
        <input
          className="flex-1 px-2 py-1 rounded border border-border bg-surface-0 text-[13px] text-text-primary"
          placeholder={t("rebac.types.namePlaceholder")}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-accent-primary text-white text-[12px] disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" />
          {t("rebac.types.add")}
        </button>
      </form>
    </div>
  );
}

function TypeRailRow({
  type,
  selected,
  editing,
  onSelect,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onRemove,
  t,
}: {
  type: TypeDef;
  selected: boolean;
  editing: boolean;
  onSelect: () => void;
  onStartEdit: () => void;
  onCommitEdit: (name: string) => void;
  onCancelEdit: () => void;
  onRemove: () => void;
  t: (k: any) => string;
}) {
  const [value, setValue] = useState(type.name);
  useEffect(() => {
    if (editing) setValue(type.name);
  }, [editing, type.name]);

  return (
    <div
      className={`px-3 py-2 flex items-center gap-2 border-b border-border cursor-pointer ${
        selected ? "bg-surface-2" : "hover:bg-surface-2"
      }`}
      onClick={editing ? undefined : onSelect}
    >
      {editing ? (
        <>
          <input
            autoFocus
            className="flex-1 px-2 py-0.5 rounded border border-border bg-surface-0 text-[13px]"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCommitEdit(value);
              if (e.key === "Escape") onCancelEdit();
            }}
          />
          <button
            type="button"
            title={t("rebac.common.confirm")}
            className="p-1 text-success hover:bg-success/10 rounded"
            onClick={() => onCommitEdit(value)}
          >
            <CheckIcon className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title={t("rebac.common.cancel")}
            className="p-1 text-text-muted hover:bg-surface-2 rounded"
            onClick={onCancelEdit}
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </>
      ) : (
        <>
          <span className="flex-1 text-[13px] text-text-primary font-mono truncate">
            {type.name}
          </span>
          <span className="text-[11px] text-text-muted">
            {type.relations.length}
          </span>
          <button
            type="button"
            title={t("rebac.common.confirm")}
            className="p-1 text-text-muted hover:text-text-primary hover:bg-surface-1 rounded"
            onClick={(e) => {
              e.stopPropagation();
              onStartEdit();
            }}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title={t("rebac.types.remove")}
            className="p-1 text-text-muted hover:text-danger hover:bg-danger/10 rounded"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    </div>
  );
}

// ── Right rail: relations of selected type ──────────────────────────

function RelationPane({
  type,
  onAdd,
  onRename,
  onRemove,
  onSetRewrite,
  onSetRestrictions,
  t,
}: {
  type: TypeDef | null;
  onAdd: (name: string) => void;
  onRename: (relationId: string, name: string) => void;
  onRemove: (relationId: string) => void;
  onSetRewrite: (relationId: string, rewrite: RewriteNode) => void;
  onSetRestrictions: (relationId: string, restrictions: TypeRestriction[]) => void;
  t: (k: any) => string;
}) {
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  if (!type) {
    return (
      <div className="rounded-lg border border-border bg-surface-1 p-8 text-center text-[13px] text-text-muted">
        {t("rebac.schema.selectTypeHint")}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface-1 flex flex-col">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <span className="text-[12px] font-semibold text-text-primary">
          <span className="text-text-muted">{t("rebac.relations.label")}:</span>{" "}
          <span className="font-mono">{type.name}</span>
        </span>
      </div>
      <div className="flex-1 overflow-auto max-h-[520px]">
        {type.relations.length === 0 ? (
          <p className="p-6 text-[12px] text-text-muted text-center">
            {t("rebac.relations.empty")}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {type.relations.map((rel) => (
              <li key={rel.id}>
                <RelationRow
                  relation={rel}
                  editing={rel.id === editingId}
                  onStartEdit={() => setEditingId(rel.id)}
                  onCommitEdit={(name) => {
                    const trimmed = name.trim();
                    if (trimmed && trimmed !== rel.name) {
                      onRename(rel.id, trimmed);
                    }
                    setEditingId(null);
                  }}
                  onCancelEdit={() => setEditingId(null)}
                  onRemove={() => onRemove(rel.id)}
                  onSetRewrite={(rewrite) => onSetRewrite(rel.id, rewrite)}
                  onSetRestrictions={(restrictions) =>
                    onSetRestrictions(rel.id, restrictions)
                  }
                  t={t}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
      <form
        className="p-3 border-t border-border flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = draft.trim();
          if (!trimmed) return;
          onAdd(trimmed);
          setDraft("");
        }}
      >
        <input
          className="flex-1 px-2 py-1 rounded border border-border bg-surface-0 text-[13px] text-text-primary"
          placeholder={t("rebac.relations.namePlaceholder")}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-accent-primary text-white text-[12px] disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" />
          {t("rebac.relations.add")}
        </button>
      </form>
    </div>
  );
}

function RelationRow({
  relation,
  editing,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onRemove,
  onSetRewrite,
  onSetRestrictions,
  t,
}: {
  relation: RelationDef;
  editing: boolean;
  onStartEdit: () => void;
  onCommitEdit: (name: string) => void;
  onCancelEdit: () => void;
  onRemove: () => void;
  onSetRewrite: (rewrite: RewriteNode) => void;
  onSetRestrictions: (restrictions: TypeRestriction[]) => void;
  t: (k: any) => string;
}) {
  const [value, setValue] = useState(relation.name);
  useEffect(() => {
    if (editing) setValue(relation.name);
  }, [editing, relation.name]);

  return (
    <div className="p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {editing ? (
          <>
            <input
              autoFocus
              className="flex-1 px-2 py-0.5 rounded border border-border bg-surface-0 text-[13px] font-mono"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onCommitEdit(value);
                if (e.key === "Escape") onCancelEdit();
              }}
            />
            <button
              type="button"
              className="p-1 text-success hover:bg-success/10 rounded"
              onClick={() => onCommitEdit(value)}
            >
              <CheckIcon className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="p-1 text-text-muted hover:bg-surface-2 rounded"
              onClick={onCancelEdit}
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <>
            <span className="flex-1 text-[13px] text-text-primary font-mono">
              {relation.name}
            </span>
            <button
              type="button"
              title={t("rebac.common.confirm")}
              className="p-1 text-text-muted hover:text-text-primary hover:bg-surface-2 rounded"
              onClick={onStartEdit}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title={t("rebac.relations.remove")}
              className="p-1 text-text-muted hover:text-danger hover:bg-danger/10 rounded"
              onClick={onRemove}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <BizRewriteEditor
          node={relation.rewrite}
          onChange={onSetRewrite}
        />
        {rewriteTouchesThis(relation.rewrite) && (
          <BizTypeRestrictionsEditor
            restrictions={relation.typeRestrictions}
            onChange={onSetRestrictions}
          />
        )}
      </div>
    </div>
  );
}
