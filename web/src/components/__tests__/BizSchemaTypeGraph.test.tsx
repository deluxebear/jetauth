import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import BizSchemaTypeGraph from "../BizSchemaTypeGraph";
import type { SchemaAST } from "../bizSchemaAst";

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

const ast: SchemaAST = {
  schemaVersion: "1.1",
  types: [
    { id: "u", name: "user", relations: [] },
    {
      id: "d",
      name: "document",
      relations: [
        {
          id: "r",
          name: "viewer",
          rewrite: { kind: "this" },
          typeRestrictions: [{ kind: "direct", type: "user" }],
        },
      ],
    },
  ],
};

describe("BizSchemaTypeGraph", () => {
  it("renders a node label per type", () => {
    render(<BizSchemaTypeGraph ast={ast} />);
    // SVG text nodes render inside the SVG; use getByText
    expect(screen.getByText("user")).toBeInTheDocument();
    expect(screen.getByText("document")).toBeInTheDocument();
  });

  it("shows relation count on each node label", () => {
    render(<BizSchemaTypeGraph ast={ast} />);
    // "0 relations" for user, "1 relation" for document (singular form)
    expect(screen.getByText(/1 relation\b/)).toBeInTheDocument();
    expect(screen.getByText(/0 relations/)).toBeInTheDocument();
  });

  it("clicking a node selects it and shows its relations in the sidebar", () => {
    render(<BizSchemaTypeGraph ast={ast} />);
    // The <g> group wrapping the node is clickable; use the text inside
    fireEvent.click(screen.getByText("document"));
    // The sidebar should now list "viewer" as a button
    expect(screen.getByRole("button", { name: /viewer/i })).toBeInTheDocument();
  });

  it("shows the pickType hint in the sidebar when no node selected", () => {
    render(<BizSchemaTypeGraph ast={ast} />);
    expect(
      screen.getByText(/pickType|点击左侧|pick a node/i),
    ).toBeInTheDocument();
  });

  it("renders empty state when schema has no types", () => {
    render(
      <BizSchemaTypeGraph ast={{ schemaVersion: "1.1", types: [] }} />,
    );
    expect(screen.getByText(/noTypes|no types|尚未定义任何类型/i)).toBeInTheDocument();
  });

  it("renders all N types on distinct positions when user + 3 others (regression: user overlap bug)", () => {
    // The previous full-circle layout spaced `total = N+1` nodes
    // around 2π and happened to land one other at angle π — exactly
    // where user was pinned — hiding user behind it. Exercise that
    // case.
    const manyTypesAst: SchemaAST = {
      schemaVersion: "1.1",
      types: [
        { id: "u", name: "user", relations: [] },
        { id: "t", name: "team", relations: [] },
        { id: "w", name: "workspace", relations: [] },
        { id: "d", name: "doc", relations: [] },
      ],
    };
    const { container } = render(<BizSchemaTypeGraph ast={manyTypesAst} />);
    for (const name of ["user", "team", "workspace", "doc"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    // Also verify no two node groups share the same (x, y) translate —
    // overlap would hide a node visually even if its text is in DOM.
    const groups = container.querySelectorAll("svg g[transform^='translate']");
    const transforms = Array.from(groups).map((g) => g.getAttribute("transform"));
    const unique = new Set(transforms);
    expect(unique.size).toBe(transforms.length);
  });
});
