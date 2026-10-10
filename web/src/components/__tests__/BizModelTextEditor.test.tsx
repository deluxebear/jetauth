import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import BizModelTextEditor from "../BizModelTextEditor";
import { lintCasbinModel } from "../bizCasbinModelLint";

vi.mock("../../i18n", () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: "en", setLocale: () => {} }),
}));

// CodeMirror is heavy and needs layout APIs happy-dom lacks; stub with a textarea.
vi.mock("@uiw/react-codemirror", () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="cm" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

const FULL = "[request_definition]\nr = sub, obj, act\n[policy_definition]\np = sub, obj, act\n[policy_effect]\ne = some(where (p.eft == allow))\n[matchers]\nm = r.sub == p.sub";

describe("lintCasbinModel", () => {
  it("returns nothing for a complete model", () => {
    expect(lintCasbinModel(FULL)).toEqual([]);
  });
  it("lists missing sections", () => {
    expect(lintCasbinModel("[request_definition]\nr = a")).toEqual([
      "policy_definition",
      "policy_effect",
      "matchers",
    ]);
  });
});

describe("BizModelTextEditor", () => {
  it("propagates edits", () => {
    const onChange = vi.fn();
    render(<BizModelTextEditor value={FULL} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("cm"), { target: { value: "x" } });
    expect(onChange).toHaveBeenCalledWith("x");
  });

  it("shows no warning for a complete model", () => {
    render(<BizModelTextEditor value={FULL} onChange={() => {}} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("warns about missing sections", () => {
    render(<BizModelTextEditor value="[matchers]\nm = true" onChange={() => {}} />);
    expect(screen.getByRole("alert").textContent).toContain("[request_definition]");
  });
});
