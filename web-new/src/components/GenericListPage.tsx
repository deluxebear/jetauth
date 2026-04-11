import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import DataTable, { type Column } from "./DataTable";
import { api } from "../api/client";
import { useTranslation } from "../i18n";

export interface ListPageColumn<T = Record<string, unknown>> extends Column<T> {
  // Extended with search/filter capabilities
}

interface GenericListPageProps {
  entityType: string; // API entity name, e.g. "users", "organizations"
  titleKey: string;
  subtitleKey: string;
  addButtonKey?: string;
  columns: ListPageColumn[];
  rowKey?: string | ((r: Record<string, unknown>) => string);
  owner?: string;
  editPath?: (record: Record<string, unknown>) => string;
  canAdd?: boolean;
  canDelete?: boolean;
  pageSize?: number;
  extraQueryParams?: string;
}

interface ApiResponse {
  status: string;
  data: Record<string, unknown>[];
  data2?: number[];
}

export default function GenericListPage({
  entityType,
  titleKey,
  subtitleKey,
  addButtonKey,
  columns,
  rowKey = "name",
  owner = "built-in",
  editPath,
  canAdd = true,
  canDelete = true,
  pageSize = 20,
  extraQueryParams = "",
}: GenericListPageProps) {
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { t } = useTranslation();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const sep = extraQueryParams ? `&${extraQueryParams}` : "";
      const res = await api.get<ApiResponse>(
        `/api/get-${entityType}?owner=${owner}&p=${page}&pageSize=${pageSize}${sep}`
      );
      if (res.data) {
        setData(Array.isArray(res.data) ? res.data : []);
        setTotal(res.data2?.[0] ?? (Array.isArray(res.data) ? res.data.length : 0));
      }
    } catch (e) {
      console.error(`Failed to fetch ${entityType}:`, e);
    } finally {
      setLoading(false);
    }
  }, [entityType, owner, page, pageSize, extraQueryParams]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDelete = async (record: Record<string, unknown>) => {
    if (!confirm(t("common.confirmDelete"))) return;
    try {
      await api.post(`/api/delete-${entityType.replace(/s$/, "")}`, record);
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleAdd = () => {
    navigate(`/${entityType}/new`);
  };

  const defaultEditPath = (r: Record<string, unknown>) =>
    `/${entityType}/${r.owner ?? owner}/${r.name}`;

  // Translate column titles
  const translatedColumns = columns.map((col) => ({
    ...col,
    title: t(col.title as any),
  }));

  // Append action column if deletable
  const finalColumns: ListPageColumn[] = canDelete
    ? [
        ...translatedColumns,
        {
          key: "__action",
          title: t("common.action"),
          width: "80px",
          render: (_: unknown, record: Record<string, unknown>) => (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(record);
              }}
              className="rounded p-1 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          ),
        },
      ]
    : translatedColumns;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t(titleKey as any)}</h1>
          <p className="text-[13px] text-text-muted mt-0.5">{t(subtitleKey as any)}</p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ rotate: 180 }}
            transition={{ duration: 0.3 }}
            onClick={fetchData}
            className="rounded-lg border border-border p-2 text-text-muted hover:bg-surface-2 transition-colors"
            title={t("common.refresh")}
          >
            <RefreshCw size={15} />
          </motion.button>
          {canAdd && addButtonKey && (
            <button
              onClick={handleAdd}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover transition-colors"
            >
              <Plus size={15} />
              {t(addButtonKey as any)}
            </button>
          )}
        </div>
      </div>

      <DataTable
        columns={finalColumns}
        data={data}
        rowKey={rowKey}
        loading={loading}
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        emptyText={t("common.noData")}
      />
    </div>
  );
}
