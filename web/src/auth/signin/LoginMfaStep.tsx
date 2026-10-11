import type { ComponentProps } from "react";
import { api } from "../../api/client";
import MfaVerify from "../../pages/MfaVerify";
import MfaSetup from "../../pages/MfaSetup";
import type { LoginApiResponse } from "../authPost";
import { pendingMfaFrom, type PendingMfa } from "./pendingMfa";

interface Props {
  pending: PendingMfa;
  application: string;
  organization: string;
  /** Called with the final /api/login response once MFA is satisfied. */
  onDone: (res: LoginApiResponse) => void;
  onPending: (next: PendingMfa) => void;
  onError: (msg: string) => void;
  orgBranding?: ComponentProps<typeof MfaVerify>["orgBranding"];
}

export default function LoginMfaStep({ pending, application, organization, onDone, onPending, onError, orgBranding }: Props) {
  if (pending.kind === "verify") {
    return (
      <MfaVerify
        mfaProps={pending.mfaProps}
        loginForm={{ application, organization }}
        loginUrl={pending.loginUrl}
        baseBody={pending.baseBody}
        onVerified={(res) => onDone(res as LoginApiResponse)}
        onError={onError}
        orgBranding={orgBranding}
      />
    );
  }

  const slash = pending.userId.indexOf("/");
  const owner = pending.userId.slice(0, slash);
  const name = pending.userId.slice(slash + 1);

  // After enrolling, sign in again: the backend now answers NextMfa and the
  // user verifies with the factor they just set up.
  const signInAgain = async () => {
    try {
      const body = pending.loginBody;
      const res = await api.post<LoginApiResponse>(pending.loginUrl, body);
      if (res.status !== "ok") {
        onError(res.msg ?? "Login failed after MFA setup");
        return;
      }
      const next = pendingMfaFrom(res, pending.loginUrl, body);
      if (next) onPending(next);
      else onDone(res);
    } catch (e: unknown) {
      onError((e as Error).message ?? "network error");
    }
  };

  return (
    <MfaSetup
      mfaType="app"
      owner={owner}
      name={name}
      organization={organization}
      application={application}
      encryptedPassword={pending.password}
      orgBranding={orgBranding}
      onComplete={signInAgain}
    />
  );
}
