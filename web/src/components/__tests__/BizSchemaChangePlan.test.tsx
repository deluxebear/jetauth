import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import BizSchemaChangePlan from "../BizSchemaChangePlan";

vi.mock("../../i18n", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      if (!params) return key;
      return key.replace(/\{\{(\w+)\}\}/g, (_, k) =>
        params[k] !== undefined ? String(params[k]) : `{{${k}}}`,
      );
    },
    locale: "en",
    setLocale: () => {},
  }),
}));

describe("BizSchemaChangePlan", () => {
  it("does not render when open=false", () => {
    const { container } = render(
      <BizSchemaChangePlan
        open={false}
        savedDsl=""
        nextDsl=""
        conflicts={[]}
        onCancel={vi.fn()}
        onForceCleanupAndSave={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders conflicts grouped by relation with count", () => {
    render(
      <BizSchemaChangePlan
        open
        savedDsl={"type user\ntype document\n  relations\n    define editor: [user]\n"}
        nextDsl={"type user\ntype document\n  relations\n    define viewer: [user]\n"}
        conflicts={[
          {
            tupleId: 1,
            object: "document:d1",
            relation: "editor",
            user: "user:a",
            reason: "relation document#editor no longer exists",
          },
          {
            tupleId: 2,
            object: "document:d2",
            relation: "editor",
            user: "user:b",
            reason: "relation document#editor no longer exists",
          },
        ]}
        onCancel={vi.fn()}
        onForceCleanupAndSave={vi.fn()}
      />,
    );
    // Group header should mention the relation key
    expect(screen.getByText(/document#editor/)).toBeInTheDocument();
    // Count badge should indicate 2 tuples
    expect(
      screen.getAllByText((content) => content.includes("2")).length,
    ).toBeGreaterThan(0);
  });

  it("clicking cleanup button calls onForceCleanupAndSave", () => {
    const onForce = vi.fn();
    render(
      <BizSchemaChangePlan
        open
        savedDsl="x"
        nextDsl="y"
        conflicts={[
          {
            tupleId: 1,
            object: "document:d1",
            relation: "editor",
            user: "user:a",
            reason: "gone",
          },
        ]}
        onCancel={vi.fn()}
        onForceCleanupAndSave={onForce}
      />,
    );
    const btn = screen.getByRole("button", {
      name: /cleanupAndSave|清理|clean.*save/i,
    });
    fireEvent.click(btn);
    expect(onForce).toHaveBeenCalled();
  });

  it("clicking cancel calls onCancel", () => {
    const onCancel = vi.fn();
    render(
      <BizSchemaChangePlan
        open
        savedDsl=""
        nextDsl=""
        conflicts={[]}
        onCancel={onCancel}
        onForceCleanupAndSave={vi.fn()}
      />,
    );
    // There are 2 cancel affordances (X button + footer cancel). Click the named one.
    const btn = screen.getAllByRole("button", { name: /cancel|取消/i })[0];
    fireEvent.click(btn);
    expect(onCancel).toHaveBeenCalled();
  });
});
