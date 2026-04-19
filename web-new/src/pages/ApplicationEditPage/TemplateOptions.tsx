// web-new/src/pages/ApplicationEditPage/TemplateOptions.tsx
//
// Per-template options editor. ApplicationEditPage mounts this below the
// template picker; it decides which sub-form to render based on the
// selected template id. Keeps the main edit page from ballooning.

import { FormField, inputClass } from "../../components/FormSection";
import SimpleSelect from "../../components/SimpleSelect";
import { useTranslation } from "../../i18n";

interface Props {
  templateId: string;
  options: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

type TFn = (k: string) => string;

export default function TemplateOptions({ templateId, options, onChange }: Props) {
  const { t } = useTranslation();
  // The i18n keys in this file all live under apps.template.*; the `as any`
  // cast matches the broader convention in this codebase (i18n map is keyed
  // by string, not a statically typed union).
  const tt: TFn = (k) => t(k as never);

  if (templateId === "split-hero") {
    return <SplitHeroOptions options={options} onChange={onChange} t={tt} />;
  }
  if (templateId === "full-bleed") {
    return <FullBleedOptions options={options} onChange={onChange} t={tt} />;
  }
  if (templateId === "sidebar-brand") {
    return <SidebarBrandOptions options={options} onChange={onChange} t={tt} />;
  }
  // centered-card, minimal-inline — no options
  return null;
}

function UrlFieldWithThumb({
  label,
  value,
  onChange,
  urlPlaceholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  urlPlaceholder: string;
}) {
  return (
    <FormField label={label}>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={urlPlaceholder}
          className={`${inputClass} flex-1`}
        />
        {value.length > 0 ? (
          <img
            src={value}
            alt=""
            className="h-10 w-10 rounded-lg border border-border object-cover bg-surface-2"
          />
        ) : null}
      </div>
    </FormField>
  );
}

function PercentSlider({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.05,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <FormField label={label}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
      <div className="text-[11px] text-text-muted mt-1">
        {max <= 1 ? `${Math.round(value * 100)}%` : `${Math.round(value)}`}
      </div>
    </FormField>
  );
}

// ── Split Hero ─────────────────────────────────────────────────────────────

function SplitHeroOptions({
  options,
  onChange,
  t,
}: {
  options: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  t: TFn;
}) {
  return (
    <div className="mt-5 pt-5 border-t border-border grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
      <UrlFieldWithThumb
        label={t("apps.template.splitHero.image")}
        value={String(options.heroImageUrl ?? "")}
        onChange={(v) => onChange("heroImageUrl", v)}
        urlPlaceholder={t("help.placeholder.url")}
      />
      <UrlFieldWithThumb
        label={t("apps.template.splitHero.imageDark")}
        value={String(options.heroImageUrlDark ?? "")}
        onChange={(v) => onChange("heroImageUrlDark", v)}
        urlPlaceholder={t("help.placeholder.url")}
      />
      <FormField label={t("apps.template.splitHero.headline")} span="full">
        <input
          type="text"
          value={String(options.heroHeadline ?? "")}
          onChange={(e) => onChange("heroHeadline", e.target.value)}
          className={inputClass}
        />
      </FormField>
      <FormField label={t("apps.template.splitHero.subcopy")} span="full">
        <textarea
          rows={2}
          value={String(options.heroSubcopy ?? "")}
          onChange={(e) => onChange("heroSubcopy", e.target.value)}
          className={`${inputClass} resize-y`}
        />
      </FormField>
      <FormField label={t("apps.template.splitHero.side")}>
        <SimpleSelect
          value={String(options.heroSide ?? "left")}
          options={[
            { value: "left", label: t("apps.template.splitHero.sideLeft") },
            { value: "right", label: t("apps.template.splitHero.sideRight") },
          ]}
          onChange={(v) => onChange("heroSide", v)}
        />
      </FormField>
      <PercentSlider
        label={t("apps.template.splitHero.overlay")}
        value={typeof options.overlayOpacity === "number" ? options.overlayOpacity : 0.35}
        onChange={(v) => onChange("overlayOpacity", v)}
      />
    </div>
  );
}

// ── Full-bleed ─────────────────────────────────────────────────────────────

function FullBleedOptions({
  options,
  onChange,
  t,
}: {
  options: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  t: TFn;
}) {
  return (
    <div className="mt-5 pt-5 border-t border-border grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
      <UrlFieldWithThumb
        label={t("apps.template.fullBleed.image")}
        value={String(options.backgroundImageUrl ?? "")}
        onChange={(v) => onChange("backgroundImageUrl", v)}
        urlPlaceholder={t("help.placeholder.url")}
      />
      <UrlFieldWithThumb
        label={t("apps.template.fullBleed.imageDark")}
        value={String(options.backgroundImageUrlDark ?? "")}
        onChange={(v) => onChange("backgroundImageUrlDark", v)}
        urlPlaceholder={t("help.placeholder.url")}
      />
      <PercentSlider
        label={t("apps.template.fullBleed.overlay")}
        value={typeof options.overlayOpacity === "number" ? options.overlayOpacity : 0.4}
        onChange={(v) => onChange("overlayOpacity", v)}
      />
      <PercentSlider
        label={t("apps.template.fullBleed.blur")}
        value={typeof options.glassBlur === "number" ? options.glassBlur : 16}
        onChange={(v) => onChange("glassBlur", v)}
        min={0}
        max={40}
        step={1}
      />
      <FormField label={t("apps.template.fullBleed.cardStyle")}>
        <SimpleSelect
          value={String(options.cardStyle ?? "glass")}
          options={[
            { value: "glass", label: t("apps.template.fullBleed.cardGlass") },
            { value: "solid", label: t("apps.template.fullBleed.cardSolid") },
          ]}
          onChange={(v) => onChange("cardStyle", v)}
        />
      </FormField>
      <FormField label={t("apps.template.fullBleed.position")}>
        <SimpleSelect
          value={String(options.formPosition ?? "center")}
          options={[
            { value: "top-center", label: t("apps.template.fullBleed.positionTop") },
            { value: "center", label: t("apps.template.fullBleed.positionCenter") },
            { value: "bottom-center", label: t("apps.template.fullBleed.positionBottom") },
          ]}
          onChange={(v) => onChange("formPosition", v)}
        />
      </FormField>
    </div>
  );
}

// ── Sidebar Brand ──────────────────────────────────────────────────────────

function SidebarBrandOptions({
  options,
  onChange,
  t,
}: {
  options: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  t: TFn;
}) {
  const featureLines = Array.isArray(options.sidebarFeatureList)
    ? options.sidebarFeatureList
        .filter((f): f is string => typeof f === "string")
        .join("\n")
    : "";

  return (
    <div className="mt-5 pt-5 border-t border-border grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
      <FormField label={t("apps.template.sidebar.width")}>
        <SimpleSelect
          value={String(options.sidebarWidth ?? "standard")}
          options={[
            { value: "narrow", label: t("apps.template.sidebar.widthNarrow") },
            { value: "standard", label: t("apps.template.sidebar.widthStandard") },
            { value: "wide", label: t("apps.template.sidebar.widthWide") },
          ]}
          onChange={(v) => onChange("sidebarWidth", v)}
        />
      </FormField>
      <FormField label={t("apps.template.sidebar.background")}>
        <SimpleSelect
          value={String(options.sidebarBackground ?? "surface")}
          options={[
            { value: "surface", label: t("apps.template.sidebar.bgSurface") },
            { value: "accent", label: t("apps.template.sidebar.bgAccent") },
            { value: "gradient", label: t("apps.template.sidebar.bgGradient") },
          ]}
          onChange={(v) => onChange("sidebarBackground", v)}
        />
      </FormField>
      <FormField label={t("apps.template.sidebar.features")} span="full">
        <textarea
          rows={4}
          value={featureLines}
          onChange={(e) =>
            onChange(
              "sidebarFeatureList",
              e.target.value.split("\n").map((s) => s.trim()).filter((s) => s.length > 0),
            )
          }
          className={`${inputClass} resize-y`}
        />
      </FormField>
      <FormField label={t("apps.template.sidebar.footer")} span="full">
        <input
          type="text"
          value={String(options.sidebarFooterText ?? "")}
          onChange={(e) => onChange("sidebarFooterText", e.target.value)}
          className={inputClass}
        />
      </FormField>
    </div>
  );
}
