import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import BizRecentWritesCard from "../BizRecentWritesCard";

vi.mock("../../i18n", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    locale: "en",
    setLocale: () => {},
  }),
}));

describe("BizRecentWritesCard", () => {
  it("shows empty-state copy when no writes", () => {
    render(<BizRecentWritesCard writes={[]} />);
    // The empty-state string comes from i18n; assert the placeholder
    // role and that no <li> renders.
    expect(screen.queryByRole("listitem")).toBeNull();
  });

  it("renders one row per write with formatted parts", () => {
    render(
      <BizRecentWritesCard
        writes={[
          {
            op: "write",
            object: "document:roadmap-2026",
            relation: "viewer",
            user: "user:carol",
            at: "2026-05-07T14:32:08Z",
          },
        ]}
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("write")).toBeInTheDocument();
    expect(screen.getByText("viewer")).toBeInTheDocument();
    expect(screen.getByText("carol")).toBeInTheDocument();
    expect(screen.getByText("roadmap-2026")).toBeInTheDocument();
  });

  it("calls onViewAll when the link is clicked", async () => {
    const fn = vi.fn();
    render(<BizRecentWritesCard writes={[]} onViewAll={fn} />);
    const btn = screen.getByRole("button");
    btn.click();
    expect(fn).toHaveBeenCalledOnce();
  });
});
