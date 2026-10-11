import { createContext, useContext, type ReactNode } from "react";

export interface PromptOptions {
  title: string;
  message?: ReactNode;
  placeholder?: string;
  defaultValue?: string;
  maxLength?: number;
  confirmLabel?: string;
  cancelLabel?: string;
}

export interface ModalContextType {
  showConfirm: (message: ReactNode, onConfirm: () => void, title?: string) => void;
  showSuccess: (message: ReactNode, title?: string) => void;
  showError: (message: ReactNode, title?: string) => void;
  showInfo: (message: ReactNode, title?: string) => void;
  toast: (message: string, type?: "success" | "error" | "info") => void;
  prompt: (opts: PromptOptions) => Promise<string | null>;
}

export const ModalContext = createContext<ModalContextType>(null!);

export function useModal() {
  return useContext(ModalContext);
}
