import { useRef, useState, useCallback } from "react";
import { Upload, X, Check, RotateCw } from "lucide-react";
import { Cropper, type CropperRef } from "react-advanced-cropper";
import "react-advanced-cropper/dist/style.css";
import { useTranslation } from "../i18n";
import { useModal } from "./Modal";
import { uploadResource } from "../backend/ResourceBackend";
import { inputClass } from "./FormSection";

interface ImageUrlInputProps {
  value: string;
  onChange: (url: string) => void;
  owner: string;
  tag: string;
  accept?: string;
  /** Fixed output width in px. Cropped image will be scaled to this size. When 0, uses cropped region width. */
  outputWidth?: number;
  /** Fixed output height in px. Cropped image will be scaled to this size. When 0, uses cropped region height. */
  outputHeight?: number;
  /** Preview image class */
  previewClass?: string;
  placeholder?: string;
  disabled?: boolean;
}

export default function ImageUrlInput({
  value,
  onChange,
  owner,
  tag,
  accept = "image/*",
  outputWidth = 0,
  outputHeight = 0,
  previewClass = "max-h-16 max-w-[240px] rounded-lg border border-border object-contain bg-surface-2",
  placeholder = "https://...",
  disabled = false,
}: ImageUrlInputProps) {
  const { t } = useTranslation();
  const modal = useModal();
  const fileRef = useRef<HTMLInputElement>(null);
  const cropperRef = useRef<CropperRef>(null);
  const [uploading, setUploading] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);

  const aspectRatio = outputWidth && outputHeight ? outputWidth / outputHeight : undefined;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropFile(file);
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleCropConfirm = useCallback(async () => {
    if (!cropperRef.current || !cropFile) return;

    setUploading(true);
    try {
      // Get cropped canvas, optionally at fixed output size
      const canvas = cropperRef.current.getCanvas(
        outputWidth && outputHeight ? { width: outputWidth, height: outputHeight } : undefined
      );
      if (!canvas) return;

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png")
      );
      if (!blob) return;

      const croppedFile = new File([blob], `${tag}.png`, { type: "image/png" });
      const fullPath = `/${tag}/${owner}/${tag}.png`;
      const account = JSON.parse(localStorage.getItem("account") ?? "{}");
      const user = account?.name || owner;
      const res = await uploadResource(owner, user, tag, tag, fullPath, croppedFile);
      if (res.status === "ok" && res.data) {
        onChange(res.data);
      } else {
        modal.toast(res.msg || t("common.saveFailed" as any), "error");
      }
    } catch (err: any) {
      modal.toast(err?.message || t("common.saveFailed" as any), "error");
    } finally {
      setUploading(false);
      setCropSrc(null);
      setCropFile(null);
    }
  }, [cropFile, owner, tag, outputWidth, outputHeight, onChange, modal, t]);

  const handleCropCancel = () => {
    setCropSrc(null);
    setCropFile(null);
  };

  return (
    <>
      {/* Input + upload button */}
      <div className="flex gap-2 items-center">
        <input
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} flex-1`}
          placeholder={placeholder}
          disabled={disabled}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || uploading}
          className="shrink-0 flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[12px] font-medium text-text-secondary hover:bg-surface-3 hover:text-text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title={t("common.upload" as any)}
        >
          <Upload size={14} className={uploading ? "animate-pulse" : ""} />
          {uploading ? t("common.uploading" as any) : t("common.upload" as any)}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={accept}
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Preview below */}
      {value && (
        <div className="mt-2">
          <img
            src={value}
            alt=""
            className={previewClass}
            referrerPolicy="no-referrer"
            onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
          />
        </div>
      )}

      {/* Crop modal */}
      {cropSrc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-1 rounded-xl border border-border shadow-2xl w-[560px] max-w-[90vw] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <h3 className="text-[14px] font-semibold text-text-primary">
                {t("common.cropImage" as any)}
              </h3>
              {outputWidth && outputHeight ? (
                <span className="text-[11px] text-text-muted font-mono">{outputWidth} x {outputHeight}px</span>
              ) : null}
              <button onClick={handleCropCancel} className="text-text-muted hover:text-text-primary transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 bg-surface-0">
              <Cropper
                ref={cropperRef}
                src={cropSrc}
                stencilProps={{
                  ...(aspectRatio ? { aspectRatio } : {}),
                  movable: true,
                  resizable: true,
                }}
                className="h-[360px] rounded-lg"
              />
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t border-border">
              <button
                onClick={() => cropperRef.current?.rotateImage(90)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors"
              >
                <RotateCw size={14} />
                {t("common.rotate" as any)}
              </button>
              <div className="flex gap-2">
                <button
                  onClick={handleCropCancel}
                  className="rounded-lg px-4 py-1.5 text-[12px] font-medium border border-border text-text-secondary hover:bg-surface-2 transition-colors"
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={handleCropConfirm}
                  disabled={uploading}
                  className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[12px] font-semibold bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
                >
                  <Check size={14} />
                  {uploading ? t("common.uploading" as any) : t("common.confirm" as any)}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
