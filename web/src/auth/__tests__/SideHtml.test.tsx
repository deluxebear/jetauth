import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SideHtml from "../shell/SideHtml";

describe("SideHtml", () => {
  it("renders nothing when html is empty", () => {
    const { container } = render(<SideHtml />);
    expect(container.firstChild).toBeNull();
  });

  it("strips <script> tags", () => {
    const { container } = render(
      <SideHtml html={'<p>hello</p><script>alert(1)</script>'} />
    );
    expect(container.innerHTML).not.toContain("<script");
    expect(container.innerHTML).toContain("hello");
  });

  it("strips onclick attributes", () => {
    const { container } = render(
      <SideHtml html={'<p onclick="alert(1)">x</p>'} />
    );
    expect(container.innerHTML).not.toContain("onclick");
  });

  it("passes safe HTML through", () => {
    render(<SideHtml html={'<p data-testid="safe">Welcome to our service</p>'} />);
    expect(screen.getByTestId("safe").textContent).toBe("Welcome to our service");
  });

  it("strips javascript: URLs", () => {
    const { container } = render(
      <SideHtml html={'<a href="javascript:alert(1)">click</a>'} />
    );
    expect(container.innerHTML).not.toContain("javascript:");
  });
});
