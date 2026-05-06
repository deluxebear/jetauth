import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import TupleChip from "../TupleChip";

describe("TupleChip", () => {
  it("renders type:name with split styling for object kind", () => {
    render(<TupleChip kind="object" value="document:roadmap-2026" />);
    expect(screen.getByText("document:")).toBeInTheDocument();
    expect(screen.getByText("roadmap-2026")).toBeInTheDocument();
  });

  it("renders relation kind without type prefix split", () => {
    render(<TupleChip kind="relation" value="viewer" />);
    expect(screen.getByText("viewer")).toBeInTheDocument();
  });

  it("falls back gracefully when value has no colon", () => {
    render(<TupleChip kind="user" value="alice" />);
    expect(screen.getByText("alice")).toBeInTheDocument();
  });

  it("preserves embedded colons after the first split", () => {
    render(<TupleChip kind="user" value="user:foo:bar" />);
    expect(screen.getByText("foo:bar")).toBeInTheDocument();
  });
});
