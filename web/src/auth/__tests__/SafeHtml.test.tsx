import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SafeHtml from "../shell/SafeHtml";

describe("SafeHtml", () => {
  it("renders nothing when html is empty", () => {
    const { container } = render(<SafeHtml html="" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when html is whitespace-only", () => {
    const { container } = render(<SafeHtml html={"   \n\t  "} />);
    expect(container.firstChild).toBeNull();
  });

  it("strips <script> tags entirely", () => {
    const { container } = render(
      <SafeHtml html={'<script>alert(1)</script>'} />,
    );
    expect(container.innerHTML).not.toContain("<script");
    expect(container.innerHTML).not.toContain("alert");
  });

  it("renders safe anchor tags", () => {
    render(<SafeHtml html={'<a href="https://x.com">x</a>'} />);
    const link = screen.getByRole("link", { name: "x" });
    expect(link.getAttribute("href")).toBe("https://x.com");
  });

  it("auto-opens external links in a new tab", () => {
    render(<SafeHtml html={'<a href="https://x.com">x</a>'} />);
    const link = screen.getByRole("link", { name: "x" });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("strips javascript: URLs from img src", () => {
    const { container } = render(
      <SafeHtml html={'<img src="javascript:alert(1)" />'} />,
    );
    const img = container.querySelector("img");
    // DOMPurify should either drop the src attr or drop the img entirely;
    // what matters is no javascript: URL surfaces in the DOM.
    expect(container.innerHTML).not.toContain("javascript:");
    if (img) {
      const src = img.getAttribute("src") ?? "";
      expect(src).not.toMatch(/^javascript:/i);
    }
  });

  it("applies className to the wrapper", () => {
    const { container } = render(
      <SafeHtml html="<p>hi</p>" className="auth-header" />,
    );
    const wrapper = container.firstElementChild as HTMLElement | null;
    expect(wrapper?.className).toBe("auth-header");
  });
});
