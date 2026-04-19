// web-new/src/auth/templates/full-bleed/index.tsx
//
// T03 "Full-bleed Background" — background image fills the viewport, form
// floats over it in a (default) glass card. Great for consumer / brand-led
// products where the image does heavy lifting.
//
// Readability note: glass over a photograph can bite. Admins who hit a
// contrast problem can flip cardStyle to "solid" — the card then becomes
// opaque surface-1, which lets normal theme text stay readable regardless
// of what's behind.

/* eslint-disable react-refresh/only-export-components */

import type { TemplateMeta, TemplateProps } from "../types";

export const meta: TemplateMeta = {
  id: "full-bleed",
  name: { en: "Full-bleed Background", zh: "全屏背景" },
  description: {
    en: "Background image fills the viewport; form floats in a glass card.",
    zh: "背景图铺满视口，表单浮在玻璃卡片内。适合消费级 / 品牌驱动产品。",
  },
  preview: "/templates/full-bleed.svg",
  category: "consumer",
  defaultOptions: {
    backgroundImageUrl: "",
    backgroundImageUrlDark: "",
    overlayOpacity: 0.4,
    glassBlur: 16,
    cardStyle: "glass",
    formPosition: "center",
  },
};

export default function FullBleedTemplate({ slots, options, theme }: TemplateProps) {
  const imageUrl = typeof options.backgroundImageUrl === "string" ? options.backgroundImageUrl : "";
  const imageUrlDark = typeof options.backgroundImageUrlDark === "string" ? options.backgroundImageUrlDark : "";
  const resolvedImage = theme === "dark" && imageUrlDark.length > 0 ? imageUrlDark : imageUrl;
  const hasImage = resolvedImage.length > 0;
  const overlayOpacity =
    typeof options.overlayOpacity === "number"
      ? Math.max(0, Math.min(1, options.overlayOpacity))
      : 0.4;
  const glassBlur =
    typeof options.glassBlur === "number" ? Math.max(0, Math.min(40, options.glassBlur)) : 16;
  const cardStyle = options.cardStyle === "solid" ? "solid" : "glass";
  const formPosition =
    options.formPosition === "top-center"
      ? "top-center"
      : options.formPosition === "bottom-center"
      ? "bottom-center"
      : "center";

  const positionClass =
    formPosition === "top-center"
      ? "items-start pt-20"
      : formPosition === "bottom-center"
      ? "items-end pb-20"
      : "items-center";

  const cardBase = "w-full max-w-sm rounded-2xl p-8 lg:p-10 border";
  const cardClass =
    cardStyle === "glass"
      ? `${cardBase} bg-white/15 dark:bg-black/30 border-white/20 dark:border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.2)]`
      : `${cardBase} bg-surface-1 border-border shadow-[var(--shadow-elevated)]`;

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div
        className="absolute inset-0 bg-gradient-to-br from-accent/40 via-accent/10 to-surface-2"
        aria-hidden="true"
      />
      {hasImage && (
        <img
          src={resolvedImage}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
      {hasImage && (
        <div
          className="absolute inset-0 bg-black"
          style={{ opacity: overlayOpacity }}
          aria-hidden="true"
        />
      )}

      <div className="relative z-20">{slots.topBar}</div>

      <div className={`relative z-10 min-h-screen flex justify-center px-6 py-12 ${positionClass}`}>
        <div
          className={cardClass}
          style={
            cardStyle === "glass"
              ? {
                  backdropFilter: `blur(${glassBlur}px)`,
                  WebkitBackdropFilter: `blur(${glassBlur}px)`,
                }
              : undefined
          }
        >
          {slots.branding !== undefined && <div className="mb-8">{slots.branding}</div>}
          {slots.content}
          {slots.htmlInjection}
        </div>
      </div>
    </div>
  );
}
