import { useEffect, useState, type ReactNode } from "react";

interface BackgroundLayerProps {
  url?: string;
  urlMobile?: string;
  children: ReactNode;
  /** Pixel width below which urlMobile is used when set. Default 768. */
  mobileBreakpoint?: number;
}

/**
 * Wraps children with a CSS background-image backdrop. Picks `urlMobile`
 * when set and the viewport is below the breakpoint. Uses an in-memory
 * `<Image>` preload to avoid flash of unstyled background; on load error
 * the background is silently dropped (falls back to the default page bg).
 */
export default function BackgroundLayer({
  url,
  urlMobile,
  children,
  mobileBreakpoint = 768,
}: BackgroundLayerProps) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    // Decide which URL to use based on viewport
    const pick = () => {
      if (typeof window === "undefined") return url ?? null;
      const isMobile = window.innerWidth < mobileBreakpoint;
      return (isMobile && urlMobile ? urlMobile : url) ?? null;
    };

    const candidate = pick();
    setLoadFailed(false);

    if (!candidate) {
      setResolvedUrl(null);
      return;
    }

    // Preload
    const img = new Image();
    let cancelled = false;
    img.onload = () => {
      if (!cancelled) setResolvedUrl(candidate);
    };
    img.onerror = () => {
      if (!cancelled) {
        setLoadFailed(true);
        setResolvedUrl(null);
      }
    };
    img.src = candidate;

    // Also listen to resize so we swap mobile/desktop dynamically
    const onResize = () => {
      const next = pick();
      if (next !== candidate) {
        // Re-run the effect on the new URL — trigger via state
        setResolvedUrl(null);
      }
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
    };
  }, [url, urlMobile, mobileBreakpoint]);

  const style = resolvedUrl
    ? {
        backgroundImage: `url(${resolvedUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }
    : loadFailed
    ? {
        backgroundImage:
          "linear-gradient(135deg, var(--surface-1, #f8fafc) 0%, var(--surface-2, #f0f4f8) 100%)",
      }
    : undefined;

  return (
    <div className="min-h-screen relative" style={style}>
      {children}
    </div>
  );
}
