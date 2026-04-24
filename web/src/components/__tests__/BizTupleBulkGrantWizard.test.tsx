import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import BizTupleBulkGrantWizard from "../BizTupleBulkGrantWizard";
import type { SchemaAST } from "../bizSchemaAst";

vi.mock("../../backend/BizBackend");
vi.mock("../Modal", () => ({
  useModal: () => ({ toast: vi.fn(), showConfirm: vi.fn() }),
}));
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
          id: "v",
          name: "viewer",
          rewrite: { kind: "this" },
          typeRestrictions: [{ kind: "direct", type: "user" }],
        },
      ],
    },
  ],
};

describe("BizTupleBulkGrantWizard", () => {
  it("does not render when open=false", () => {
    const { container } = render(
      <BizTupleBulkGrantWizard
        open={false}
        appId="o/a"
        ast={ast}
        onCancel={vi.fn()}
        onApply={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("walks Step 1 → Step 4 and shows a 1-tuple preview", () => {
    render(
      <BizTupleBulkGrantWizard
        open
        appId="o/a"
        ast={ast}
        onCancel={vi.fn()}
        onApply={vi.fn()}
      />,
    );

    // Step 1 — select single + fill subject value
    // Radios are labelled via label wrappers; click label text
    fireEvent.click(screen.getByLabelText(/rebac\.wizard\.subjSingle|subjSingle|single user|单用户/i));
    fireEvent.change(screen.getByLabelText(/rebac\.wizard\.subjValue|subjValue|主体值|subject value/i), {
      target: { value: "user:alice" },
    });
    fireEvent.click(screen.getByRole("button", { name: /rebac\.wizard\.next|next|下一步/i }));

    // Step 2 — single object
    fireEvent.click(screen.getByLabelText(/rebac\.wizard\.objSingle|objSingle|single object|单对象/i));
    fireEvent.change(screen.getByLabelText(/rebac\.wizard\.objValue|objValue|对象值|object value/i), {
      target: { value: "document:d1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /rebac\.wizard\.next|next|下一步/i }));

    // Step 3 — pick relation
    fireEvent.change(
      screen.getByRole("combobox", { name: /rebac\.browser\.relation|relation|关系/i }),
      { target: { value: "viewer" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /rebac\.wizard\.next|next|下一步/i }));

    // Step 4 — preview must list the one tuple
    expect(
      screen.getByText(/document:d1.*viewer.*user:alice/i),
    ).toBeInTheDocument();
  });
});
