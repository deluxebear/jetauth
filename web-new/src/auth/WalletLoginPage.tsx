import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { decodeState, submitProviderLogin, type Web3AuthToken } from "./providerAuth";

/**
 * MetaMask / Web3Onboard login page.
 *
 * Backend stores whatever signature we send (idp/metamask.go, idp/web3onboard.go
 * accept the Web3AuthToken JSON as-is without on-chain signature verification).
 * The address is treated as the user identity.
 */
type Phase = "signing" | "submitting" | "error";

export default function WalletLoginPage() {
  const { type: typeParam } = useParams<{ type: string }>();
  const [searchParams] = useSearchParams();
  const [phase, setPhase] = useState<Phase>("signing");
  const [msg, setMsg] = useState<string | null>(null);
  const startedRef = useRef(false);

  const walletType: Web3AuthToken["walletType"] | "" =
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

      const nonce = crypto.randomUUID();
      const createdAt = Math.floor(Date.now() / 1000);
      const message = `Sign in to ${window.location.host}\nNonce: ${nonce}\nIssued at: ${createdAt}`;

      const signature = await eth.request<string>({
        method: "personal_sign",
        params: [message, address],
      });

      setPhase("submitting");

      const inner = decodeState(state);
      const applicationName = inner.get("application") ?? "";
      const providerName = inner.get("provider") ?? "";
      const method = inner.get("method") ?? "signup";

      const token: Web3AuthToken = {
        address,
        nonce,
        createAt: createdAt,
        typedData: message,
        signature,
        walletType: walletType as Web3AuthToken["walletType"],
      };

      const res = await submitProviderLogin({
        applicationName,
        providerName,
        code: JSON.stringify(token),
        method,
      });

      if (res.status === "ok") {
        window.location.assign("/");
      } else {
        setPhase("error");
        setMsg(res.msg || "Sign-in failed.");
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
                href="/login"
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
