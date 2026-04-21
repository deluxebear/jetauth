// web/src/auth/signin/QRBody.tsx
//
// "QR" sign-in method tab. Pulls a QR image from the app's first
// WeChat-type provider, polls for the scan event, and calls onSuccess
// when the ticket flips to SCAN.
//
// The backend dependencies are the generalised QR endpoints:
//   GET /api/qr/begin?provider=<id>   -> { data: imageUrl, data2: ticket, data3: expiresInSec }
//   GET /api/qr/status?ticket=<t>     -> { data: "pending" | "scanned" | "expired" }
//
// WeChat-typed providers route through the existing Casdoor plumbing;
// DingTalk / Lark / Custom return a "not yet implemented" error from
// /api/qr/begin until their IdP adapters land (see docs/2026-04-19-qr-signin-proposal.md).
//
// Final session handoff after "scanned" is still TODO — the component
// surfaces the scan event to the caller so the integration can plug
// into /api/login when the full flow lands.

import { useEffect, useState } from "react";
import { QrCode } from "lucide-react";
import { api } from "../../api/client";
import { useTranslation } from "../../i18n";
import type { ResolvedProvider } from "../api/types";

interface Props {
  providers: ResolvedProvider[];
  onScanned: () => void;
}

interface QRResponse {
  status: string;
  msg?: string;
  data?: string;
  data2?: string;
}

export default function QRBody({ providers, onScanned }: Props) {
  const { t } = useTranslation();
  const [imageUrl, setImageUrl] = useState("");
  const [ticket, setTicket] = useState("");
  const [error, setError] = useState("");
  const [scanned, setScanned] = useState(false);

  // Pick the first WeChat-type provider the app has. QR in this form only
  // works with WeChat today; DingTalk / Lark / Custom need the generalized
  // backend from the proposal doc before they can drop in here.
  const qrProvider = providers.find((p) => p.type === "WeChat");

  useEffect(() => {
    if (!qrProvider) {
      setError(t("auth.qr.noProvider"));
      return;
    }
    const providerId = `admin/${qrProvider.name}`;
    api
      .get<QRResponse>(`/api/qr/begin?provider=${encodeURIComponent(providerId)}`)
      .then((res) => {
        if (res.status !== "ok" || !res.data) {
          setError(res.msg ?? t("auth.qr.failed"));
          return;
        }
        setImageUrl(res.data);
        setTicket(res.data2 ?? "");
      })
      .catch((e: unknown) => setError((e as Error).message ?? t("auth.qr.failed")));
  }, [qrProvider, t]);

  useEffect(() => {
    if (!ticket || scanned) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await api.get<QRResponse>(
          `/api/qr/status?ticket=${encodeURIComponent(ticket)}`,
        );
        if (cancelled) return;
        if (res.status === "ok" && res.data === "scanned") {
          setScanned(true);
          onScanned();
        }
        // "pending" / "expired" stay quiet — pending is the normal pre-scan
        // state, and expired is treated the same as pending for now (the
        // ticket regeneration story is M4+).
      } catch {
        // Network hiccup during poll — swallow and retry next tick.
      }
    };
    const id = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [ticket, scanned, onScanned]);

  if (error) {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-[13px] text-danger">
        <div className="flex items-center gap-2">
          <QrCode size={16} />
          {error}
        </div>
      </div>
    );
  }

  if (!imageUrl) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <div className="h-5 w-5 rounded-full border-2 border-text-muted/30 border-t-text-muted animate-spin" />
        <p className="text-[12px] text-text-muted">{t("auth.qr.loading")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-4" data-signinitem="qr">
      <div className="rounded-xl border border-border bg-white p-3 shadow-sm">
        <img
          src={imageUrl}
          alt={t("auth.qr.alt")}
          width={176}
          height={176}
          className="block w-44 h-44"
        />
      </div>
      <p className="text-[13px] text-text-secondary text-center">
        {scanned ? t("auth.qr.scanned") : t("auth.qr.prompt")}
      </p>
      {!scanned && (
        <p className="text-[11px] text-text-muted text-center">
          {t("auth.qr.pollHint")}
        </p>
      )}
    </div>
  );
}
