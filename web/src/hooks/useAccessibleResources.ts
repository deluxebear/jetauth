import { useEffect, useRef, useState } from "react";

export interface UseAccessibleResourcesParams {
  appId: string;
  type: string;
  relation: string;
  user: string;
  pageSize?: number;
  enabled?: boolean;
}

export interface UseAccessibleResourcesResult {
  objects: string[];
  isLoading: boolean;
  error: Error | null;
  loadedPages: number;
  rateLimited: boolean;
}

/**
 * useAccessibleResources paginates POST /api/biz-list-objects until the
 * continuation token is exhausted and returns the flat list of object
 * strings. On HTTP 429 it pauses for the Retry-After header duration
 * (defaulting to 1s) and retries the same page. Aborts in-flight requests
 * on unmount so a slow server can't leak stale state into a fresh render.
 *
 * Intended for business frontends that need to render a "resources I can
 * access" list — e.g. the user's document list, rooms, workspaces. Not
 * intended as the admin Tester (which calls /biz-check directly).
 */
export function useAccessibleResources({
  appId,
  type,
  relation,
  user,
  pageSize = 100,
  enabled = true,
}: UseAccessibleResourcesParams): UseAccessibleResourcesResult {
  const [objects, setObjects] = useState<string[]>([]);
  const [loadedPages, setLoadedPages] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [rateLimited, setRateLimited] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }
    const ac = new AbortController();
    abortRef.current = ac;
    let cancelled = false;

    const run = async () => {
      setIsLoading(true);
      setError(null);
      setRateLimited(false);
      const acc: string[] = [];
      let token = "";
      let pages = 0;
      try {
        while (!cancelled) {
          const res = await fetch(
            `/api/biz-list-objects?appId=${encodeURIComponent(appId)}`,
            {
              method: "POST",
              signal: ac.signal,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                objectType: type,
                relation,
                user,
                pageSize,
                continuationToken: token,
              }),
            },
          );
          if (res.status === 429) {
            setRateLimited(true);
            const retryAfter = parseFloat(res.headers.get("Retry-After") || "1");
            await sleep(Math.max(retryAfter, 0) * 1000);
            continue;
          }
          if (!res.ok) {
            throw new Error(`list-objects failed: HTTP ${res.status}`);
          }
          const body = await res.json();
          const page = (body?.data ?? body) as {
            objects?: string[];
            continuationToken?: string;
          };
          acc.push(...(page.objects ?? []));
          pages += 1;
          token = page.continuationToken ?? "";
          if (!token) break;
        }
        if (!cancelled) {
          setObjects(acc);
          setLoadedPages(pages);
        }
      } catch (e: unknown) {
        if (cancelled) return;
        const err = e instanceof Error ? e : new Error(String(e));
        if (err.name === "AbortError") return;
        setError(err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void run();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [appId, type, relation, user, pageSize, enabled]);

  return { objects, isLoading, error, loadedPages, rateLimited };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
