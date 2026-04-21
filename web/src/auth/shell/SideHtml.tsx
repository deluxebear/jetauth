interface SideHtmlProps {
  html?: string;
  className?: string;
}

/**
 * Renders user-supplied HTML (from `formSideHtml`) in a sanitized container.
 *
 * TODO(W5): replace the regex scrub with DOMPurify. This minimal filter
 * strips the obviously dangerous tags to keep W3 layouts unblocked; it is
 * NOT a security boundary.
 */
function scrubHtml(raw: string): string {
  return raw
    // Remove <script> ... </script> blocks (case-insensitive, lazy)
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    // Remove <iframe> and <object> (and their closing tags)
    .replace(/<\/?iframe[^>]*>/gi, "")
    .replace(/<\/?object[^>]*>/gi, "")
    .replace(/<\/?embed[^>]*>/gi, "")
    // Strip on* event handler attributes (onclick, onload, etc.)
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    // Strip javascript: URLs
    .replace(/javascript:/gi, "");
}

export default function SideHtml({ html, className }: SideHtmlProps) {
  if (!html) return null;
  const safe = scrubHtml(html);
  return (
    <div
      className={className ?? ""}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
