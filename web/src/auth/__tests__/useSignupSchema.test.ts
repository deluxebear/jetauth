import { describe, it, expect } from "vitest";
import { buildSignupSchema } from "../signup/useSignupSchema";
import type { SignupItem } from "../api/types";

function item(partial: Partial<SignupItem>): SignupItem {
  return {
    name: "",
    visible: true,
    required: false,
    prompted: false,
    type: "",
    customCss: "",
    label: "",
    placeholder: "",
    options: [],
    regex: "",
    rule: "",
    ...partial,
  };
}

describe("buildSignupSchema", () => {
  it("returns a single empty step for empty input", () => {
    const s = buildSignupSchema([]);
    expect(s.steps).toEqual([[]]);
    expect(s.hasVisibleStepBreak).toBe(false);
    expect(s.total).toBe(0);
  });

  it("infers email type from name", () => {
    const s = buildSignupSchema([item({ name: "Email" })]);
    expect(s.steps[0][0].type).toBe("email");
  });

  it("explicit type beats name-based inference", () => {
    const s = buildSignupSchema([item({ name: "Employee ID", type: "text" })]);
    expect(s.steps[0][0].type).toBe("text");
  });

  it("compiles regex to RegExp", () => {
    const s = buildSignupSchema([item({ name: "Username", regex: "^[a-z]+$" })]);
    const f = s.steps[0][0];
    expect(f.regex).toBeInstanceOf(RegExp);
    expect(f.regex!.test("abc")).toBe(true);
    expect(f.regex!.test("abc123")).toBe(false);
  });

  it("silently ignores invalid regex", () => {
    const s = buildSignupSchema([item({ name: "Broken", regex: "[a-z" })]);
    expect(s.steps[0][0].regex).toBeUndefined();
  });

  it("filters out invisible items", () => {
    const s = buildSignupSchema([
      item({ name: "Username", visible: true }),
      item({ name: "Secret", visible: false }),
    ]);
    expect(s.total).toBe(1);
    expect(s.steps[0].map((f) => f.name)).toEqual(["Username"]);
  });

  it("respects explicit step assignments (1-indexed from backend)", () => {
    const s = buildSignupSchema([
      item({ name: "Username", step: 1 }),
      item({ name: "Bio", step: 2 }),
      item({ name: "Tag", step: 2 }),
    ]);
    expect(s.steps.length).toBe(2);
    expect(s.steps[0].map((f) => f.name)).toEqual(["Username"]);
    expect(s.steps[1].map((f) => f.name)).toEqual(["Bio", "Tag"]);
    expect(s.hasVisibleStepBreak).toBe(true);
  });

  it("auto-splits when required field count exceeds threshold", () => {
    const items = Array.from({ length: 8 }, (_, i) =>
      item({ name: `Field ${i}`, required: true })
    );
    const s = buildSignupSchema(items, 6);
    expect(s.steps.length).toBe(2);
    expect(s.hasVisibleStepBreak).toBe(true);
  });

  it("does not split when required count is within threshold", () => {
    const items = Array.from({ length: 3 }, (_, i) =>
      item({ name: `Field ${i}`, required: true })
    );
    const s = buildSignupSchema(items, 6);
    expect(s.steps.length).toBe(1);
    expect(s.hasVisibleStepBreak).toBe(false);
  });

  it("unknown name defaults to text", () => {
    const s = buildSignupSchema([item({ name: "SomeCustomField" })]);
    expect(s.steps[0][0].type).toBe("text");
  });
});
