import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SortableList from "../SortableList";

describe("SortableList", () => {
  it("renders each item via renderItem", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    render(
      <SortableList
        items={items}
        getId={(it) => it.id}
        onReorder={vi.fn()}
        renderItem={(it, _idx, handle) => (
          <div data-testid={`row-${it.id}`}>
            {handle}
            <span>{it.id}</span>
          </div>
        )}
      />
    );
    expect(screen.getByTestId("row-a")).toBeInTheDocument();
    expect(screen.getByTestId("row-b")).toBeInTheDocument();
    expect(screen.getByTestId("row-c")).toBeInTheDocument();
  });

  it("renders drag handles per row", () => {
    const items = [{ id: "a" }, { id: "b" }];
    render(
      <SortableList
        items={items}
        getId={(it) => it.id}
        onReorder={vi.fn()}
        renderItem={(_item, _idx, handle) => <div>{handle}</div>}
      />
    );
    expect(screen.getAllByLabelText("Drag to reorder").length).toBe(2);
  });

  it("hides drag handles when disabled", () => {
    render(
      <SortableList
        disabled
        items={[{ id: "a" }]}
        getId={(it) => it.id}
        onReorder={vi.fn()}
        renderItem={(it, _idx, handle) => (
          <div>
            {handle}
            <span>{it.id}</span>
          </div>
        )}
      />
    );
    expect(screen.queryByLabelText("Drag to reorder")).toBeNull();
  });
});
