import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { decodeState, submitProviderLogin } from "./providerAuth";

/**
 * Telegram Login Widget page.
 *
 * The bot USERNAME lives in provider.ClientId (not the bot token — that's
 * ClientSecret, used for backend HMAC verification in idp/telegram.go).
 * The username arrives here via ?bot= so this page stands alone and doesn't
 * need to refetch the application.
 */
declare global {
  interface Window {
    onTelegramAuth?: (user: Record<string, unknown>) => void;
  }
}

export default function TelegramLoginPage() {
  const [searchParams] = useSearchParams();
  const [msg, setMsg] = useState<string | null>(null);
  const widgetContainerRef = useRef<HTMLDivElement>(null);
  const consumedRef = useRef(false);

  const state = searchParams.get("state") ?? "";
  const botUsername = searchParams.get("bot") ?? "";

  useEffect(() => {
    if (!state) {
      setMsg("Missing state parameter.");
      return;
    }
    if (!botUsername) {
      setMsg("Missing bot username. Check that the Telegram provider's Client ID is set to the bot's @username.");
      return;
    }

    window.onTelegramAuth = async (user) => {
      if (consumedRef.current) return;
      consumedRef.current = true;

      const inner = decodeState(state);
      const applicationName = inner.get("application") ?? "";
      const providerName = inner.get("provider") ?? "";
      const method = inner.get("method") ?? "signup";

      try {
        const res = await submitProviderLogin({
          applicationName,
          providerName,
          code: JSON.stringify(user),
          method,
        });
        if (res.status === "ok") {
          window.location.assign("/");
        } else {
          setMsg(res.msg || "Sign-in failed.");
          consumedRef.current = false;
        }
      } catch (err: any) {
        setMsg(err?.message || String(err));
        consumedRef.current = false;
      }
    };

    const container = widgetContainerRef.current;
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");
    container?.appendChild(script);

    return () => {
      delete window.onTelegramAuth;
      // Telegram's widget appends a <script> AND an <iframe> sibling into
      // the container. Wipe the container so a re-mount doesn't stack them.
      if (container) container.replaceChildren();
    };
  }, [state, botUsername]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-1 p-6">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface-2 p-5">
        <div className="mb-3 text-[13px] font-semibold text-text-primary">
          Sign in with Telegram
        </div>
        {msg ? (
          <>
            <div className="mb-3 rounded-md border border-danger/30 bg-danger/10 p-3 text-[12px] text-danger break-all">
              {msg}
            </div>
            <a href="/login" className="text-[12px] text-accent hover:underline">
              Back to login
            </a>
          </>
        ) : (
          <div className="flex flex-col items-start gap-2">
            <p className="text-[12px] text-text-muted">
              Click the button below. Telegram will open a popup to confirm.
            </p>
            <div ref={widgetContainerRef} />
          </div>
        )}
      </div>
    </div>
  );
}
