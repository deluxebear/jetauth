import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  backgroundUrl?: string;
  backgroundUrlMobile?: string;
}

/**
 * formOffset=1: auth form on the left (~420px), branding hero on the
 * right (fills remaining width, shows backgroundUrl if provided).
 * Mobile (<768px): collapses to single-column — the hero panel is hidden
 * and the form gets full viewport.
 */
export default function LeftForm({ children, backgroundUrl, backgroundUrlMobile: _backgroundUrlMobile }: Props) {
  return (
    <div
      className="min-h-screen flex"
      data-cfg-section="layout"
      data-cfg-field="formOffset"
    >
      <div className="w-full lg:w-[420px] lg:flex-shrink-0 bg-surface-0 relative z-10">
        {children}
      </div>
      <div
        className="hidden lg:block flex-1 relative"
        style={
          backgroundUrl
            ? {
                backgroundImage: `url(${backgroundUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : {
                backgroundImage:
                  "linear-gradient(135deg, var(--surface-1, #f8fafc) 0%, var(--surface-2, #f0f4f8) 100%)",
              }
        }
      >
        {/* Optional overlay gradient for contrast */}
        <div className="absolute inset-0 bg-gradient-to-tr from-black/20 via-transparent to-transparent" />
      </div>
    </div>
  );
}
