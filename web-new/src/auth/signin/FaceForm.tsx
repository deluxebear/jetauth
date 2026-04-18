import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowLeft, Camera } from "lucide-react";
import { useTranslation } from "../../i18n";
import { api } from "../../api/client";

// TODO (W6): Add client-side face-api.js detection here to give the user a
// real-time "face detected" indicator before they click Capture. For W2b we
// skip loading the heavy face-api.js models and let the backend validate the
// captured frame via the configured Face ID provider.

interface FaceFormProps {
  identifier: string;
  userHint?: string;
  application: string;
  organization: string;
  onSuccess: () => void;
  onBack: () => void;
  error?: string;
}

type State = "init" | "live" | "processing" | "cameraDenied" | "noFace" | "failed";

/**
 * Face ID sign-in step.
 *
 * Flow:
 *   1. On mount, request camera via getUserMedia({ video: true }).
 *   2. On success, attach the stream to a <video> element for live preview.
 *   3. On "Capture & sign in" click:
 *      - Draw the current video frame to a hidden <canvas>.
 *      - Read canvas.toDataURL("image/png") → base64 data URL.
 *      - POST /api/login with signinMethod="Face ID" and faceIdImage=[<dataURL>].
 *      - On success → onSuccess() (parent handles full-page reload).
 *   4. Always stop all camera tracks on unmount / back.
 *
 * Client-side face-api.js model loading is intentionally omitted in W2b;
 * the backend's face provider handles the actual face comparison.
 */
export default function FaceForm({
  identifier,
  userHint,
  application,
  organization,
  onSuccess,
  onBack,
  error: externalError,
}: FaceFormProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<State>("init");
  const [flowError, setFlowError] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const display = userHint && userHint.length > 0 ? userHint : identifier;

  // Stop all tracks and clear ref
  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Request camera on mount
  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setState("live");
      })
      .catch(() => {
        if (!cancelled) setState("cameraDenied");
      });

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [stopStream]);

  // Attach stream to video element once we are in "live" state
  useEffect(() => {
    if (state !== "live") return;
    const video = videoRef.current;
    if (!video || !streamRef.current) return;
    try {
      video.srcObject = streamRef.current;
      video.play().catch(() => {
        // Autoplay may be blocked; the user can still click Capture
      });
    } catch {
      // happy-dom / older browsers may reject srcObject assignment — non-fatal
    }
  }, [state]);

  const handleCapture = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // Draw current frame
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL("image/png");

    setState("processing");
    setFlowError("");

    try {
      const res = await api.post<{ status: string; msg?: string; data?: string }>(
        "/api/login",
        {
          application,
          organization,
          username: identifier,
          type: "login",
          signinMethod: "Face ID",
          faceIdImage: [dataUrl],
          clientId: application,
        },
      );

      if (res.status !== "ok") {
        setFlowError(res.msg ?? t("auth.face.failed"));
        setState("failed");
        return;
      }

      stopStream();
      onSuccess();
    } catch (e: unknown) {
      setFlowError((e as Error).message || t("auth.face.failed"));
      setState("failed");
    }
  };

  const handleRetry = () => {
    setFlowError("");
    setState("init");
    // Re-request camera by re-running the mount effect via key bump would be
    // cleaner; here we just re-trigger directly.
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((stream) => {
        streamRef.current = stream;
        setState("live");
      })
      .catch(() => setState("cameraDenied"));
  };

  const handleBack = () => {
    stopStream();
    onBack();
  };

  const displayError = externalError || flowError;

  return (
    <div className="space-y-4">
      {/* Back chip + identifier */}
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2">
        <button
          type="button"
          onClick={handleBack}
          aria-label={t("auth.password.backButton")}
          className="flex items-center gap-1 text-[12px] text-text-muted hover:text-text-secondary transition-colors"
        >
          <ArrowLeft size={14} />
          {t("auth.password.backButton")}
        </button>
        <span className="h-4 w-px bg-border" />
        <span className="truncate text-[13px] text-text-secondary">{display}</span>
      </div>

      {/* Error banner */}
      {displayError && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-[13px] text-danger">
          {displayError}
        </div>
      )}

      {/* Camera denied */}
      {state === "cameraDenied" && (
        <div className="rounded-lg border border-border bg-surface-1 px-4 py-6 text-center">
          <Camera size={24} className="mx-auto mb-2 text-text-muted" />
          <p className="text-[13px] text-text-muted">{t("auth.face.cameraError")}</p>
        </div>
      )}

      {/* Init: spinner while requesting camera */}
      {state === "init" && (
        <div className="flex items-center justify-center py-10">
          <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
        </div>
      )}

      {/* Live preview */}
      {(state === "live" || state === "processing") && (
        <>
          <p className="text-[13px] text-text-muted text-center">{t("auth.face.prompt")}</p>

          {/* Video preview */}
          <div className="flex justify-center">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="rounded-xl w-full max-w-[300px] aspect-video object-cover bg-surface-2"
            />
          </div>

          {/* Capture button */}
          <button
            type="button"
            onClick={handleCapture}
            disabled={state === "processing"}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-[14px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            {state === "processing" ? (
              <>
                <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                {t("auth.face.processing")}
              </>
            ) : (
              <>
                <Camera size={16} />
                {t("auth.face.button")}
              </>
            )}
          </button>
        </>
      )}

      {/* Failed state — retry button */}
      {(state === "failed" || state === "noFace") && (
        <button
          type="button"
          onClick={handleRetry}
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-border bg-surface-1 py-2.5 text-[14px] font-medium text-text-primary hover:bg-surface-2 transition-colors"
        >
          {t("auth.face.retry")}
        </button>
      )}

      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
    </div>
  );
}
