import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, X } from "lucide-react";
import { useTranslation } from "../i18n";

interface MfaItem {
  name: string;
  rule: string;
}

interface MfaProp {
  mfaType: string;
  enabled: boolean;
}

interface Props {
  account: {
    owner: string;
    name: string;
    mfaItems?: MfaItem[];
    multiFactorAuths?: MfaProp[];
    organization?: {
      mfaItems?: MfaItem[];
    };
  } | null;
  justLoggedIn: boolean;
  onDismiss: () => void;
}

/**
 * After login, checks if the user has "Prompted" MFA items that aren't yet enabled,
 * and shows a non-blocking notification banner suggesting they set up MFA.
 *
 * Logic mirrors original EnableMfaNotification.js:
 * 1. Merge user-level mfaItems (priority) with org-level
 * 2. Filter for "Prompted" rule items
 * 3. Further filter for items not yet enabled (via multiFactorAuths)
 * 4. Show notification if any remain
 */
export default function EnableMfaNotification({ account, justLoggedIn, onDismiss }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [promptedTypes, setPromptedTypes] = useState<string[]>([]);

  useEffect(() => {
    if (!justLoggedIn || !account) return;

    // Determine effective mfaItems (user-level overrides org-level)
    let mfaItems = account.organization?.mfaItems ?? [];
    if (account.mfaItems && account.mfaItems.length > 0) {
      mfaItems = account.mfaItems;
    }

    // Filter for Prompted/Prompt (and Required that somehow passed login — shouldn't happen but be safe)
    const promptedOrRequired = mfaItems.filter(
      (item) => item.rule === "Prompted" || item.rule === "Prompt" || item.rule === "Required"
    );

    // Further filter: only items where MFA is NOT yet enabled on user
    const multiFactorAuths = account.multiFactorAuths ?? [];
    const needSetup = promptedOrRequired.filter((item) =>
      multiFactorAuths.some((mfa) => mfa.mfaType === item.name && !mfa.enabled)
    );

    if (needSetup.length > 0) {
      setPromptedTypes(needSetup.map((i) => i.name));
      setVisible(true);
    }
  }, [justLoggedIn, account]);

  if (!visible) return null;

  const mfaTypeLabels: Record<string, string> = {
    sms: t("users.mfa.sms" as any),
    email: t("users.mfa.email" as any),
    app: t("users.mfa.app" as any),
    push: t("users.mfa.push" as any),
    radius: t("users.mfa.radius" as any),
  };

  const handleDismiss = () => {
    setVisible(false);
    onDismiss();
  };

  const handleGoSetup = () => {
    setVisible(false);
    onDismiss();
    navigate(`/mfa/setup?mfaType=${promptedTypes[0]}`);
  };

  return (
    <div className="fixed top-4 right-4 z-[100] w-[380px] animate-in slide-in-from-top-2 duration-300">
      <div className="rounded-xl border border-warning/30 bg-surface-1 shadow-[var(--shadow-elevated)] overflow-hidden">
        <div className="flex items-start gap-3 px-4 py-3">
          <div className="shrink-0 mt-0.5 rounded-full bg-warning/15 p-1.5">
            <Shield size={16} className="text-warning" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-text-primary">
              {t("mfa.notification.title" as any)}
            </p>
            <p className="text-[12px] text-text-secondary mt-1">
              {t("mfa.notification.description" as any)}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {promptedTypes.map((type) => (
                <span key={type} className="inline-flex items-center rounded-full bg-warning/15 border border-warning/20 px-2 py-0.5 text-[11px] font-medium text-warning">
                  {mfaTypeLabels[type] || type}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-3">
              <button onClick={handleDismiss}
                className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors">
                {t("mfa.notification.later" as any)}
              </button>
              <button onClick={handleGoSetup}
                className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-accent-hover transition-colors">
                {t("mfa.notification.goEnable" as any)}
              </button>
            </div>
          </div>
          <button onClick={handleDismiss} className="shrink-0 rounded-lg p-1 text-text-muted hover:bg-surface-2 transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
