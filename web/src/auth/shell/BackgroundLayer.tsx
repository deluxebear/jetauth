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
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < mobileBreakpoint,
  );

  // Track the viewport so we swap mobile/desktop backgrounds dynamically.
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < mobileBreakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [mobileBreakpoint]);

  // Decide which URL to use based on viewport
  const candidate = (isMobile && urlMobile ? urlMobile : url) ?? null;

  // Preload so the background doesn't flash in half-loaded.
  useEffect(() => {
    if (!candidate) return;
    const img = new Image();
    let cancelled = false;
    img.onload = () => {
      if (!cancelled) setLoadedUrl(candidate);
    };
    img.onerror = () => {
      if (!cancelled) setFailedUrl(candidate);
    };
    img.src = candidate;
    return () => {
      cancelled = true;
    };
  }, [candidate]);

  const resolvedUrl = candidate && loadedUrl === candidate ? candidate : null;
  const loadFailed = !!candidate && failedUrl === candidate;

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
