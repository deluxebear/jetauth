import { describe, it, expect } from "vitest";
import { useSigninItemVisibility } from "../items/useSigninItemVisibility";

describe("useSigninItemVisibility", () => {
  it("defaults every built-in to visible when items is empty", () => {
    const v = useSigninItemVisibility([]);
    expect(v.isVisible("Back button")).toBe(true);
    expect(v.isVisible("Languages")).toBe(true);
    expect(v.isVisible("Anything")).toBe(true);
  });

  it("hides items with visible: false", () => {
    const v = useSigninItemVisibility([
      { name: "Back button", visible: false, label: "", customCss: "", placeholder: "", rule: "", isCustom: false },
    ]);
    expect(v.isVisible("Back button")).toBe(false);
    expect(v.isVisible("Languages")).toBe(true);
  });

  it("returns custom label when set", () => {
    const v = useSigninItemVisibility([
      { name: "Back button", visible: true, label: "Go Home", customCss: "", placeholder: "", rule: "", isCustom: false },
    ]);
    expect(v.labelOf("Back button")).toBe("Go Home");
    expect(v.labelOf("Languages")).toBeUndefined();
  });

  it("extracts custom items separately", () => {
    const v = useSigninItemVisibility([
      { name: "Back button", visible: true, label: "", customCss: "", placeholder: "", rule: "", isCustom: false },
      { name: "Text 1", visible: true, label: "Welcome!", customCss: "", placeholder: "", rule: "", isCustom: true },
      { name: "Text 2", visible: true, label: "Maintenance 2am-4am", customCss: "", placeholder: "", rule: "", isCustom: true },
    ]);
    expect(v.customItems.length).toBe(2);
    expect(v.customItems[0].label).toBe("Welcome!");
    expect(v.isVisible("Back button")).toBe(true);
  });

  it("ignores items without a name", () => {
    const v = useSigninItemVisibility([
      { name: "", visible: true, label: "", customCss: "", placeholder: "", rule: "", isCustom: false },
    ]);
    expect(v.isVisible("")).toBe(true); // defaults to visible
  });
});
