import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import BizRoleDataScopeEditor from "../BizRoleDataScopeEditor";
import { readDataScope, writeDataScope } from "../bizDataScope";

vi.mock("../../i18n", () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: "en", setLocale: () => {} }),
}));

describe("data scope helpers", () => {
  it("reads typed scope and ignores legacy shapes", () => {
    expect(readDataScope('{"dataScope":{"type":"dept"}}')).toEqual({ type: "dept", values: [] });
    expect(readDataScope('{"dataScope":{"orders":"department"}}')).toEqual({ type: "", values: [] });
    expect(readDataScope("")).toEqual({ type: "", values: [] });
    expect(readDataScope("{bad")).toEqual({ type: "", values: [] });
  });

  it("writes scope while preserving other keys and resources", () => {
    const raw = JSON.stringify({ tier: "gold", dataScope: { type: "self", resources: { orders: { type: "all" } } } });
    const out = JSON.parse(writeDataScope(raw, { type: "dept", values: [] })!);
    expect(out.tier).toBe("gold");
    expect(out.dataScope).toEqual({ type: "dept", resources: { orders: { type: "all" } } });
  });

  it("removes the key when unset and returns empty string when nothing is left", () => {
    expect(writeDataScope('{"dataScope":{"type":"self"}}', { type: "", values: [] })).toBe("");
  });

  it("returns null for invalid JSON", () => {
    expect(writeDataScope("{bad", { type: "all", values: [] })).toBeNull();
  });
});

describe("BizRoleDataScopeEditor", () => {
  it("emits properties JSON when a type is selected", () => {
    const onChange = vi.fn();
    render(<BizRoleDataScopeEditor value='{"tier":"gold"}' onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "org" } });
    expect(JSON.parse(onChange.mock.calls[0][0])).toEqual({ tier: "gold", dataScope: { type: "org" } });
  });

  it("shows the values box only for custom and parses lines", () => {
    const onChange = vi.fn();
    const { rerender } = render(<BizRoleDataScopeEditor value='{"dataScope":{"type":"self"}}' onChange={onChange} />);
    expect(screen.queryByRole("textbox")).toBeNull();
    rerender(<BizRoleDataScopeEditor value='{"dataScope":{"type":"custom","values":["d1"]}}' onChange={onChange} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "d1\nd2, d3" } });
    expect(JSON.parse(onChange.mock.calls[0][0]).dataScope).toEqual({ type: "custom", values: ["d1", "d2", "d3"] });
  });

  it("disables the selector on invalid JSON", () => {
    render(<BizRoleDataScopeEditor value="{bad" onChange={() => {}} />);
    expect((screen.getByRole("combobox") as HTMLSelectElement).disabled).toBe(true);
  });
});
