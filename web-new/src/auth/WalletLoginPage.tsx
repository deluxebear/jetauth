import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { decodeState, submitProviderLogin } from "./providerAuth";
import { api } from "../api/client";

/**
 * MetaMask / Web3Onboard login page — EIP-4361 (Sign-In With Ethereum) flow.
 *
 *   1. Detect an injected EIP-1193 wallet (MetaMask / Coinbase / Rainbow /...).
 *   2. Prompt for account; the address is the claimed user identity.
 *   3. Fetch a server-issued one-time nonce for that address (/api/web3/nonce).
 *      Without a server-tracked nonce, a captured signature could be replayed
 *      forever. The nonce is single-use and expires with the browser session.
 *   4. Build a SIWE message binding the sign-in to our domain, URI, chain,
 *      the nonce, and a 5-minute expiration window.
 *   5. personal_sign the message.
 *   6. POST {message, signature} as `code` to /api/login; backend ecrecover-
 *      verifies the signature against the address inside the message and
 *      re-checks the nonce + domain + time window (idp/metamask.go).
 */
type Phase = "signing" | "submitting" | "error";

interface NonceResponse {
  status: string;
  msg?: string;
  /** Server-issued single-use SIWE nonce. */
  data?: string;
  /** EIP-55 checksummed form of the submitted address — must go into the SIWE message verbatim. */
  data2?: string;
}

// Resolve the URL to send the user back to when they bail on the wallet flow.
// State (packed at authorize time) carries organization + application and is
// the reliable source even after a refresh; fall back to the same-origin
// referrer if state is missing, and `/login` as a last resort.
function resolveBackToLoginUrl(state: string): string {
  if (state) {
    const inner = decodeState(state);
    const org = inner.get("organization") ?? "";
    const app = inner.get("application") ?? "";
    if (org && app) return `/login/${org}/${app}`;
  }
  try {
    const ref = document.referrer;
    if (!ref) return "/login";
    const u = new URL(ref);
    if (u.origin !== window.location.origin) return "/login";
    if (u.pathname === "/auth/wallet/metamask" || u.pathname === "/auth/wallet/web3onboard") {
      return "/login";
    }
    return u.pathname + u.search;
  } catch {
    return "/login";
  }
}

export default function WalletLoginPage() {
  const { type: typeParam } = useParams<{ type: string }>();
  const [searchParams] = useSearchParams();
  const [phase, setPhase] = useState<Phase>("signing");
  const [msg, setMsg] = useState<string | null>(null);
  const startedRef = useRef(false);
  const backToLoginUrl = useRef(resolveBackToLoginUrl(searchParams.get("state") ?? "")).current;

  const walletType =
    typeParam === "metamask" ? "MetaMask" :
    typeParam === "web3onboard" ? "Web3Onboard" : "";

  const start = async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setPhase("signing");
    setMsg(null);

    const state = searchParams.get("state") ?? "";
    if (!state) {
      setPhase("error");
      setMsg("Missing state parameter.");
      return;
    }

    const eth = window.ethereum;
    if (!eth) {
      setPhase("error");
      setMsg(
        "No injected Web3 wallet detected. Install a wallet extension (MetaMask, Coinbase Wallet, Rainbow, ...) and try again.",
      );
      startedRef.current = false;
      return;
    }

    try {
      const accounts = await eth.request<string[]>({ method: "eth_requestAccounts" });
      const address = accounts?.[0];
      if (!address) throw new Error("No account returned by the wallet.");

      const nonceRes = await api.get<NonceResponse>(`/api/web3/nonce?address=${encodeURIComponent(address)}`);
      if (nonceRes.status !== "ok" || !nonceRes.data || !nonceRes.data2) {
        throw new Error(nonceRes.msg || "Failed to fetch login nonce.");
      }
      const nonce = nonceRes.data;
      // SIWE requires the address inside the message to be in EIP-55 checksum
      // form — wallets are inconsistent about this, so we take the canonical
      // version the server computed.
      const checksumAddress = nonceRes.data2;

      const chainIdHex = await eth.request<string>({ method: "eth_chainId" });
      const chainId = parseInt(chainIdHex, 16) || 1;

      const issuedAt = new Date();
      const expiration = new Date(issuedAt.getTime() + 5 * 60 * 1000);
      const domain = window.location.host;
      const uri = window.location.origin;
      const siweMessage =
        `${domain} wants you to sign in with your Ethereum account:\n` +
        `${checksumAddress}\n` +
        `\n` +
        `Sign in to ${domain}.\n` +
        `\n` +
        `URI: ${uri}\n` +
        `Version: 1\n` +
        `Chain ID: ${chainId}\n` +
        `Nonce: ${nonce}\n` +
        `Issued At: ${issuedAt.toISOString()}\n` +
        `Expiration Time: ${expiration.toISOString()}`;

      const signature = await eth.request<string>({
        method: "personal_sign",
        params: [siweMessage, checksumAddress],
      });

      setPhase("submitting");

      const inner = decodeState(state);
      const applicationName = inner.get("application") ?? "";
      const providerName = inner.get("provider") ?? "";
      // Whitelist method — a crafted state mustn't force us into an unexpected
      // code path (matches the guard in AuthCallback.tsx).
      const rawMethod = inner.get("method");
      const method =
        rawMethod === "signup" || rawMethod === "signin" || rawMethod === "link"
          ? rawMethod
          : "signup";

      const res = await submitProviderLogin({
        applicationName,
        providerName,
        code: JSON.stringify({ message: siweMessage, signature }),
        method,
      });

      if (res.status === "ok") {
        window.location.assign("/");
      } else {
        setPhase("error");
        setMsg(res.msg || "Sign-in failed.");
        // Reset the guard so Retry can re-run the whole dance. Without this,
        // the second click no-ops because startedRef is still true.
        startedRef.current = false;
      }
    } catch (err: any) {
      setPhase("error");
      // EIP-1193 code 4001 = user rejected the request.
      if (err?.code === 4001) {
        setMsg("Signature request was rejected. Try again if you want to continue.");
      } else {
        setMsg(err?.message || String(err));
      }
      startedRef.current = false;
    }
  };

  useEffect(() => {
    if (!walletType) return;
    start();
  }, [walletType]);

  if (!walletType) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface-1 p-6">
        <div className="max-w-md rounded-lg border border-danger/30 bg-danger/10 p-4 text-[13px] text-danger">
          <div className="font-semibold mb-1">Unknown wallet type</div>
          <div className="opacity-80">Expected /auth/wallet/metamask or /auth/wallet/web3onboard.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-1 p-6">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface-2 p-5">
        <div className="mb-3 text-[13px] font-semibold text-text-primary">
          Sign in with {walletType}
        </div>

        {phase === "signing" && (
          <div className="flex items-center gap-3 text-[13px] text-text-muted">
            <div className="h-5 w-5 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
            <span>Waiting for your wallet to sign the challenge...</span>
          </div>
        )}

        {phase === "submitting" && (
          <div className="flex items-center gap-3 text-[13px] text-text-muted">
            <div className="h-5 w-5 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
            <span>Submitting signature...</span>
          </div>
        )}

        {phase === "error" && msg && (
          <>
            <div className="mb-3 rounded-md border border-danger/30 bg-danger/10 p-3 text-[12px] text-danger break-all">
              {msg}
            </div>
            <div className="flex gap-2">
              <button
                onClick={start}
                className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white hover:bg-accent-hover"
              >
                Retry
              </button>
              <a
                href={backToLoginUrl}
                className="rounded-md border border-border px-3 py-1.5 text-[12px] text-text-secondary hover:bg-surface-3"
              >
                Back to login
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
