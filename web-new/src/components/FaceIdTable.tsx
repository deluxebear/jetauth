import { useState, lazy, Suspense } from "react";
import { Plus, Image as ImageIcon, Upload, Trash2 } from "lucide-react";
import { useTranslation } from "../i18n";
import { useModal } from "./Modal";
import * as ResourceBackend from "../backend/ResourceBackend";

const FaceRecognitionModal = lazy(() => import("./FaceRecognitionModal"));

export interface FaceId {
  name: string;
  faceIdData: number[];
  imageUrl?: string;
}

interface Props {
  table: FaceId[];
  onUpdateTable: (table: FaceId[]) => void;
  account: { owner: string; name: string };
}

function randomName() {
  return Math.random().toString(36).substring(2, 8);
}

export default function FaceIdTable({ table, onUpdateTable, account }: Props) {
  const { t } = useTranslation();
  const modal = useModal();
  const [modalOpen, setModalOpen] = useState(false);
  const [withImage, setWithImage] = useState(false);
  const [uploading, setUploading] = useState(false);

  const items = table ?? [];
  const maxReached = items.length >= 5;

  const addFaceId = (faceIdData: number[]) => {
    onUpdateTable([...items, { name: randomName(), faceIdData }]);
  };

  const addFaceImage = (imageUrl: string) => {
    onUpdateTable([...items, { name: randomName(), faceIdData: [], imageUrl }]);
  };

  const deleteRow = (idx: number) => {
    onUpdateTable(items.filter((_, i) => i !== idx));
  };

  const updateName = (idx: number, name: string) => {
    const next = [...items];
    next[idx] = { ...next[idx], name };
    onUpdateTable(next);
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fullFilePath = `resource/${account.owner}/${account.name}/${file.name}`;
    ResourceBackend.uploadResource(account.owner, account.name, "custom", "FaceIdTable", fullFilePath, file)
      .then((res) => {
        if (res.status === "ok" && res.data) {
          addFaceImage(res.data);
          modal.toast(t("faceId.uploadSuccess" as any) || "Uploaded successfully");
        } else {
          modal.toast(res.msg || t("faceId.uploadFailed" as any) || "Upload failed", "error");
        }
      })
      .catch((err) => {
        modal.toast(err?.message || t("faceId.uploadFailed" as any) || "Upload failed", "error");
      })
      .finally(() => { setUploading(false); e.target.value = ""; });
  };

  const formatData = (data: number[]) => {
    if (!data || data.length === 0) return "—";
    return "[" + data.join(", ") + "]";
  };

  return (
    <div className="rounded-xl border border-border bg-surface-1 overflow-visible">
      <div className="px-4 py-2.5 border-b border-border-subtle bg-surface-2/30 flex items-center gap-2 flex-wrap">
        <span className="text-[12px] font-semibold text-text-primary">{t("faceId.title" as any)}</span>
        <button disabled={maxReached} onClick={() => { setWithImage(false); setModalOpen(true); }}
          className="flex items-center gap-1 rounded-lg bg-accent px-2 py-0.5 text-[11px] font-medium text-white hover:bg-accent-hover disabled:opacity-50 transition-colors">
          <Plus size={11} /> {t("faceId.addFaceId" as any)}
        </button>
        <button disabled={maxReached} onClick={() => { setWithImage(true); setModalOpen(true); }}
          className="flex items-center gap-1 rounded-lg border border-border px-2 py-0.5 text-[11px] font-medium text-text-secondary hover:bg-surface-2 disabled:opacity-50 transition-colors">
          <ImageIcon size={11} /> {t("faceId.addFaceIdImage" as any)}
        </button>
        <label className={`flex items-center gap-1 rounded-lg border border-border px-2 py-0.5 text-[11px] font-medium text-text-secondary hover:bg-surface-2 transition-colors cursor-pointer ${maxReached || uploading ? "opacity-50 pointer-events-none" : ""}`}>
          <Upload size={11} /> {uploading ? t("faceId.uploading" as any) : t("faceId.uploadFile" as any)}
          <input type="file" accept="image/*" onChange={handleUpload} className="hidden" disabled={maxReached || uploading} />
        </label>
      </div>

      {items.length === 0 ? (
        <div className="px-5 py-6 text-center text-[12px] text-text-muted">{t("common.noData")}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left" style={{ minWidth: "max-content" }}>
            <thead>
              <tr className="border-b border-border bg-surface-2/30">
                <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted w-[180px]">{t("common.name" as any)}</th>
                <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">{t("faceId.data" as any)}</th>
                <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">{t("faceId.imageUrl" as any)}</th>
                <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted w-[80px]">{t("common.action" as any)}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx} className="border-b border-border-subtle">
                  <td className="px-4 py-1.5">
                    <input value={item.name} onChange={(e) => updateName(idx, e.target.value)}
                      className="w-full rounded-lg border border-border bg-surface-2 px-2 py-1 text-[12px] font-mono text-text-primary outline-none focus:border-accent transition-colors" />
                  </td>
                  <td className="px-4 py-1.5 text-[11px] font-mono text-text-muted max-w-[300px] truncate">{formatData(item.faceIdData)}</td>
                  <td className="px-4 py-1.5 text-[11px] text-text-muted truncate max-w-[200px]">{item.imageUrl || "—"}</td>
                  <td className="px-4 py-1.5">
                    <button onClick={() => deleteRow(idx)} className="rounded p-1 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Suspense fallback={null}>
        <FaceRecognitionModal
          visible={modalOpen}
          withImage={withImage}
          onOk={(data) => { addFaceId(data); setModalOpen(false); }}
          onCancel={() => setModalOpen(false)}
        />
      </Suspense>
    </div>
  );
}
