// web-new/src/auth/signin/ClassicSigninPage.tsx
//
// Legacy tabs-mode signin: user picks method first (tab), then types
// identifier + credentials in one form. Opt-in via Application.SigninMethodMode="classic".
//
// TODO (W3): This file is ~800 lines due to inlined sub-components (PasswordBody,
// CodeBody, WebAuthnBody, FaceBody). W3 should extract them into shared /signin/forms/
// modules reusable by both SigninPage and ClassicSigninPage and bring this back under
// 400 lines. Classic mode exists primarily for orgs that prefer the pre-revamp UX or
// run LDAP-only deployments.

import { useState, useEffect, useRef, useCallback, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, Send, KeyRound, Camera } from "lucide-react";
import { useTheme } from "../../theme";
import { useTranslation } from "../../i18n";
import { api } from "../../api/client";
import BrandingLayer from "../shell/BrandingLayer";
import TopBar from "../shell/TopBar";
import SafeHtml from "../shell/SafeHtml";
import ProvidersRow from "./ProvidersRow";
import type { AuthApplication, ResolvedProvider } from "../api/types";

// ─── Types ──────────────────────────────────────────────────────────────────

type ClassicTab = "Password" | "Verification code" | "WebAuthn" | "Face ID";

interface Props {
  application: AuthApplication;
  providers: ResolvedProvider[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildLoginBody(
  application: AuthApplication,
  orgName: string,
  username: string,
  signinMethod: string,
  searchParams: URLSearchParams,
  extra?: Record<string, unknown>,
) {
  return {
    application: application.name,
    organization: orgName,
    username,
    type: searchParams.get("type") ?? "login",
    signinMethod,
    clientId: application.name,
    redirectUri: searchParams.get("redirect_uri") ?? "",
    state: searchParams.get("state") ?? "",
    ...extra,
  };
}

function handleRedirect(
  res: { status: string; msg?: string; data?: string },
  searchParams: URLSearchParams,
) {
  const redirectUri = searchParams.get("redirect_uri");
  if (redirectUri && res.data) {
    const joiner = redirectUri.includes("?") ? "&" : "?";
    window.location.href = `${redirectUri}${joiner}code=${encodeURIComponent(res.data)}&state=${encodeURIComponent(searchParams.get("state") ?? "")}`;
  } else {
    window.location.href = "/";
  }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

/** Shared username input used at the top of every tab */
function UsernameField({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
}) {
  return (
    <div data-signinitem="username">
      <label className="block text-[12px] font-medium text-text-secondary mb-1.5">
        {label}
      </label>
      <input
        type="text"
        autoComplete="username"
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder && placeholder.length > 0 ? placeholder : label}
        className="w-full rounded-lg border border-border bg-surface-1 px-3.5 py-2.5 text-[14px] text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition-all"
      />
    </div>
  );
}

/** Password tab body */
function PasswordBody({
  username,
  setUsername,
  usernameLabel,
  usernamePlaceholder,
  onSubmit,
  error,
  forgotHref,
}: {
  username: string;
  setUsername: (v: string) => void;
  usernameLabel: string;
  usernamePlaceholder?: string;
  onSubmit: (pw: string) => Promise<void>;
  error: string;
  forgotHref?: string;
}) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username || !password || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(password);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <UsernameField value={username} onChange={setUsername} label={usernameLabel} placeholder={usernamePlaceholder} />

      <div>
        <label className="block text-[12px] font-medium text-text-secondary mb-1.5">
          {t("auth.password.label")}
        </label>
        <div className="relative">
          <input
            type={show ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("auth.password.placeholder")}
            className="w-full rounded-lg border border-border bg-surface-1 px-3.5 py-2.5 pr-10 text-[14px] text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition-all"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? t("auth.password.hidePassword") : t("auth.password.showPassword")}
            className="absolute inset-y-0 right-3 flex items-center text-text-muted hover:text-text-secondary transition-colors"
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-[13px] text-danger">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!username || !password || submitting}
        className="group w-full flex items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-[14px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
      >
        {submitting ? (
          <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
        ) : (
          <>
            {t("auth.password.submitButton")}
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </>
        )}
      </button>

      {forgotHref && (
        <div className="text-center">
          <a
            href={forgotHref}
            className="text-[12px] text-accent hover:underline"
          >
            {t("auth.password.forgotLink")}
          </a>
        </div>
      )}
    </form>
  );
}

/** Code tab body — inline send + verify flow */
function CodeBody({
  username,
  setUsername,
  usernameLabel,
  usernamePlaceholder,
  onSubmit,
  error,
  application,
  orgName,
}: {
  username: string;
  setUsername: (v: string) => void;
  usernameLabel: string;
  usernamePlaceholder?: string;
  onSubmit: (code: string) => Promise<void>;
  error: string;
  application: string;
  orgName: string;
}) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<"send" | "verify">("send");
  const [code, setCode] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sendError, setSendError] = useState("");

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // Guess dest type from username shape
  const destType: "email" | "phone" = username.includes("@") ? "email" : "phone";
  const sendLabel = t(
    destType === "email" ? "auth.code.sendToEmail" : "auth.code.sendToPhone",
  ).replace(destType === "email" ? "{email}" : "{phone}", username || "…");

  const sendCode = async () => {
    if (!username) return;
    setSendError("");
    setSending(true);
    try {
      await api.post("/api/send-verification-code", {
        applicationId: `admin/${application}`,
        organizationId: `admin/${orgName}`,
        method: "login",
        type: destType,
        dest: username,
        checkUser: username,
      });
      setPhase("verify");
      setCountdown(60);
    } catch (e: unknown) {
      setSendError((e as Error).message || t("auth.code.sendError"));
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== 6 || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(code);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <UsernameField value={username} onChange={(v) => { setUsername(v); setPhase("send"); }} label={usernameLabel} placeholder={usernamePlaceholder} />

      {(error || sendError) && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-[13px] text-danger">
          {error || sendError}
        </div>
      )}

      {phase === "send" && (
        <button
          type="button"
          onClick={sendCode}
          disabled={sending || !username}
          className="group w-full flex items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-[14px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
        >
          {sending ? (
            <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          ) : (
            <>
              <Send size={16} />
              {sendLabel}
            </>
          )}
        </button>
      )}

      {phase === "verify" && (
        <>
          <div>
            <label className="block text-[12px] font-medium text-text-secondary mb-1.5">
              {t("auth.code.codeLabel")}
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              autoFocus
              autoComplete="one-time-code"
              placeholder={t("auth.code.codePlaceholder")}
              className="w-full rounded-lg border border-border bg-surface-1 px-3.5 py-2.5 text-[14px] tracking-[0.3em] text-center text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={code.length !== 6 || submitting}
            className="group w-full flex items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-[14px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            {submitting ? (
              <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            ) : (
              <>
                {t("auth.code.submit")}
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>

          <button
            type="button"
            onClick={sendCode}
            disabled={countdown > 0 || sending}
            className="w-full py-2 text-center text-[12px] text-text-muted hover:text-text-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {countdown > 0
              ? t("auth.code.resend").replace("{seconds}", String(countdown))
              : t("auth.code.resendReady")}
          </button>
        </>
      )}
    </form>
  );
}

/** WebAuthn tab body */
function WebAuthnBody({
  username,
  setUsername,
  usernameLabel,
  usernamePlaceholder,
  onSuccess,
  error,
  orgName,
}: {
  username: string;
  setUsername: (v: string) => void;
  usernameLabel: string;
  usernamePlaceholder?: string;
  onSuccess: () => void;
  error: string;
  orgName: string;
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [flowError, setFlowError] = useState("");
  const isSupported = typeof window !== "undefined" && !!window.PublicKeyCredential;

  const handleSignin = async () => {
    if (!username) return;
    setFlowError("");
    setLoading(true);
    try {
      const { startAuthentication } = await import("@simplewebauthn/browser");
      const options = await api.get<Record<string, unknown>>(
        `/api/webauthn/signin/begin?owner=${encodeURIComponent(orgName)}&name=${encodeURIComponent(username)}`,
      );
      const assertion = await startAuthentication({ optionsJSON: options as unknown as Parameters<typeof startAuthentication>[0]["optionsJSON"] });
      await api.post("/api/webauthn/signin/finish", assertion);
      onSuccess();
    } catch (e: unknown) {
      setFlowError((e as Error).message || t("auth.webauthn.failed"));
    } finally {
      setLoading(false);
    }
  };

  const displayError = error || flowError;

  return (
    <div className="space-y-4">
      <UsernameField value={username} onChange={setUsername} label={usernameLabel} placeholder={usernamePlaceholder} />

      {displayError && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-[13px] text-danger">
          {displayError}
        </div>
      )}

      {isSupported ? (
        <>
          <p className="text-[13px] text-text-muted text-center">{t("auth.webauthn.prompt")}</p>
          <button
            type="button"
            onClick={handleSignin}
            disabled={loading || !username}
            className="group w-full flex items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-[14px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            {loading ? (
              <>
                <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                {t("auth.webauthn.trying")}
              </>
            ) : (
              <>
                <KeyRound size={16} />
                {t("auth.webauthn.button")}
              </>
            )}
          </button>
        </>
      ) : (
        <div className="rounded-lg border border-border bg-surface-1 px-4 py-4 text-center">
          <KeyRound size={24} className="mx-auto mb-2 text-text-muted" />
          <p className="text-[13px] text-text-muted">{t("auth.webauthn.unsupported")}</p>
        </div>
      )}
    </div>
  );
}

/** Face ID tab body */
function FaceBody({
  username,
  setUsername,
  usernameLabel,
  usernamePlaceholder,
  onSuccess,
  error,
  application,
  orgName,
}: {
  username: string;
  setUsername: (v: string) => void;
  usernameLabel: string;
  usernamePlaceholder?: string;
  onSuccess: () => void;
  error: string;
  application: string;
  orgName: string;
}) {
  const { t } = useTranslation();
  type FaceState = "idle" | "live" | "processing" | "cameraDenied" | "failed";
  const [state, setState] = useState<FaceState>("idle");
  const [flowError, setFlowError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Start camera when username is filled and user hasn't started yet
  const startCamera = useCallback(() => {
    let cancelled = false;
    setState("idle");
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        setState("live");
      })
      .catch(() => { if (!cancelled) setState("cameraDenied"); });
    return () => { cancelled = true; stopStream(); };
  }, [stopStream]);

  useEffect(() => {
    return () => stopStream();
  }, [stopStream]);

  useEffect(() => {
    if (state !== "live") return;
    const video = videoRef.current;
    if (!video || !streamRef.current) return;
    try {
      video.srcObject = streamRef.current;
      video.play().catch(() => {});
    } catch { /* ignore */ }
  }, [state]);

  const handleCapture = async () => {
    if (!username) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/png");

    setState("processing");
    setFlowError("");
    try {
      const res = await api.post<{ status: string; msg?: string; data?: string }>("/api/login", {
        application,
        organization: orgName,
        username,
        type: "login",
        signinMethod: "Face ID",
        faceIdImage: [dataUrl],
        clientId: application,
      });
      if (res.status !== "ok") {
        setFlowError(res.msg ?? t("auth.face.failed"));
        setState("failed");
        return;
      }
      stopStream();
      onSuccess();
    } catch (e: unknown) {
      setFlowError((e as Error).message || t("auth.face.failed"));
      setState("failed");
    }
  };

  const displayError = error || flowError;

  return (
    <div className="space-y-4">
      <UsernameField value={username} onChange={(v) => { setUsername(v); stopStream(); setState("idle"); }} label={usernameLabel} placeholder={usernamePlaceholder} />

      {displayError && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-[13px] text-danger">
          {displayError}
        </div>
      )}

      {state === "idle" && (
        <button
          type="button"
          onClick={startCamera}
          disabled={!username}
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-border bg-surface-1 py-2.5 text-[14px] font-medium text-text-primary hover:bg-surface-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Camera size={16} />
          {t("auth.face.button")}
        </button>
      )}

      {state === "cameraDenied" && (
        <div className="rounded-lg border border-border bg-surface-1 px-4 py-6 text-center">
          <Camera size={24} className="mx-auto mb-2 text-text-muted" />
          <p className="text-[13px] text-text-muted">{t("auth.face.cameraError")}</p>
        </div>
      )}

      {(state === "live" || state === "processing") && (
        <>
          <p className="text-[13px] text-text-muted text-center">{t("auth.face.prompt")}</p>
          <div className="flex justify-center">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="rounded-xl w-full max-w-[300px] aspect-video object-cover bg-surface-2"
            />
          </div>
          <button
            type="button"
            onClick={handleCapture}
            disabled={state === "processing"}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-[14px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            {state === "processing" ? (
              <>
                <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                {t("auth.face.processing")}
              </>
            ) : (
              <>
                <Camera size={16} />
                {t("auth.face.button")}
              </>
            )}
          </button>
        </>
      )}

      {state === "failed" && (
        <button
          type="button"
          onClick={() => { setFlowError(""); setState("idle"); }}
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-border bg-surface-1 py-2.5 text-[14px] font-medium text-text-primary hover:bg-surface-2 transition-colors"
        >
          {t("auth.face.retry")}
        </button>
      )}

      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
    </div>
  );
}

// ─── ClassicSigninPage ───────────────────────────────────────────────────────

export default function ClassicSigninPage({ application, providers }: Props) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");

  const orgName =
    application.organizationObj?.name ?? application.organization ?? "built-in";

  // Known tab handlers in this file. Methods outside this set are skipped
  // (e.g. LDAP / WeChat are handled elsewhere in classic mode).
  const SUPPORTED_CLASSIC_TABS: readonly ClassicTab[] = [
    "Password",
    "Verification code",
    "WebAuthn",
    "Face ID",
  ];

  // Build the list of tabs. When signinMethods is non-empty, admin-configured
  // order wins — iterate it and include only methods this file knows how to
  // render. When it's empty/null, fall back to legacy default-all behavior
  // driven by boolean flags (backward compat).
  let availableTabs: ClassicTab[] = [];
  const configuredMethods = application.signinMethods ?? [];
  if (configuredMethods.length > 0) {
    for (const m of configuredMethods) {
      const name = m.name as ClassicTab;
      if (SUPPORTED_CLASSIC_TABS.includes(name) && !availableTabs.includes(name)) {
        availableTabs.push(name);
      }
    }
  } else {
    if (application.enablePassword) availableTabs.push("Password");
    if (application.enableCodeSignin) availableTabs.push("Verification code");
    if (application.enableWebAuthn) availableTabs.push("WebAuthn");
  }

  const [tab, setTab] = useState<ClassicTab>(availableTabs[0] ?? "Password");

  // If the available tabs change after mount (shouldn't happen, but guard anyway)
  // make sure the selected tab is still valid.
  const activeTab = availableTabs.includes(tab) ? tab : (availableTabs[0] ?? "Password");

  const tabLabels: Record<ClassicTab, string> = {
    "Password": t("auth.classic.tabPassword"),
    "Verification code": t("auth.classic.tabCode"),
    "WebAuthn": t("auth.classic.tabWebAuthn"),
    "Face ID": t("auth.classic.tabFace"),
  };

  const orgLogo =
    theme === "dark" && application.organizationObj?.logoDark
      ? application.organizationObj.logoDark
      : application.organizationObj?.logo ?? application.logo;
  const orgDisplay =
    application.organizationObj?.displayName ??
    application.displayName ??
    application.name;

  // ── Submit handlers ─────────────────────────────────────────────────────

  const handlePasswordSubmit = async (password: string) => {
    setError("");
    try {
      const res = await api.post<{ status: string; msg?: string; data?: string }>(
        "/api/login",
        buildLoginBody(application, orgName, username, "Password", searchParams, { password }),
      );
      if (res.status !== "ok") { setError(res.msg ?? t("auth.signin.noMethodError")); return; }
      handleRedirect(res, searchParams);
    } catch (e: unknown) {
      setError((e as Error).message ?? "network error");
    }
  };

  const handleCodeSubmit = async (code: string) => {
    setError("");
    try {
      const res = await api.post<{ status: string; msg?: string; data?: string }>(
        "/api/login",
        buildLoginBody(application, orgName, username, "Verification code", searchParams, { code }),
      );
      if (res.status !== "ok") { setError(res.msg ?? t("auth.signin.noMethodError")); return; }
      handleRedirect(res, searchParams);
    } catch (e: unknown) {
      setError((e as Error).message ?? "network error");
    }
  };

  const handleWebAuthnSuccess = () => {
    handleRedirect({ status: "ok" }, searchParams);
  };

  const handleFaceSuccess = () => {
    handleRedirect({ status: "ok" }, searchParams);
  };

  const usernameLabel = t("auth.classic.usernameLabel");

  // Admin override for the username field placeholder, sourced from the
  // signinItems[name="Username"].placeholder (if set). Used by every tab.
  const usernamePlaceholder = (application.signinItems ?? []).find(
    (it) => it.name === "Username" && !it.isCustom,
  )?.placeholder;

  return (
    <div className="min-h-screen flex relative">
      <TopBar />

      <div className="w-full flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm">
          {/* Branding */}
          <div className="mb-10">
            <BrandingLayer
              logo={orgLogo}
              logoDark={application.organizationObj?.logoDark}
              favicon={application.organizationObj?.favicon ?? application.favicon}
              displayName={orgDisplay}
              title={application.title}
              theme={theme}
            />
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-text-primary mb-1">
            {orgDisplay}
          </h1>
          <p className="text-[13px] text-text-muted mb-8">
            {t("auth.signin.brandingSubtitle")}
          </p>

          {/* Method tabs */}
          {availableTabs.length > 1 && (
            <div
              role="tablist"
              aria-label="Sign-in method"
              data-cfg-section="signin"
              data-cfg-field="signinMethods"
              className="flex gap-1 rounded-lg border border-border bg-surface-1 p-1 mb-6"
            >
              {availableTabs.map((tabItem) => (
                <button
                  key={tabItem}
                  role="tab"
                  aria-selected={activeTab === tabItem}
                  type="button"
                  data-signinitem={tabItem.replace(/\s+/g, "-").toLowerCase()}
                  onClick={() => { setTab(tabItem); setError(""); }}
                  className={[
                    "flex-1 rounded-md px-2 py-1.5 text-[12px] font-medium transition-colors",
                    activeTab === tabItem
                      ? "bg-white text-text-primary shadow-sm dark:bg-surface-2"
                      : "text-text-muted hover:text-text-secondary",
                  ].join(" ")}
                >
                  {tabLabels[tabItem]}
                </button>
              ))}
            </div>
          )}

          {/* Method bodies */}
          {activeTab === "Password" && (
            <PasswordBody
              username={username}
              setUsername={setUsername}
              usernameLabel={usernameLabel}
              usernamePlaceholder={usernamePlaceholder}
              onSubmit={handlePasswordSubmit}
              error={error}
              forgotHref={`/forget/${application.name}`}
            />
          )}

          {activeTab === "Verification code" && (
            <CodeBody
              username={username}
              setUsername={setUsername}
              usernameLabel={usernameLabel}
              usernamePlaceholder={usernamePlaceholder}
              onSubmit={handleCodeSubmit}
              error={error}
              application={application.name}
              orgName={orgName}
            />
          )}

          {activeTab === "WebAuthn" && (
            <WebAuthnBody
              username={username}
              setUsername={setUsername}
              usernameLabel={usernameLabel}
              usernamePlaceholder={usernamePlaceholder}
              onSuccess={handleWebAuthnSuccess}
              error={error}
              orgName={orgName}
            />
          )}

          {activeTab === "Face ID" && (
            <FaceBody
              username={username}
              setUsername={setUsername}
              usernameLabel={usernameLabel}
              usernamePlaceholder={usernamePlaceholder}
              onSuccess={handleFaceSuccess}
              error={error}
              application={application.name}
              orgName={orgName}
            />
          )}

          {/* Social providers */}
          <div data-signinitem="providers">
            <ProvidersRow
              application={application}
              providers={providers}
              redirectUri={searchParams.get("redirect_uri") ?? undefined}
              state={searchParams.get("state") ?? undefined}
            />
          </div>

          <SafeHtml html={application.signinHtml ?? ""} className="auth-page-html" />
        </div>
      </div>
    </div>
  );
}
