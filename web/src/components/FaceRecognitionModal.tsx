import { useState, useRef, useEffect, useCallback } from "react";
import * as faceapi from "face-api.js";
import { useTranslation } from "../i18n";

const MODEL_URL = "https://cdn.casbin.org/casdoor/models";

interface Props {
  visible: boolean;
  withImage: boolean;
  onOk: (faceIdData: number[]) => void;
  onCancel: () => void;
}

export default function FaceRecognitionModal({ visible, withImage, onOk, onCancel }: Props) {
  const { t } = useTranslation();
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [percent, setPercent] = useState(0);
  const [isCameraCaptured, setIsCameraCaptured] = useState(false);
  const [error, setError] = useState("");

  // Image mode state
  const [files, setFiles] = useState<{ file: File; base64: string }[]>([]);
  const [currentFace, setCurrentFace] = useState<{ descriptor: Float32Array; index: number } | null>(null);
  const [processing, setProcessing] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const detectionRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Load models
  useEffect(() => {
    if (!visible || modelsLoaded) return;
    Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]).then(() => setModelsLoaded(true))
      .catch(() => { setError(t("faceId.modelLoadFailed" as any)); });
  }, [visible, modelsLoaded]);

  // Camera mode: start/stop stream
  useEffect(() => {
    if (withImage || !visible) return;
    if (modelsLoaded) {
      setPercent(0);
      navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } })
        .then((stream) => { mediaStreamRef.current = stream; setIsCameraCaptured(true); })
        .catch((err) => { handleCameraError(err); });
    }
    return () => { stopCamera(); };
  }, [visible, modelsLoaded, withImage]);

  // Attach stream to video element — poll until video ref is available
  useEffect(() => {
    if (withImage || !isCameraCaptured || !mediaStreamRef.current) return;
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStreamRef.current;
        videoRef.current.play();
        clearInterval(interval);
      }
      if (attempts >= 30) {
        clearInterval(interval);
        stopCamera();
        onCancel();
      }
    }, 100);
    return () => clearInterval(interval);
  }, [isCameraCaptured, withImage]);

  const stopCamera = useCallback(() => {
    if (detectionRef.current) { clearInterval(detectionRef.current); detectionRef.current = null; }
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    setIsCameraCaptured(false);
  }, []);

  const handleStreamVideo = () => {
    if (withImage || detectionRef.current) return;
    let count = 0;
    let goodCount = 0;
    detectionRef.current = setInterval(async () => {
      if (!modelsLoaded || !videoRef.current || !visible) return;
      const faces = await faceapi.detectAllFaces(videoRef.current, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks().withFaceDescriptors();
      count++;
      if (count > 300) { stopCamera(); setError(t("faceId.recognitionFailed" as any)); return; }
      if (faces.length === 1) {
        const face = faces[0];
        setPercent(Math.round(face.detection.score * 100));
        if (face.detection.score > 0.9) {
          goodCount++;
          if (face.detection.score > 0.99 || goodCount > 10) {
            stopCamera();
            onOk(Array.from(face.descriptor));
          }
        }
      } else {
        setPercent((p) => Math.round(p / 2));
      }
    }, 100);
  };

  const handleCameraError = (err: DOMException | Error) => {
    if (err instanceof DOMException) {
      if (err.name === "NotFoundError") setError(t("faceId.noCameraDevice" as any));
      else if (err.name === "NotAllowedError") setError(t("faceId.cameraPermissionDenied" as any));
      else if (err.name === "NotReadableError") setError(t("faceId.cameraInUse" as any));
      else if (err.name === "TypeError") setError(t("faceId.httpsRequired" as any));
      else setError(err.message);
    } else {
      setError(err.message);
    }
  };

  const handleClose = () => {
    stopCamera();
    setFiles([]);
    setCurrentFace(null);
    setError("");
    setPercent(0);
    setProcessing(false);
    onCancel();
  };

  // Image mode: process files
  const handleGenerate = async () => {
    if (files.length === 0) return;
    setProcessing(true);
    setCurrentFace(null);
    let maxScore = 0;
    let bestFace: { descriptor: Float32Array; index: number } | null = null;
    for (let i = 0; i < files.length; i++) {
      const img = new Image();
      img.src = files[i].base64;
      await new Promise((resolve) => { img.onload = resolve; });
      const faces = await faceapi.detectAllFaces(img, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks().withFaceDescriptors();
      if (faces[0]?.detection.score > 0.9 && faces[0]?.detection.score > maxScore) {
        maxScore = faces[0].detection.score;
        bestFace = { descriptor: faces[0].descriptor, index: i };
      }
    }
    if (bestFace) {
      setCurrentFace(bestFace);
    } else {
      setError(t("faceId.recognitionFailed" as any));
    }
    setProcessing(false);
  };

  const handleFileAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files ?? []);
    Promise.all(newFiles.map((file) => new Promise<{ file: File; base64: string }>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ file, base64: reader.result as string });
      reader.readAsDataURL(file);
    }))).then((results) => {
      setFiles((prev) => [...prev, ...results]);
      setCurrentFace(null);
    });
    e.target.value = "";
  };

  if (!visible) return null;

  // Backdrop
  const backdrop = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={handleClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-surface-1 rounded-xl border border-border shadow-xl w-[360px] max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-5 py-3 border-b border-border">
          <h3 className="text-[14px] font-semibold text-text-primary">{t("faceId.faceRecognition" as any)}</h3>
        </div>
        {/* Body */}
        <div className="p-5">
          {error ? (
            <div className="text-center py-6">
              <p className="text-[13px] text-danger mb-4">{error}</p>
              <button onClick={handleClose} className="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-white hover:bg-accent-hover">{t("common.cancel")}</button>
            </div>
          ) : !withImage ? (
            // Camera mode
            <div className="flex flex-col items-center gap-4">
              {/* Progress */}
              <div className="w-full bg-surface-2 rounded-full h-2">
                <div className="bg-accent h-2 rounded-full transition-all duration-200" style={{ width: `${percent}%` }} />
              </div>
              <span className="text-[12px] text-text-muted">{percent}%</span>

              {modelsLoaded && isCameraCaptured ? (
                <div className="relative">
                  <video ref={videoRef} onPlay={handleStreamVideo} className="rounded-full h-[220px] w-[220px] object-cover" />
                  {/* Progress circle */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ top: "-10px", left: "-10px", width: "240px", height: "240px" }}>
                    <svg width="240" height="240" fill="none">
                      <circle strokeDasharray="700" strokeDashoffset={700 - 6.9115 * percent} strokeWidth="4" cx="120" cy="120" r="110"
                        stroke="var(--color-accent)" transform="rotate(-90, 120, 120)" strokeLinecap="round" style={{ transition: "all .2s linear" }} />
                    </svg>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-[220px]">
                  <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
                </div>
              )}

              <button onClick={handleClose} className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-text-secondary hover:bg-surface-2">{t("common.cancel")}</button>
            </div>
          ) : (
            // Image mode
            <div className="flex flex-col gap-3">
              <label className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border p-6 cursor-pointer hover:bg-surface-2 transition-colors">
                <span className="text-[13px] text-text-muted">{t("faceId.clickToUpload" as any)}</span>
                <input type="file" accept="image/*" multiple onChange={handleFileAdd} className="hidden" />
              </label>

              {files.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {files.map((f, i) => (
                    <div key={i} className="relative group">
                      <img src={f.base64} alt="" className={`h-16 w-16 rounded-lg object-cover border ${currentFace?.index === i ? "border-accent ring-2 ring-accent/30" : "border-border"}`} />
                      <button onClick={() => { setFiles((prev) => prev.filter((_, j) => j !== i)); setCurrentFace(null); }}
                        className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-danger text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                    </div>
                  ))}
                </div>
              )}

              {modelsLoaded && (
                <button onClick={handleGenerate} disabled={files.length === 0 || processing}
                  className="w-full rounded-lg bg-surface-2 border border-border px-4 py-2 text-[13px] font-medium text-text-primary hover:bg-surface-3 disabled:opacity-50 transition-colors">
                  {processing ? <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />{t("faceId.processing" as any)}</span> : t("faceId.generate" as any)}
                </button>
              )}

              {currentFace && (
                <div className="text-[12px] text-success">{t("faceId.faceDetected" as any)}: {files[currentFace.index]?.file.name}</div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button onClick={handleClose} className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-text-secondary hover:bg-surface-2">{t("common.cancel")}</button>
                <button onClick={() => { if (currentFace) { onOk(Array.from(currentFace.descriptor)); handleClose(); } }}
                  disabled={!currentFace} className="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-white hover:bg-accent-hover disabled:opacity-50">OK</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return backdrop;
}
