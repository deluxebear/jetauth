import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { RefreshCw, Trash2, Upload, Copy, Image as ImageIcon, Film } from "lucide-react";
import DataTable, { type Column } from "../components/DataTable";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityList } from "../hooks/useEntityList";
import * as ResourceBackend from "../backend/ResourceBackend";
import type { Resource } from "../backend/ResourceBackend";

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function ResourceListPage() {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();
  const modal = useModal();

  const list = useEntityList<Resource>({
    queryKey: "resources",
    fetchFn: (params) => ResourceBackend.getResources({ ...params, user: "" }),
    owner: "",
  });

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const fullFilePath = `resource/admin/admin/${file.name}`;
      const res = await ResourceBackend.uploadResource("admin", "admin", "custom", "ResourceListPage", fullFilePath, file);
      if (res.status === "ok") {
        list.refetch();
      } else {
        modal.toast(res.msg || t("resources.uploadFailed" as any), "error");
      }
    } catch {
      modal.toast(t("resources.uploadFailed" as any), "error");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = (record: Resource, e: React.MouseEvent) => {
    e.stopPropagation();
    modal.showConfirm(
      `${t("common.confirmDelete")} [${record.name}]`,
      async () => {
        const res = await ResourceBackend.deleteResource(record, record.provider);
        if (res.status === "ok") list.refetch();
        else modal.toast(res.msg || t("common.deleteFailed" as any), "error");
      }
    );
  };

  const columns: Column<Resource>[] = [
    {
      key: "provider", title: t("col.provider" as any), sortable: true, filterable: true, width: "120px",
      render: (_, r) => r.provider
        ? <Link to={`/providers/${r.owner}/${r.provider}`} className="text-accent hover:underline text-[12px]" onClick={(e) => e.stopPropagation()}>{r.provider}</Link>
        : <span className="text-text-muted text-[12px]">—</span>,
    },
    {
      key: "owner", title: t("col.organization" as any), sortable: true, filterable: true, width: "120px",
      render: (_, r) => <Link to={`/organizations/admin/${r.owner}`} className="text-accent hover:underline text-[12px]" onClick={(e) => e.stopPropagation()}>{r.owner}</Link>,
    },
    {
      key: "user", title: t("col.user" as any), sortable: true, filterable: true, width: "80px",
      render: (_, r) => r.user
        ? <Link to={`/users/${r.owner}/${r.user}`} className="text-accent hover:underline text-[12px]" onClick={(e) => e.stopPropagation()}>{r.user}</Link>
        : <span className="text-text-muted text-[12px]">—</span>,
    },
    {
      key: "name", title: t("col.name" as any), sortable: true, filterable: true, width: "150px",
      render: (_, r) => <span className="font-mono text-[11px] text-text-secondary truncate block max-w-[140px]" title={r.name}>{r.name}</span>,
    },
    {
      key: "createdTime", title: t("col.created" as any), sortable: true, width: "140px",
      render: (_, r) => <span className="text-[12px] text-text-muted font-mono">{r.createdTime ? new Date(r.createdTime).toLocaleString() : "—"}</span>,
    },
    { key: "tag", title: t("resources.col.tag" as any), sortable: true, filterable: true, width: "80px" },
    { key: "fileType", title: t("col.type" as any), sortable: true, width: "80px" },
    {
      key: "fileFormat", title: t("resources.col.format" as any), sortable: true, width: "80px",
      render: (_, r) => <span className="font-mono text-[11px] text-text-muted">{r.fileFormat || "—"}</span>,
    },
    {
      key: "fileSize", title: t("resources.col.fileSize" as any), sortable: true, width: "90px",
      render: (_, r) => <span className="font-mono text-[11px] text-text-muted">{formatFileSize(r.fileSize)}</span>,
    },
    {
      key: "preview", title: t("resources.col.preview" as any), width: "80px",
      render: (_, r) => {
        if (r.fileType === "image") return <img src={r.url} alt="" className="h-8 w-8 rounded border border-border object-cover bg-surface-2" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />;
        if (r.fileType === "video") return <Film size={16} className="text-text-muted" />;
        return <ImageIcon size={16} className="text-text-muted opacity-30" />;
      },
    },
    {
      key: "url", title: t("resources.col.url" as any), width: "90px",
      render: (_, r) => (
        <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(r.url); }} className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-accent hover:bg-accent/10 transition-colors">
          <Copy size={12} /> {t("resources.copyLink" as any)}
        </button>
      ),
    },
    {
      key: "__actions", fixed: "right" as const, title: t("common.action" as any), width: "70px",
      render: (_, r) => (
        <button onClick={(e) => handleDelete(r, e)} className="rounded p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors" title={t("common.delete")}>
          <Trash2 size={14} />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("resources.title" as any)}</h1>
          <p className="text-[13px] text-text-muted mt-0.5">{t("resources.subtitle" as any)}</p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button whileHover={{ rotate: 180 }} transition={{ duration: 0.3 }} onClick={list.refetch} className="rounded-lg border border-border p-2 text-text-muted hover:bg-surface-2 transition-colors" title={t("common.refresh")}><RefreshCw size={15} /></motion.button>
          <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleUpload(file); e.target.value = ""; }} />
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors">
            {uploading ? <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <Upload size={15} />}
            {t("resources.upload" as any)}
          </button>
        </div>
      </div>
      <DataTable columns={columns} data={list.items} rowKey="name" loading={list.loading} page={list.page} pageSize={list.pageSize} total={list.total} onPageChange={list.setPage} onSort={list.handleSort} onFilter={list.handleFilter} emptyText={t("common.noData")} persistKey="list:resources" resizable columnsToggle />
    </div>
  );
}
