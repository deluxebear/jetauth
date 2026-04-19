import { useEffect } from "react";

interface BrandingLayerProps {
  logo?: string;
  logoDark?: string;
  favicon?: string;
  displayName?: string;
  /** Application.title override — takes precedence over displayName for document.title */
  title?: string;
  theme?: "light" | "dark";
  /** Size variant; default = "header" (~36px). "hero" = larger for hero banners. */
  size?: "header" | "hero";
  /**
   * When true, skip rendering the logo <img>. The displayName heading still
   * renders as a text-only header. Gated by signinItems[name="Logo"].visible
   * from the calling page.
   */
  hideLogo?: boolean;
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
  title,
  theme = "light",
  size = "header",
  hideLogo = false,
}: BrandingLayerProps) {
  useEffect(() => {
    const originalTitle = document.title;
    if (favicon) {
      let link = document.querySelector<HTMLLinkElement>("link[rel*='icon']");
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = favicon;
    }
    const nextTitle = title || displayName;
    if (nextTitle) {
      document.title = nextTitle;
    }
    return () => {
      // Restore the title that was live when this BrandingLayer mounted
      // so nav back to an unbranded page (/, admin dashboard, etc.)
      // doesn't keep the app-specific title.
      if (nextTitle) {
        document.title = originalTitle;
      }
    };
  }, [favicon, displayName, title]);

  const resolvedLogo = theme === "dark" && logoDark ? logoDark : logo;
  const heightClass = size === "hero" ? "h-16 max-w-[360px]" : "h-9 max-w-[200px]";

  if (resolvedLogo && !hideLogo) {
    return (
      <div className="flex items-center gap-3">
        <img
          src={resolvedLogo}
          alt={displayName ?? "Logo"}
          className={`${heightClass} object-contain`}
          data-cfg-section="branding"
          data-cfg-field="logo"
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
        data-cfg-section="branding"
        data-cfg-field="displayName"
      >
        {displayName ?? "JetAuth"}
      </span>
    </div>
  );
}
