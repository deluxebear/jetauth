import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, CheckCircle, Info, XCircle, X } from "lucide-react";

type ModalType = "confirm" | "success" | "error" | "info";

interface ModalState {
  open: boolean;
  type: ModalType;
  title: string;
  message: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}

interface ToastItem {
  id: number;
  type: "success" | "error" | "info";
  message: string;
}

interface ModalContextType {
  showConfirm: (message: string, onConfirm: () => void, title?: string) => void;
  showSuccess: (message: string, title?: string) => void;
  showError: (message: string, title?: string) => void;
  showInfo: (message: string, title?: string) => void;
  toast: (message: string, type?: "success" | "error" | "info") => void;
}

const ModalContext = createContext<ModalContextType>(null!);

export function useModal() {
  return useContext(ModalContext);
}

let toastCounter = 0;

export function ModalProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ModalState>({
    open: false,
    type: "info",
    title: "",
    message: "",
  });
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);

  const toast = useCallback((message: string, type: "success" | "error" | "info" = "success") => {
    const id = ++toastCounter;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const showConfirm = useCallback(
    (message: string, onConfirm: () => void, title?: string) => {
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
    (message: string, title?: string) => {
      setState({ open: true, type: "success", title: title ?? "", message, onConfirm: close });
    },
    [close]
  );

  const showError = useCallback(
    (message: string, title?: string) => {
      setState({ open: true, type: "error", title: title ?? "", message, onConfirm: close });
    },
    [close]
  );

  const showInfo = useCallback(
    (message: string, title?: string) => {
      setState({ open: true, type: "info", title: title ?? "", message, onConfirm: close });
    },
    [close]
  );

  return (
    <ModalContext.Provider value={{ showConfirm, showSuccess, showError, showInfo, toast }}>
      {children}
      <ModalOverlay state={state} onClose={close} />
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

const defaultTitles: Record<ModalType, { en: string; zh: string }> = {
  confirm: { en: "Confirm", zh: "确认" },
  success: { en: "Success", zh: "成功" },
  error: { en: "Error", zh: "错误" },
  info: { en: "Info", zh: "提示" },
};

function ModalOverlay({ state, onClose }: { state: ModalState; onClose: () => void }) {
  const locale = localStorage.getItem("locale") ?? "en";
  const isZh = locale.startsWith("zh");

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
                    {state.title || defaultTitles[state.type][isZh ? "zh" : "en"]}
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
                <p className="text-[13px] text-text-secondary leading-relaxed">
                  {state.message}
                </p>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 px-5 pb-5">
                {state.type === "confirm" && (
                  <button
                    onClick={state.onCancel}
                    className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-text-secondary hover:bg-surface-2 transition-colors"
                  >
                    {isZh ? "取消" : "Cancel"}
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
                  {isZh ? "确定" : "OK"}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
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
