import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { useTranslation } from "../i18n";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render errors inside a single page so one broken component shows a
 * recoverable message instead of unmounting the whole admin shell. The layout
 * keys it by pathname, so navigating elsewhere clears the error.
 */
export default class PageErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[PageErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return <PageErrorFallback error={this.state.error} onRetry={() => this.setState({ error: null })} />;
    }
    return this.props.children;
  }
}

function PageErrorFallback({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="mx-auto mt-16 max-w-lg rounded-xl border border-danger/30 bg-danger/5 p-6 text-center">
      <AlertTriangle size={28} className="mx-auto mb-3 text-danger" />
      <h2 className="text-[15px] font-semibold text-text-primary">{t("common.pageError")}</h2>
      <p className="mt-2 break-words font-mono text-[12px] text-text-muted">{error.message}</p>
      <button
        onClick={onRetry}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-[13px] text-text-primary hover:bg-surface-3 transition-colors"
      >
        <RotateCw size={14} />
        {t("common.refresh")}
      </button>
    </div>
  );
}
