import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { submitSamlResponse, readSamlParams, type LoginApiResponse } from "./authPost";

/**
 * Entry for SAML SP-initiated flow when the user is already signed in.
 * POSTs /api/login with the session cookie to mint a SAML Response,
 * then auto-submits it to the SP's ACS.
 */
export default function SamlAuthorizePage() {
  const { organizationName, applicationName } = useParams<{
    organizationName?: string;
    applicationName?: string;
  }>();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState("");
  const ranRef = useRef(false);

  const { samlRequest, relayState } = readSamlParams(searchParams);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    if (!samlRequest || !applicationName) {
      setError("Missing samlRequest or application");
      return;
    }
    (async () => {
      try {
        const res = await api.post<LoginApiResponse>("/api/login", {
          application: applicationName,
          organization: organizationName ?? "",
          type: "saml",
          signinMethod: "Password",
          clientId: applicationName,
          samlRequest,
          relayState,
        });
        if (res.status !== "ok" || !res.data || !res.data2?.redirectUrl) {
          setError(res.msg ?? "SAML response failed");
          return;
        }
        submitSamlResponse({
          samlResponse: res.data,
          redirectUrl: res.data2.redirectUrl,
          method: res.data2.method,
          relayState,
        });
      } catch (e: unknown) {
        setError((e as Error).message ?? "network error");
      }
    })();
  }, [applicationName, organizationName, samlRequest, relayState]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      {error ? (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-[13px] text-danger">
          {error}
        </div>
      ) : (
        <div className="text-[13px] text-text-muted">Completing SAML sign-in…</div>
      )}
    </div>
  );
}
