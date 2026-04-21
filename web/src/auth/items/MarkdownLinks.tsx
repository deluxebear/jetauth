// Parses an admin-provided label with markdown-style links `[text](url)` and
// renders it as mixed text + anchors. Used by the signin/signup Agreement row
// so ops can write "我已阅读并同意[《用户协议》](https://…/terms)和[《隐私政策》](https://…/privacy)"
// without needing to edit code.
//
// URLs are whitelisted to http/https and site-relative paths — anything else
// (javascript:, data:, file:, etc.) is dropped and the bracketed text renders
// as plain text. Prevents XSS via the admin label field.

import { Fragment, type ReactNode } from "react";

const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;

function isSafeUrl(raw: string): boolean {
  const url = raw.trim();
  if (url.startsWith("/") && !url.startsWith("//")) return true;
  return /^https?:\/\//i.test(url);
}

export function MarkdownLinks({ text, className }: { text: string; className?: string }) {
  if (!text) return null;
  const out: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  LINK_RE.lastIndex = 0;
  let i = 0;
  while ((match = LINK_RE.exec(text)) !== null) {
    const [full, label, url] = match;
    if (match.index > cursor) {
      out.push(<Fragment key={`t${i}`}>{text.slice(cursor, match.index)}</Fragment>);
    }
    if (isSafeUrl(url)) {
      out.push(
        <a
          key={`a${i}`}
          href={url.trim()}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {label}
        </a>,
      );
    } else {
      // Unsafe scheme — render the bracketed text verbatim, drop the url.
      out.push(<Fragment key={`u${i}`}>{label}</Fragment>);
    }
    cursor = match.index + full.length;
    i++;
  }
  if (cursor < text.length) {
    out.push(<Fragment key="tail">{text.slice(cursor)}</Fragment>);
  }
  return <span className={className}>{out}</span>;
}
