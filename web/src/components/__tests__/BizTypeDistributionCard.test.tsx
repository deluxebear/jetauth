import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import BizTypeDistributionCard from "../BizTypeDistributionCard";

vi.mock("../../i18n", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    locale: "en",
    setLocale: () => {},
  }),
}));

describe("BizTypeDistributionCard", () => {
  it("renders empty state when rows is empty", () => {
    render(<BizTypeDistributionCard rows={[]} />);
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("formats counts as K/M and renders one row per type", () => {
    render(
      <BizTypeDistributionCard
        rows={[
          { type: "document", count: 232000 },
          { type: "folder", count: 1500000 },
          { type: "user", count: 86 },
        ]}
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("document")).toBeInTheDocument();
    expect(screen.getByText("232K")).toBeInTheDocument();
    expect(screen.getByText("1.5M")).toBeInTheDocument();
    expect(screen.getByText("86")).toBeInTheDocument();
  });

  it("scales bar widths relative to the max value", () => {
    render(
      <BizTypeDistributionCard
        rows={[
          { type: "a", count: 100 },
          { type: "b", count: 50 },
        ]}
      />,
    );
    const bars = screen.getAllByRole("progressbar");
    expect(bars).toHaveLength(2);
    // The first bar's inner div should be 100% wide; the second 50%.
    // Assert via getAttribute on style or by inspecting the DOM tree.
    const firstInner = bars[0].firstElementChild as HTMLElement;
    const secondInner = bars[1].firstElementChild as HTMLElement;
    expect(firstInner.style.width).toBe("100%");
    expect(secondInner.style.width).toBe("50%");
  });
});
