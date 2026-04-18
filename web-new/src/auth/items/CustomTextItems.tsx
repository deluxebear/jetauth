import type { SigninItem } from "../api/types";
import SideHtml from "../shell/SideHtml";

interface Props {
  items: SigninItem[];
  className?: string;
}

/**
 * Renders the signinItems that have isCustom=true. Each item's `label` is
 * treated as sanitized HTML (same minimal scrub as SideHtml). Admin-provided
 * text blocks — promos, legal notices, maintenance banners, etc.
 */
export default function CustomTextItems({ items, className }: Props) {
  if (!items || items.length === 0) return null;
  return (
    <div className={className ?? "mt-4 space-y-2 text-[12px] text-text-muted"}>
      {items.map((it, idx) => (
        <SideHtml key={`${it.name}-${idx}`} html={it.label ?? ""} />
      ))}
    </div>
  );
}
