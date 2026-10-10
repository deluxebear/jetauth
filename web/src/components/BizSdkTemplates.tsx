import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { useTranslation } from "../i18n";
import { buildGoSdkTemplate, buildTsSdkTemplate } from "./bizSdkTemplates";

// Full SDK templates (local enforcer cache + periodic refresh) for the
// Casbin-mode integration tab. Shown as a Go / TypeScript switcher.

interface Props {
  endpoint: string;
  appId: string;
  displayName?: string;
  onCopied?: () => void;
}

type Lang = "go" | "ts";

export default function BizSdkTemplates({ endpoint, appId, displayName, onCopied }: Props) {
  const { t } = useTranslation();
  const [lang, setLang] = useState<Lang>("go");
  const [copied, setCopied] = useState(false);

  const params = { endpoint, appId, displayName };
  const code = lang === "go" ? buildGoSdkTemplate(params) : buildTsSdkTemplate(params);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      onCopied?.();
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable: the code stays selectable */
    }
  };

  return (
    <div data-testid="biz-sdk-templates">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-[13px] font-semibold text-text-primary">{t("authz.integration.sdk.title")}</h3>
        <div role="tablist" className="flex gap-1">
          {(["go", "ts"] as Lang[]).map((l) => (
            <button
              key={l}
              role="tab"
              aria-selected={lang === l}
              onClick={() => setLang(l)}
              className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
                lang === l ? "bg-accent/10 text-accent" : "text-text-muted hover:bg-surface-2"
              }`}
            >
              {l === "go" ? "Go" : "TypeScript"}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[12px] text-text-muted mb-2">{t("authz.integration.sdk.hint")}</p>
      <div className="relative">
        <button
          onClick={copy}
          aria-label={t("authz.integration.sdk.copy")}
          className="absolute top-3 right-3 rounded-md p-1.5 text-text-muted hover:text-accent hover:bg-accent/10 transition-colors z-10"
        >
          {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
        </button>
        <pre className="rounded-xl border border-border bg-surface-1 p-5 text-[12px] font-mono leading-relaxed text-text-secondary overflow-x-auto max-h-[560px] overflow-y-auto">
          {code}
        </pre>
      </div>
    </div>
  );
}
