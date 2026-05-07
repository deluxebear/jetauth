import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, CheckCircle, Info, XCircle, X } from "lucide-react";
import { useTranslation } from "../i18n";

type ModalType = "confirm" | "success" | "error" | "info";

interface ModalState {
  open: boolean;
  type: ModalType;
  title: string;
  message: ReactNode;
  onConfirm?: () => void;
  onCancel?: () => void;
}

interface ToastItem {
  id: number;
  type: "success" | "error" | "info";
  message: string;
}

export interface PromptOptions {
  title: string;
  message?: ReactNode;
  placeholder?: string;
  defaultValue?: string;
  maxLength?: number;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface PromptState {
  open: boolean;
  title: string;
  message?: ReactNode;
  placeholder?: string;
  maxLength?: number;
  confirmLabel: string;
  cancelLabel: string;
}

interface ModalContextType {
  showConfirm: (message: ReactNode, onConfirm: () => void, title?: string) => void;
  showSuccess: (message: ReactNode, title?: string) => void;
  showError: (message: ReactNode, title?: string) => void;
  showInfo: (message: ReactNode, title?: string) => void;
  toast: (message: string, type?: "success" | "error" | "info") => void;
  prompt: (opts: PromptOptions) => Promise<string | null>;
}

const ModalContext = createContext<ModalContextType>(null!);

export function useModal() {
  return useContext(ModalContext);
}

let toastCounter = 0;

export function ModalProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [state, setState] = useState<ModalState>({
    open: false,
    type: "info",
    title: "",
    message: "",
  });
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [promptState, setPromptState] = useState<PromptState | null>(null);
  const [promptInput, setPromptInput] = useState("");
  const promptResolveRef = useRef<((value: string | null) => void) | null>(null);

  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);

  const toast = useCallback((message: string, type: "success" | "error" | "info" = "success") => {
    const id = ++toastCounter;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const showConfirm = useCallback(
    (message: ReactNode, onConfirm: () => void, title?: string) => {
      setState({
        open: true,
        type: "confirm",
        title: title ?? "",
        message,
        onConfirm: () => {
          close();
          onConfirm();
        },
        onCancel: close,
      });
    },
    [close]
  );

  const showSuccess = useCallback(
    (message: ReactNode, title?: string) => {
      setState({ open: true, type: "success", title: title ?? "", message, onConfirm: close });
    },
    [close]
  );

  const showError = useCallback(
    (message: ReactNode, title?: string) => {
      setState({ open: true, type: "error", title: title ?? "", message, onConfirm: close });
    },
    [close]
  );

  const showInfo = useCallback(
    (message: ReactNode, title?: string) => {
      setState({ open: true, type: "info", title: title ?? "", message, onConfirm: close });
    },
    [close]
  );

  const prompt = useCallback(
    (opts: PromptOptions): Promise<string | null> =>
      new Promise<string | null>((resolve) => {
        promptResolveRef.current = resolve;
        setPromptInput(opts.defaultValue ?? "");
        setPromptState({
          open: true,
          title: opts.title,
          message: opts.message,
          placeholder: opts.placeholder,
          maxLength: opts.maxLength,
          confirmLabel: opts.confirmLabel ?? t("common.confirm"),
          cancelLabel: opts.cancelLabel ?? t("common.cancel"),
        });
      }),
    [t]
  );

  const handlePromptConfirm = useCallback(() => {
    promptResolveRef.current?.(promptInput);
    promptResolveRef.current = null;
    setPromptState(null);
  }, [promptInput]);

  const handlePromptCancel = useCallback(() => {
    promptResolveRef.current?.(null);
    promptResolveRef.current = null;
    setPromptState(null);
  }, []);

  return (
    <ModalContext.Provider value={{ showConfirm, showSuccess, showError, showInfo, toast, prompt }}>
      {children}
      <ModalOverlay state={state} onClose={close} />
      {promptState?.open && (
        <PromptOverlay
          state={promptState}
          input={promptInput}
          onInputChange={(v) =>
            setPromptInput(
              promptState.maxLength !== undefined ? v.slice(0, promptState.maxLength) : v
            )
          }
          onConfirm={handlePromptConfirm}
          onCancel={handlePromptCancel}
        />
      )}
      <ToastContainer toasts={toasts} />
    </ModalContext.Provider>
  );
}

const icons: Record<ModalType, ReactNode> = {
  confirm: <AlertTriangle size={22} className="text-warning" />,
  success: <CheckCircle size={22} className="text-success" />,
  error: <XCircle size={22} className="text-danger" />,
  info: <Info size={22} className="text-accent" />,
};

const defaultTitleKeys: Record<ModalType, string> = {
  confirm: "common.confirm",
  success: "common.success",
  error: "common.error",
  info: "common.info",
};

function ModalOverlay({ state, onClose }: { state: ModalState; onClose: () => void }) {
  const { t } = useTranslation();

  return (
    <AnimatePresence>
      {state.open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm"
            onClick={state.type === "confirm" ? undefined : onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed inset-0 z-[101] flex items-center justify-center p-4"
          >
            <div className="w-full max-w-sm rounded-xl border border-border bg-surface-1 shadow-[var(--shadow-elevated)] overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 pt-5 pb-0">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-surface-2 p-2">{icons[state.type]}</div>
                  <h3 className="text-[15px] font-semibold text-text-primary">
                    {state.title || t(defaultTitleKeys[state.type])}
                  </h3>
                </div>
                <button
                  onClick={onClose}
                  className="rounded-lg p-1 text-text-muted hover:bg-surface-2 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Body */}
              <div className="px-5 py-4">
                <div className="text-[13px] text-text-secondary leading-relaxed">
                  {state.message}
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 px-5 pb-5">
                {state.type === "confirm" && (
                  <button
                    onClick={state.onCancel}
                    className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-text-secondary hover:bg-surface-2 transition-colors"
                  >
                    {t("common.cancel")}
                  </button>
                )}
                <button
                  onClick={state.onConfirm}
                  className={`rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition-colors ${
                    state.type === "error"
                      ? "bg-danger hover:bg-danger/80"
                      : state.type === "confirm"
                        ? "bg-accent hover:bg-accent-hover"
                        : "bg-accent hover:bg-accent-hover"
                  }`}
                >
                  {t("common.ok")}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function PromptOverlay({
  state,
  input,
  onInputChange,
  onConfirm,
  onCancel,
}: {
  state: PromptState;
  input: string;
  onInputChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm"
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="fixed inset-0 z-[101] flex items-center justify-center p-4"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="prompt-dialog-title"
          className="w-full max-w-sm rounded-xl border border-border bg-surface-1 shadow-[var(--shadow-elevated)] overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-0">
            <h3 id="prompt-dialog-title" className="text-[15px] font-semibold text-text-primary">
              {state.title}
            </h3>
            <button
              onClick={onCancel}
              className="rounded-lg p-1 text-text-muted hover:bg-surface-2 transition-colors"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-4 flex flex-col gap-3">
            {state.message && (
              <div className="text-[13px] text-text-secondary leading-relaxed">{state.message}</div>
            )}
            <input
              type="text"
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              placeholder={state.placeholder}
              maxLength={state.maxLength !== undefined ? state.maxLength : 1000}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onConfirm();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  onCancel();
                }
              }}
              className="w-full px-3 py-1.5 rounded-md border border-border bg-surface-2 text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            {state.maxLength !== undefined && (
              <div className="text-[11px] text-text-muted text-right -mt-1 tabular-nums">
                {input.length}/{state.maxLength}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 pb-5">
            <button
              onClick={onCancel}
              className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-text-secondary hover:bg-surface-2 transition-colors"
            >
              {state.cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white bg-accent hover:bg-accent-hover transition-colors"
            >
              {state.confirmLabel}
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}

const toastIcons: Record<string, ReactNode> = {
  success: <CheckCircle size={16} className="text-emerald-500" />,
  error: <XCircle size={16} className="text-danger" />,
  info: <Info size={16} className="text-accent" />,
};

function ToastContainer({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] flex flex-col items-center gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="pointer-events-auto flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-4 py-2.5 shadow-[var(--shadow-elevated)]"
          >
            {toastIcons[t.type]}
            <span className="text-[13px] font-medium text-text-primary">{t.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
