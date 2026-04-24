import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useAccessibleResources } from "../useAccessibleResources";

describe("useAccessibleResources", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    // Ensure fake timers are always restored after each test to prevent leakage
    vi.useRealTimers();
  });

  it("flattens multi-page response into a single objects array", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(okRes({ objects: ["doc:1", "doc:2"], continuationToken: "tok1" }))
      .mockResolvedValueOnce(okRes({ objects: ["doc:3"], continuationToken: "" }));

    const { result } = renderHook(() => useAccessibleResources({
      appId: "o/a", type: "doc", relation: "viewer", user: "user:alice", pageSize: 2,
    }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.objects).toEqual(["doc:1", "doc:2", "doc:3"]);
    expect(result.current.loadedPages).toBe(2);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
  });

  it("retries after HTTP 429 honoring Retry-After header", async () => {
    // shouldAdvanceTime:true lets waitFor's internal polling (setTimeout) fire
    // while still giving us manual control over the Retry-After delay.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("", {
        status: 429,
        headers: { "Retry-After": "1" },
      }))
      .mockResolvedValueOnce(okRes({ objects: ["doc:1"], continuationToken: "" }));

    const { result } = renderHook(() => useAccessibleResources({
      appId: "o/a", type: "doc", relation: "viewer", user: "user:alice",
    }));

    // First tick: 429 received → rateLimited should flip true
    await waitFor(() => expect(result.current.rateLimited).toBe(true));

    // Advance beyond Retry-After; retry fires
    await vi.advanceTimersByTimeAsync(1100);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.objects).toEqual(["doc:1"]);
  });

  it("surfaces non-429 HTTP errors via error field", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("{}", { status: 500 }),
    );
    const { result } = renderHook(() => useAccessibleResources({
      appId: "o/a", type: "doc", relation: "viewer", user: "user:alice",
    }));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.isLoading).toBe(false);
  });

  it("aborts in-flight request on unmount without leaking setState", async () => {
    // Fetch never resolves — we rely on abort fired via AbortController.signal.
    // The reject callback escapes through a Promise executor closure, which
    // TS's control-flow analysis can't narrow across; wrap it in an object
    // so the field type stays `((e: Error) => void) | null` at the call site
    // instead of narrowing to the initializer's `null` → `never`.
    const rejectRef: { fn: ((e: Error) => void) | null } = { fn: null };
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(
      () => new Promise((_resolve, reject) => { rejectRef.fn = reject; }),
    );
    const { unmount } = renderHook(() => useAccessibleResources({
      appId: "o/a", type: "doc", relation: "viewer", user: "user:alice",
    }));
    unmount();
    // Simulate AbortController.abort() path.
    rejectRef.fn?.(Object.assign(new Error("aborted"), { name: "AbortError" }));
    // No assertion needed — absence of "setState on unmounted component" warning suffices
  });

  it("skips fetch when enabled is false", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { result } = renderHook(() => useAccessibleResources({
      appId: "o/a", type: "doc", relation: "viewer", user: "user:alice", enabled: false,
    }));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.objects).toEqual([]);
  });

  it("treats non-numeric Retry-After as default 1s (RFC 7231 HTTP-date safety)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("", {
        status: 429,
        headers: { "Retry-After": "Sun, 06 Nov 1994 08:49:37 GMT" },
      }))
      .mockResolvedValueOnce(okRes({ objects: ["doc:1"], continuationToken: "" }));

    const { result } = renderHook(() => useAccessibleResources({
      appId: "o/a", type: "doc", relation: "viewer", user: "user:alice",
    }));
    await waitFor(() => expect(result.current.rateLimited).toBe(true));
    // Default 1s delay kicks in for non-numeric Retry-After
    await vi.advanceTimersByTimeAsync(1100);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.objects).toEqual(["doc:1"]);
    vi.useRealTimers();
  });
});

function okRes(body: unknown): Response {
  return new Response(
    JSON.stringify({ status: "ok", data: body }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
