import SafeHtml from "./SafeHtml";

interface SideHtmlProps {
  html?: string;
  className?: string;
}

/**
 * Renders admin-supplied HTML on the public auth pages (`formSideHtml` and
 * custom signin text items). Delegates to SafeHtml so it shares the
 * DOMPurify allow-list mirrored from the backend bluemonday policy — a
 * regex scrub is not enough here because the content reaches anonymous
 * visitors (unquoted handlers, <svg onload>, entity-encoded javascript:
 * URLs all slip through pattern matching).
 */
export default function SideHtml({ html, className }: SideHtmlProps) {
  return <SafeHtml html={html ?? ""} className={className ?? ""} />;
}
