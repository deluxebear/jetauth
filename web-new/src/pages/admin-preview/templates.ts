/**
 * Auth UI Template Gallery
 * =========================
 *
 * A template is a bundle of preset visual settings that an admin can apply
 * to an Application in one click. Users are expected to customize further
 * after applying (logo, displayName, etc. are NOT overwritten).
 *
 * To add a new template:
 *   1. Append a new `AuthTemplate` entry to the exported `AUTH_TEMPLATES`
 *      array below. Give it a stable `id` (kebab-case) that will not change.
 *   2. Set `preview` to an inline-SVG mockup (see existing templates for
 *      examples — a ~240x140 SVG is enough).
 *   3. Fill `config` with ONLY the fields the template intends to set.
 *      Fields not listed remain untouched.
 *
 * A template MUST NOT set: `name`, `organization`, `displayName`, `logo`,
 * `favicon`, `signinMethods`, `signupItems`, `signinItems`. These are
 * identity/structural concerns, orthogonal to visual presentation.
 *
 * HTML fields (headerHtml/footerHtml/signinHtml/signupHtml/formSideHtml)
 * run through DOMPurify at render time — stick to safe presentation tags
 * (div/span/p/h1-h6/img) + inline styles + class. No <script>, no event
 * handlers.
 */

export interface AuthTemplate {
  id: string;
  name: string;
  description: string;
  /** Small inline SVG string — rendered as dangerouslySetInnerHTML in the gallery card. */
  preview: string;
  /** Only the fields the template wants to apply. Missing fields are left alone. */
  config: {
    /**
     * Optional layout template id (L2). When set, applying this manifest
     * writes `application.template = <id>` and merges the provided
     * templateOptions into `application.templateOptions`. Legacy
     * CSS-overlay-only manifests leave this field unset — they keep
     * working as presets on top of whatever layout the admin has already
     * picked. See docs/2026-04-19-template-store-proposal.md.
     */
    template?: string;
    /** Template-specific options (hero image, sidebar copy, etc.). */
    templateOptions?: Record<string, unknown>;
    formOffset?: number;
    formBackgroundUrl?: string;
    formBackgroundUrlMobile?: string;
    formSideHtml?: string;
    formCss?: string;
    formCssMobile?: string;
    headerHtml?: string;
    footerHtml?: string;
    signinHtml?: string;
    signupHtml?: string;
    themeData?: Partial<{
      colorPrimary: string;
      colorCTA: string;
      colorSuccess: string;
      colorDanger: string;
      colorWarning: string;
      darkColorPrimary: string;
      darkBackground: string;
      borderRadius: number;
      isCompact: boolean;
      isEnabled: boolean;
      fontFamily: string;
      fontFamilyMono: string;
      spacingScale: number;
      themeType: string;
    }>;
  };
}

// ── SVG preview helpers ────────────────────────────────────────────────────
// Each preview is ~240x140. Kept under ~40 lines each for readability.

const PREVIEW_DEFAULT_CENTERED = `
<svg viewBox="0 0 240 140" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
  <rect width="240" height="140" fill="#F3F4F6"/>
  <rect x="80" y="34" width="80" height="72" rx="8" fill="#FFFFFF" stroke="#E5E7EB"/>
  <rect x="92" y="48" width="56" height="6" rx="3" fill="#111827"/>
  <rect x="92" y="62" width="56" height="8" rx="2" fill="#E5E7EB"/>
  <rect x="92" y="74" width="56" height="8" rx="2" fill="#E5E7EB"/>
  <rect x="92" y="88" width="56" height="10" rx="3" fill="#2563EB"/>
</svg>`.trim();

const PREVIEW_NEON_SPLIT = `
<svg viewBox="0 0 240 140" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
  <defs>
    <radialGradient id="ns-g" cx="30%" cy="40%" r="70%">
      <stop offset="0%" stop-color="#00E599" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#0A0A0A" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="240" height="140" fill="#FFFFFF"/>
  <rect width="144" height="140" fill="#0A0A0A"/>
  <rect width="144" height="140" fill="url(#ns-g)"/>
  <circle cx="30" cy="30" r="1" fill="#00E599" opacity="0.6"/>
  <circle cx="60" cy="50" r="1" fill="#00E599" opacity="0.5"/>
  <circle cx="100" cy="80" r="1" fill="#00E599" opacity="0.4"/>
  <circle cx="40" cy="100" r="1" fill="#00E599" opacity="0.5"/>
  <rect x="16" y="56" width="96" height="5" rx="2" fill="#FFFFFF"/>
  <rect x="16" y="66" width="72" height="5" rx="2" fill="#9CA3AF"/>
  <rect x="164" y="40" width="60" height="6" rx="2" fill="#111827"/>
  <rect x="164" y="54" width="60" height="8" rx="2" fill="#F3F4F6"/>
  <rect x="164" y="66" width="60" height="8" rx="2" fill="#F3F4F6"/>
  <rect x="164" y="82" width="60" height="10" rx="3" fill="#00E599"/>
</svg>`.trim();

const PREVIEW_PRODUCT_SHOWCASE = `
<svg viewBox="0 0 240 140" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
  <rect width="240" height="140" fill="#FFFFFF"/>
  <rect x="96" width="144" height="140" fill="#0A0A0A"/>
  <rect x="16" y="40" width="60" height="6" rx="2" fill="#111827"/>
  <rect x="16" y="54" width="60" height="8" rx="2" fill="#F3F4F6"/>
  <rect x="16" y="66" width="60" height="8" rx="2" fill="#F3F4F6"/>
  <rect x="16" y="82" width="60" height="10" rx="3" fill="#C6FF4D"/>
  <rect x="112" y="34" width="112" height="72" rx="6" fill="#111827" stroke="#1F2937"/>
  <rect x="120" y="42" width="44" height="4" rx="2" fill="#C6FF4D"/>
  <rect x="120" y="52" width="96" height="10" rx="2" fill="#1F2937"/>
  <rect x="120" y="66" width="46" height="32" rx="3" fill="#1F2937"/>
  <rect x="170" y="66" width="46" height="32" rx="3" fill="#1F2937"/>
</svg>`.trim();

const PREVIEW_TESTIMONIAL_ASIDE = `
<svg viewBox="0 0 240 140" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
  <rect width="240" height="140" fill="#FFFFFF"/>
  <rect x="96" width="144" height="140" fill="#0F172A"/>
  <g fill="#14B8A6" opacity="0.4">
    <circle cx="110" cy="20" r="1"/><circle cx="140" cy="40" r="1"/><circle cx="180" cy="30" r="1"/>
    <circle cx="220" cy="60" r="1"/><circle cx="130" cy="90" r="1"/><circle cx="200" cy="110" r="1"/>
  </g>
  <rect x="16" y="46" width="60" height="6" rx="2" fill="#111827"/>
  <rect x="16" y="60" width="60" height="8" rx="2" fill="#F3F4F6"/>
  <rect x="16" y="72" width="60" height="10" rx="3" fill="#14B8A6"/>
  <rect x="110" y="50" width="116" height="50" rx="8" fill="#FFFFFF" fill-opacity="0.08" stroke="#1F2937"/>
  <circle cx="122" cy="64" r="6" fill="#14B8A6"/>
  <rect x="134" y="60" width="40" height="4" rx="2" fill="#FFFFFF"/>
  <rect x="134" y="68" width="60" height="3" rx="1" fill="#94A3B8"/>
  <rect x="118" y="80" width="100" height="3" rx="1" fill="#E5E7EB"/>
  <rect x="118" y="86" width="80" height="3" rx="1" fill="#E5E7EB"/>
</svg>`.trim();

const PREVIEW_PRODUCT_SPLIT = `
<svg viewBox="0 0 240 140" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
  <rect width="240" height="140" fill="#FFFFFF"/>
  <rect x="96" width="144" height="140" fill="#E0EAFC"/>
  <rect x="16" y="40" width="60" height="6" rx="2" fill="#111827"/>
  <rect x="16" y="54" width="60" height="8" rx="2" fill="#F3F4F6"/>
  <rect x="16" y="66" width="60" height="8" rx="2" fill="#F3F4F6"/>
  <rect x="16" y="82" width="60" height="10" rx="3" fill="#ECFF36"/>
  <rect x="110" y="30" width="116" height="50" rx="8" fill="#FFFFFF" stroke="#C7D2FE"/>
  <rect x="118" y="38" width="60" height="6" rx="2" fill="#111827"/>
  <rect x="118" y="48" width="100" height="3" rx="1" fill="#94A3B8"/>
  <rect x="118" y="56" width="100" height="3" rx="1" fill="#94A3B8"/>
  <rect x="118" y="64" width="40" height="8" rx="2" fill="#111827"/>
  <text x="168" y="112" font-family="sans-serif" font-size="18" font-weight="700" fill="#111827">800k+</text>
</svg>`.trim();

const PREVIEW_CENTERED_ILLUSTRATED = `
<svg viewBox="0 0 240 140" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
  <defs>
    <radialGradient id="ci-l" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#0052CC" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#0052CC" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="ci-r" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#6554C0" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#6554C0" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="240" height="140" fill="#F4F5F7"/>
  <circle cx="20" cy="120" r="70" fill="url(#ci-l)"/>
  <circle cx="220" cy="20" r="70" fill="url(#ci-r)"/>
  <rect x="80" y="34" width="80" height="72" rx="6" fill="#FFFFFF" stroke="#DFE1E6"/>
  <rect x="92" y="48" width="56" height="6" rx="3" fill="#172B4D"/>
  <rect x="92" y="62" width="56" height="8" rx="2" fill="#DFE1E6"/>
  <rect x="92" y="74" width="56" height="8" rx="2" fill="#DFE1E6"/>
  <rect x="92" y="88" width="56" height="10" rx="3" fill="#0052CC"/>
</svg>`.trim();

// ── Layout-template manifests (store v1) ──────────────────────────────────
// These opt into the L2 layout system via config.template/templateOptions
// and overlay L1 tokens on top. Previews match the corresponding outer
// layouts (split-hero / full-bleed / sidebar-brand).

const PREVIEW_PRISM_SPLIT = `
<svg viewBox="0 0 240 140" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="prism-g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#9333EA"/>
      <stop offset="100%" stop-color="#EC4899"/>
    </linearGradient>
  </defs>
  <rect width="240" height="140" fill="#FFFFFF"/>
  <rect width="108" height="140" fill="url(#prism-g)"/>
  <rect x="12" y="88" width="78" height="5" rx="2" fill="#FFFFFF" opacity="0.95"/>
  <rect x="12" y="100" width="60" height="3" rx="1.5" fill="#FFFFFF" opacity="0.75"/>
  <rect x="12" y="108" width="68" height="3" rx="1.5" fill="#FFFFFF" opacity="0.75"/>
  <rect x="124" y="38" width="96" height="66" rx="8" fill="#FFFFFF" stroke="#E5E7EB"/>
  <circle cx="148" cy="54" r="4" fill="#9333EA"/>
  <rect x="158" y="52" width="30" height="3" rx="1.5" fill="#111827"/>
  <rect x="134" y="68" width="72" height="8" rx="2" fill="#F3F4F6"/>
  <rect x="134" y="80" width="72" height="8" rx="2" fill="#F3F4F6"/>
  <rect x="134" y="93" width="72" height="8" rx="2" fill="#9333EA"/>
</svg>`.trim();

const PREVIEW_AURORA_GLASS = `
<svg viewBox="0 0 240 140" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="aurora-g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0EA5E9"/>
      <stop offset="50%" stop-color="#8B5CF6"/>
      <stop offset="100%" stop-color="#EC4899"/>
    </linearGradient>
  </defs>
  <rect width="240" height="140" fill="url(#aurora-g)"/>
  <rect width="240" height="140" fill="rgba(0,0,0,0.2)"/>
  <rect x="72" y="20" width="96" height="104" rx="10" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.35)"/>
  <circle cx="120" cy="42" r="5" fill="#FFFFFF" opacity="0.9"/>
  <rect x="104" y="54" width="32" height="3" rx="1.5" fill="#FFFFFF" opacity="0.85"/>
  <rect x="88" y="70" width="64" height="8" rx="2" fill="rgba(255,255,255,0.25)" stroke="rgba(255,255,255,0.4)"/>
  <rect x="88" y="82" width="64" height="8" rx="2" fill="rgba(255,255,255,0.25)" stroke="rgba(255,255,255,0.4)"/>
  <rect x="88" y="98" width="64" height="10" rx="2" fill="#FFFFFF" opacity="0.95"/>
</svg>`.trim();

const PREVIEW_ATRIUM_SIDEBAR = `
<svg viewBox="0 0 240 140" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
  <rect width="240" height="140" fill="#F8FAFC"/>
  <rect width="72" height="140" fill="#1E293B"/>
  <circle cx="16" cy="18" r="5" fill="#F59E0B"/>
  <rect x="26" y="15" width="30" height="5" rx="2" fill="#F59E0B"/>
  <rect x="12" y="46" width="48" height="3" rx="1.5" fill="#94A3B8"/>
  <rect x="12" y="56" width="52" height="3" rx="1.5" fill="#94A3B8"/>
  <rect x="12" y="66" width="40" height="3" rx="1.5" fill="#94A3B8"/>
  <rect x="12" y="124" width="40" height="3" rx="1.5" fill="#475569"/>
  <rect x="112" y="38" width="96" height="66" rx="8" fill="#FFFFFF" stroke="#E2E8F0"/>
  <circle cx="140" cy="54" r="4" fill="#F59E0B"/>
  <rect x="148" y="52" width="32" height="3" rx="1.5" fill="#111827"/>
  <rect x="124" y="68" width="72" height="8" rx="2" fill="#F1F5F9"/>
  <rect x="124" y="80" width="72" height="8" rx="2" fill="#F1F5F9"/>
  <rect x="124" y="93" width="72" height="8" rx="2" fill="#F59E0B"/>
</svg>`.trim();

// ── HTML bundles ──────────────────────────────────────────────────────────

const NEON_SPLIT_SIDE_HTML = `
<div style="min-height:100vh;display:flex;flex-direction:column;justify-content:center;padding:48px;background:
  radial-gradient(circle at 30% 20%, rgba(0,229,153,0.18), transparent 55%),
  radial-gradient(circle at 80% 70%, rgba(0,229,153,0.08), transparent 45%),
  #0A0A0A;color:#FFFFFF;">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:24px;">
    <div style="width:10px;height:10px;border-radius:50%;background:#00E599;"></div>
    <span style="font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#9CA3AF;">Welcome back</span>
  </div>
  <h1 style="font-size:36px;line-height:1.15;font-weight:700;margin:0 0 16px 0;color:#FFFFFF;">
    Build on <span style="color:#00E599;">{{displayName}}</span><br/>without slowing down.
  </h1>
  <p style="font-size:15px;line-height:1.6;color:#9CA3AF;margin:0;max-width:360px;">
    Ship faster with a signed-in experience that just works. Your users will love it, your team will love it more.
  </p>
</div>`.trim();

const NEON_SPLIT_FORM_CSS = `
/* Neon Split — accent button pulse */
.auth-submit, button[type="submit"] {
  box-shadow: 0 0 0 0 rgba(0, 229, 153, 0.5);
  animation: neon-split-pulse 2.4s ease-out infinite;
}
@keyframes neon-split-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(0,229,153,0.45); }
  70%  { box-shadow: 0 0 0 10px rgba(0,229,153,0); }
  100% { box-shadow: 0 0 0 0 rgba(0,229,153,0); }
}
`.trim();

const PRODUCT_SHOWCASE_SIDE_HTML = `
<div style="min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:48px;background:#0A0A0A;color:#FFFFFF;">
  <div style="max-width:460px;text-align:center;margin-bottom:32px;">
    <div style="display:inline-block;padding:4px 10px;border-radius:999px;background:rgba(198,255,77,0.15);color:#C6FF4D;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:16px;">New</div>
    <h1 style="font-size:32px;line-height:1.2;font-weight:700;margin:0 0 12px 0;">Everything you need, nothing you don't.</h1>
    <p style="font-size:14px;line-height:1.6;color:#9CA3AF;margin:0;">Sign in to {{displayName}} and jump back into your workflow.</p>
  </div>
  <div style="width:100%;max-width:420px;background:#111827;border:1px solid #1F2937;border-radius:12px;padding:16px;">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:12px;">
      <div style="width:8px;height:8px;border-radius:50%;background:#EF4444;"></div>
      <div style="width:8px;height:8px;border-radius:50%;background:#F59E0B;"></div>
      <div style="width:8px;height:8px;border-radius:50%;background:#22C55E;"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      <div style="background:#1F2937;border-radius:6px;padding:14px;">
        <div style="width:40%;height:6px;background:#C6FF4D;border-radius:3px;margin-bottom:8px;"></div>
        <div style="width:100%;height:4px;background:#374151;border-radius:2px;margin-bottom:4px;"></div>
        <div style="width:70%;height:4px;background:#374151;border-radius:2px;"></div>
      </div>
      <div style="background:#1F2937;border-radius:6px;padding:14px;">
        <div style="width:40%;height:6px;background:#C6FF4D;border-radius:3px;margin-bottom:8px;"></div>
        <div style="width:100%;height:4px;background:#374151;border-radius:2px;margin-bottom:4px;"></div>
        <div style="width:60%;height:4px;background:#374151;border-radius:2px;"></div>
      </div>
    </div>
  </div>
</div>`.trim();

const TESTIMONIAL_ASIDE_SIDE_HTML = `
<div style="min-height:100vh;display:flex;flex-direction:column;justify-content:center;padding:56px;background:
  radial-gradient(circle at 20% 20%, rgba(20,184,166,0.15), transparent 55%),
  #0F172A;color:#FFFFFF;background-size:auto, 16px 16px;">
  <div style="max-width:440px;width:100%;margin:0 auto;">
    <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:28px;backdrop-filter:blur(8px);">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
        <div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#14B8A6,#0EA5E9);display:flex;align-items:center;justify-content:center;font-weight:700;color:#FFFFFF;">A</div>
        <div>
          <div style="font-size:14px;font-weight:600;color:#FFFFFF;">Ada Founder</div>
          <div style="font-size:12px;color:#94A3B8;">Founder at Acme</div>
        </div>
      </div>
      <p style="font-size:17px;line-height:1.55;color:#E2E8F0;margin:0;">
        "Building on {{displayName}} felt effortless — shipping in days, not weeks."
      </p>
    </div>
    <div style="margin-top:28px;display:flex;gap:20px;align-items:center;color:#64748B;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;">
      <span>Trusted by</span>
      <span style="font-weight:600;color:#CBD5E1;">Acme</span>
      <span style="font-weight:600;color:#CBD5E1;">Globex</span>
      <span style="font-weight:600;color:#CBD5E1;">Initech</span>
    </div>
  </div>
</div>`.trim();

const PRODUCT_SPLIT_SIDE_HTML = `
<div style="min-height:100vh;display:flex;flex-direction:column;justify-content:center;padding:48px;background:linear-gradient(160deg,#E0EAFC 0%,#CFDEF3 100%);color:#0F172A;">
  <div style="max-width:440px;width:100%;margin:0 auto;">
    <div style="background:#FFFFFF;border-radius:16px;padding:20px;box-shadow:0 12px 32px rgba(15,23,42,0.08);">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
        <div style="width:32px;height:32px;border-radius:8px;background:#ECFF36;"></div>
        <div style="font-size:14px;font-weight:600;">Feature spotlight</div>
      </div>
      <div style="font-size:13px;line-height:1.55;color:#475569;">
        Sign in once and manage every workspace, team, and deployment from a single pane of glass.
      </div>
      <div style="margin-top:14px;display:flex;gap:6px;">
        <div style="flex:1;height:6px;border-radius:3px;background:#ECFF36;"></div>
        <div style="flex:1;height:6px;border-radius:3px;background:#CBD5E1;"></div>
        <div style="flex:1;height:6px;border-radius:3px;background:#CBD5E1;"></div>
      </div>
    </div>
    <div style="margin-top:32px;">
      <div style="font-size:48px;line-height:1;font-weight:800;color:#0F172A;letter-spacing:-0.02em;">800,000+</div>
      <div style="margin-top:8px;font-size:14px;color:#475569;">teams already building with {{displayName}}.</div>
    </div>
  </div>
</div>`.trim();

const CENTERED_ILLUSTRATED_HEADER_HTML = `
<div style="position:absolute;inset:0;pointer-events:none;z-index:0;overflow:hidden;">
  <div style="position:absolute;top:-120px;left:-120px;width:360px;height:360px;border-radius:50%;background:radial-gradient(circle,rgba(0,82,204,0.22),transparent 65%);"></div>
  <div style="position:absolute;bottom:-140px;right:-140px;width:420px;height:420px;border-radius:50%;background:radial-gradient(circle,rgba(101,84,192,0.22),transparent 65%);"></div>
  <div style="position:absolute;top:30%;right:6%;width:80px;height:80px;border-radius:24px;background:rgba(0,82,204,0.08);transform:rotate(18deg);"></div>
  <div style="position:absolute;bottom:20%;left:6%;width:60px;height:60px;border-radius:16px;background:rgba(101,84,192,0.08);transform:rotate(-14deg);"></div>
</div>`.trim();

// ── The gallery ────────────────────────────────────────────────────────────

export const AUTH_TEMPLATES: AuthTemplate[] = [
  // ── Store v1: layout-template manifests ─────────────────────────────────
  // These opt into the L2 layout system (config.template + templateOptions).
  // Applying writes app.template directly so the login page renders the
  // matching outer layout — Split Hero, Full-bleed, Sidebar Brand.
  {
    id: "prism-split",
    name: "Prism split",
    description:
      "Vibrant purple→pink hero panel on the left, form on the right. Creative-tool vibe.",
    preview: PREVIEW_PRISM_SPLIT,
    config: {
      template: "split-hero",
      templateOptions: {
        heroImageUrl: "",
        heroImageUrlDark: "",
        heroHeadline: {
          en: "Build something brilliant",
          zh: "让创意落地成真",
        },
        heroSubcopy: {
          en: "Sign in to continue where you left off.",
          zh: "登录继续未完成的工作。",
        },
        heroSide: "left",
        overlayOpacity: 0.3,
      },
      themeData: {
        colorPrimary: "#9333EA",
        darkColorPrimary: "#A855F7",
        borderRadius: 10,
        themeType: "light",
      },
    },
  },
  {
    id: "aurora-glass",
    name: "Aurora glass",
    description:
      "Full-bleed aurora gradient behind a glass form card. High drama for consumer brands.",
    preview: PREVIEW_AURORA_GLASS,
    config: {
      template: "full-bleed",
      templateOptions: {
        backgroundImageUrl: "",
        backgroundImageUrlDark: "",
        overlayOpacity: 0.2,
        glassBlur: 20,
        cardStyle: "glass",
        formPosition: "center",
      },
      themeData: {
        colorPrimary: "#8B5CF6",
        darkColorPrimary: "#A78BFA",
        borderRadius: 14,
        themeType: "light",
      },
    },
  },
  {
    id: "atrium-enterprise",
    name: "Atrium enterprise",
    description:
      "Left rail with feature list + warm amber accent. Enterprise portal with a human touch.",
    preview: PREVIEW_ATRIUM_SIDEBAR,
    config: {
      template: "sidebar-brand",
      templateOptions: {
        sidebarWidth: "standard",
        sidebarBackground: "surface",
        sidebarFeatureList: [
          "Single sign-on across every workspace",
          "Audit logs retained for 90 days",
          "Team roles with fine-grained access",
        ],
        sidebarFooterText: { en: "© Your team · 2026", zh: "© 你的团队 · 2026" },
      },
      themeData: {
        colorPrimary: "#F59E0B",
        darkColorPrimary: "#FBBF24",
        borderRadius: 8,
        themeType: "light",
      },
    },
  },

  // ── Legacy CSS-overlay presets ──────────────────────────────────────────
  // Pre-dates the L2 layout template system. These apply theme tokens +
  // side-panel HTML + custom CSS on top of whatever layout the admin
  // already picked. Kept because a good number of apps were built on them
  // and the visual intent still works.
  {
    id: "default-centered",
    name: "Default centered",
    description: "Clean, centered login card on a neutral background. A safe baseline for any product.",
    preview: PREVIEW_DEFAULT_CENTERED,
    config: {
      formOffset: 2,
      formBackgroundUrl: "",
      formBackgroundUrlMobile: "",
      formSideHtml: "",
      formCss: "",
      formCssMobile: "",
      headerHtml: "",
      footerHtml: "",
      themeData: {
        colorPrimary: "#2563EB",
        borderRadius: 8,
        fontFamily: "inherit",
        themeType: "light",
      },
    },
  },
  {
    id: "neon-split",
    name: "Neon split",
    description: "Dark hero panel with a pulsing neon accent. Pairs well with developer-tool vibes.",
    preview: PREVIEW_NEON_SPLIT,
    config: {
      formOffset: 4,
      formSideHtml: NEON_SPLIT_SIDE_HTML,
      formCss: NEON_SPLIT_FORM_CSS,
      themeData: {
        colorPrimary: "#00E599",
        darkBackground: "#0A0A0A",
        borderRadius: 10,
        themeType: "dark",
      },
    },
  },
  {
    id: "product-showcase",
    name: "Product showcase",
    description: "Mock product UI on a bold dark panel — great for showing off what users are signing into.",
    preview: PREVIEW_PRODUCT_SHOWCASE,
    config: {
      formOffset: 4,
      formSideHtml: PRODUCT_SHOWCASE_SIDE_HTML,
      themeData: {
        colorPrimary: "#C6FF4D",
        borderRadius: 14,
        fontFamily: "'Inter', sans-serif",
        themeType: "light",
      },
    },
  },
  {
    id: "testimonial-aside",
    name: "Testimonial aside",
    description: "Glassy testimonial card on a dotted dark canvas. Social proof built in.",
    preview: PREVIEW_TESTIMONIAL_ASIDE,
    config: {
      formOffset: 4,
      formSideHtml: TESTIMONIAL_ASIDE_SIDE_HTML,
      themeData: {
        colorPrimary: "#14B8A6",
        borderRadius: 12,
        themeType: "dark",
      },
    },
  },
  {
    id: "product-split",
    name: "Product split",
    description: "Bright, airy feature panel with a prominent stat — Apollo-style balanced split.",
    preview: PREVIEW_PRODUCT_SPLIT,
    config: {
      formOffset: 4,
      formSideHtml: PRODUCT_SPLIT_SIDE_HTML,
      headerHtml: "",
      themeData: {
        colorPrimary: "#ECFF36",
        borderRadius: 8,
        themeType: "light",
      },
    },
  },
  {
    id: "centered-illustrated",
    name: "Centered illustrated",
    description: "Centered card softly framed by gradient blobs — Atlassian-style friendliness.",
    preview: PREVIEW_CENTERED_ILLUSTRATED,
    config: {
      formOffset: 2,
      headerHtml: CENTERED_ILLUSTRATED_HEADER_HTML,
      themeData: {
        colorPrimary: "#0052CC",
        borderRadius: 6,
        themeType: "light",
      },
    },
  },
];
