import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import BizDecisionPathGraph from "../BizDecisionPathGraph";
import type { BizExpandNode } from "../../backend/BizBackend";

vi.mock("../../i18n", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

describe("BizDecisionPathGraph", () => {
  it("renders a placeholder when root is undefined", () => {
    render(<BizDecisionPathGraph />);
    expect(screen.getByText(/no decision path yet/i)).toBeInTheDocument();
  });

  it("renders nodes for a flat tree (single root)", () => {
    const root: BizExpandNode = {
      kind: "this",
      users: ["user:alice"],
    };
    render(<BizDecisionPathGraph root={root} />);
    expect(screen.getByText("user:alice")).toBeInTheDocument();
  });

  it("renders nested children with edge labels", () => {
    const root: BizExpandNode = {
      kind: "userset",
      computed: { object: "document:roadmap-2026", relation: "viewer" },
      children: [
        {
          kind: "computed",
          computed: { object: "folder:design-team", relation: "editor" },
          children: [],
        },
      ],
    };
    render(<BizDecisionPathGraph root={root} highlightUser="user:carol" />);
    expect(screen.getByText("user:carol")).toBeInTheDocument();
    // "document:roadmap-2026" is 21 chars → truncated to slice(0,16)+"…" = "document:roadmap…"
    expect(screen.getByText(/^document:roadmap/)).toBeInTheDocument();
    expect(screen.getByText("folder:design-team")).toBeInTheDocument();
    // Edge label "editor" appears (the relation of the child node)
    expect(screen.getByText("editor")).toBeInTheDocument();
  });

  it("truncates labels longer than 18 characters with an ellipsis", () => {
    const root: BizExpandNode = {
      kind: "this",
      users: ["organization:very-long-organization-name"],
    };
    render(<BizDecisionPathGraph root={root} />);
    // The visible label is the truncated form, NOT the full string.
    expect(screen.queryByText("organization:very-long-organization-name")).toBeNull();
    // Truncated form is "first 16 chars + …" = "organization:ver…"
    expect(screen.getByText(/^organization:ver…$/)).toBeInTheDocument();
  });

  it("shows hop count when nodes are present", () => {
    const root: BizExpandNode = {
      kind: "userset",
      computed: { object: "document:r", relation: "viewer" },
      children: [{ kind: "computed", computed: { object: "folder:f", relation: "editor" }, children: [] }],
    };
    render(<BizDecisionPathGraph root={root} highlightUser="user:carol" matchedRule={1} />);
    expect(screen.getByText(/hops|跳/)).toBeInTheDocument();
    expect(screen.getByText(/rule|规则/)).toBeInTheDocument();
  });
});
