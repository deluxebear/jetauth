import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ColorPicker, { contrastRatio } from "../ColorPicker";

vi.mock("../../i18n", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

describe("ColorPicker", () => {
  it("renders palette buttons + hex input", () => {
    render(<ColorPicker value="#2563EB" onChange={vi.fn()} />);
    const palette = screen.getAllByLabelText(/^#[0-9A-F]{6}$/);
    expect(palette.length).toBeGreaterThanOrEqual(8);
    expect(screen.getByPlaceholderText("#2563EB")).toBeInTheDocument();
  });

  it("calls onChange when a palette swatch is clicked", () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#2563EB" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("#E11D48"));
    expect(onChange).toHaveBeenCalledWith("#E11D48");
  });

  it("accepts valid hex input and normalizes to uppercase with #", () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#2563EB" onChange={onChange} />);
    const input = screen.getByPlaceholderText("#2563EB");
    fireEvent.change(input, { target: { value: "abc123" } });
    expect(onChange).toHaveBeenCalledWith("#ABC123");
  });

  it("rejects invalid hex without calling onChange", () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#2563EB" onChange={onChange} />);
    const input = screen.getByPlaceholderText("#2563EB");
    fireEvent.change(input, { target: { value: "xyz" } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows contrast ratios", () => {
    render(<ColorPicker value="#000000" onChange={vi.fn()} />);
    // #000 vs #FFF should be 21.0 AAA
    expect(screen.getByText(/21\.0/)).toBeInTheDocument();
  });
});

describe("contrastRatio", () => {
  it("returns 21 for pure black/white", () => {
    const ratio = contrastRatio([0, 0, 0], [255, 255, 255]);
    expect(ratio).toBeCloseTo(21, 1);
  });

  it("returns 1 for identical colors", () => {
    const ratio = contrastRatio([100, 100, 100], [100, 100, 100]);
    expect(ratio).toBeCloseTo(1, 2);
  });

  it("WCAG AA pass for #2563EB on white (>=4.5)", () => {
    const ratio = contrastRatio([37, 99, 235], [255, 255, 255]);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});
