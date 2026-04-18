import DOMPurify, { type Config } from "dompurify";

interface SafeHtmlProps {
  html: string;
  className?: string;
}

// Allow-list kept in sync with the backend bluemonday policy in
// object/html_sanitize.go. Presentational tags + inline styles are
// allowed; scripts, iframes, forms, and event handlers are stripped.
const SANITIZE_CONFIG: Config = {
  ALLOWED_TAGS: [
    "a", "b", "br", "button", "div", "em", "h1", "h2", "h3", "h4", "h5", "h6",
    "hr", "i", "img", "li", "ol", "p", "pre", "small", "span", "strong",
    "sub", "sup", "table", "tbody", "td", "th", "thead", "tr", "u", "ul", "code",
  ],
  ALLOWED_ATTR: [
    "href", "target", "rel", "src", "alt", "title", "class", "style", "id",
    "width", "height",
  ],
  ALLOWED_URI_REGEXP:
    /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  FORBID_TAGS: [
    "script", "iframe", "object", "embed", "form", "input",
    "style", "link", "meta",
  ],
  FORBID_ATTR: [
    "onerror", "onload", "onclick", "onmouseover",
    "onfocus", "onblur", "onchange", "onsubmit",
  ],
};

// Register the external-link hook exactly once per module load. Without the
// flag, hot reload in dev (or SSR re-imports in tests) would stack up
// duplicate hook handlers on the shared DOMPurify singleton.
let externalLinkHookInstalled = false;
function ensureExternalLinkHook() {
  if (externalLinkHookInstalled) return;
  externalLinkHookInstalled = true;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (!(node instanceof Element)) return;
    if (node.tagName !== "A") return;
    const href = node.getAttribute("href") ?? "";
    // Treat absolute http(s) URLs as external; anchors, mailto:, tel:, and
    // relative paths are left alone.
    if (/^https?:\/\//i.test(href)) {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  });
}

export default function SafeHtml({ html, className }: SafeHtmlProps) {
  if (!html || !html.trim()) return null;
  ensureExternalLinkHook();
  const sanitized = DOMPurify.sanitize(html, SANITIZE_CONFIG) as string;
  if (!sanitized) return null;
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
