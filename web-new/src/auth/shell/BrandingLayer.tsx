import { useEffect } from "react";

interface BrandingLayerProps {
  logo?: string;
  logoDark?: string;
  favicon?: string;
  displayName?: string;
  theme?: "light" | "dark";
  /** Size variant; default = "header" (~36px). "hero" = larger for hero banners. */
  size?: "header" | "hero";
}

/**
 * BrandingLayer renders the logo + display name and sets favicon + document
 * title as a side effect. Used at the top of the auth surface; reusable
 * across signin / signup / forgot-password pages.
 */
export default function BrandingLayer({
  logo,
  logoDark,
  favicon,
  displayName,
  theme = "light",
  size = "header",
}: BrandingLayerProps) {
  useEffect(() => {
    if (favicon) {
      let link = document.querySelector<HTMLLinkElement>("link[rel*='icon']");
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = favicon;
    }
    if (displayName) {
      document.title = displayName;
    }
  }, [favicon, displayName]);

  const resolvedLogo = theme === "dark" && logoDark ? logoDark : logo;
  const heightClass = size === "hero" ? "h-16 max-w-[360px]" : "h-9 max-w-[200px]";

  if (resolvedLogo) {
    return (
      <div className="flex items-center gap-3">
        <img
          src={resolvedLogo}
          alt={displayName ?? "Logo"}
          className={`${heightClass} object-contain`}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span
        className={
          size === "hero"
            ? "text-3xl font-bold tracking-tight"
            : "text-base font-bold tracking-tight"
        }
      >
        {displayName ?? "JetAuth"}
      </span>
    </div>
  );
}
