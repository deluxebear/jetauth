// web-new/src/auth/templates/split-hero/index.tsx
//
// T02 "Split Hero" — marketing panel beside the form. On lg+ screens the
// hero panel occupies roughly half the viewport; below lg it hides so the
// form takes full width (falls back to a Centered-like layout on mobile).

/* eslint-disable react-refresh/only-export-components */

import type { TemplateMeta, TemplateProps } from "../types";

export const meta: TemplateMeta = {
  id: "split-hero",
  name: { en: "Split Hero", zh: "左图右表单" },
  description: {
    en: "Marketing panel beside the form. Strong for brand-led B2B flows.",
    zh: "左侧品牌/营销面板，右侧表单。适合营销驱动的 B2B 场景。",
  },
  preview: "/templates/split-hero.svg",
  category: "saas",
  defaultOptions: {
    heroImageUrl: "",
    heroImageUrlDark: "",
    heroHeadline: "",
    heroSubcopy: "",
    heroSide: "left",
    overlayOpacity: 0.35,
  },
};

interface HeroPanelProps {
  imageUrl: string;
  imageUrlDark: string;
  theme: "light" | "dark";
  headline: string;
  subcopy: string;
  overlayOpacity: number;
}

function HeroPanel({
  imageUrl,
  imageUrlDark,
  theme,
  headline,
  subcopy,
  overlayOpacity,
}: HeroPanelProps) {
  const resolvedImage =
    theme === "dark" && imageUrlDark.length > 0 ? imageUrlDark : imageUrl;
  const hasImage = resolvedImage.length > 0;
  const hasCopy = headline.length > 0 || subcopy.length > 0;

  return (
    <div className="hidden lg:flex flex-1 relative overflow-hidden bg-gradient-to-br from-accent/30 via-accent/10 to-surface-2">
      {hasImage && (
        <>
          <img
            src={resolvedImage}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div
            className="absolute inset-0 bg-black"
            style={{ opacity: overlayOpacity }}
            aria-hidden="true"
          />
        </>
      )}
      {hasCopy && (
        <div
          className={`relative z-10 flex flex-col justify-end p-12 max-w-xl ${
            hasImage ? "text-white" : "text-text-primary"
          }`}
        >
          {headline && (
            <h2 className="text-[28px] xl:text-[34px] font-bold leading-tight mb-3 tracking-tight">
              {headline}
            </h2>
          )}
          {subcopy && (
            <p
              className={`text-[15px] leading-relaxed ${
                hasImage ? "opacity-90" : "text-text-muted"
              }`}
            >
              {subcopy}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function SplitHeroTemplate({
  slots,
  options,
  theme,
}: TemplateProps) {
  const imageUrl = typeof options.heroImageUrl === "string" ? options.heroImageUrl : "";
  const imageUrlDark =
    typeof options.heroImageUrlDark === "string" ? options.heroImageUrlDark : "";
  const headline = typeof options.heroHeadline === "string" ? options.heroHeadline : "";
  const subcopy = typeof options.heroSubcopy === "string" ? options.heroSubcopy : "";
  const heroSide: "left" | "right" =
    options.heroSide === "right" ? "right" : "left";
  const overlayOpacity =
    typeof options.overlayOpacity === "number"
      ? Math.max(0, Math.min(1, options.overlayOpacity))
      : 0.35;

  const heroPanel = (
    <HeroPanel
      imageUrl={imageUrl}
      imageUrlDark={imageUrlDark}
      theme={theme}
      headline={headline}
      subcopy={subcopy}
      overlayOpacity={overlayOpacity}
    />
  );

  return (
    <div className="min-h-screen flex relative">
      {slots.topBar}
      {heroSide === "left" && heroPanel}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm">
          {slots.branding !== undefined && (
            <div className="mb-10">{slots.branding}</div>
          )}
          {slots.content}
          {slots.htmlInjection}
        </div>
      </div>
      {heroSide === "right" && heroPanel}
    </div>
  );
}
