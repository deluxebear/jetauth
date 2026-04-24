import { describe, it, expect } from "vitest";
import { REBAC_TEMPLATES, getTemplateById } from "../bizRebacTemplates";

describe("bizRebacTemplates", () => {
  it("ships 3 templates with unique ids", () => {
    expect(REBAC_TEMPLATES).toHaveLength(3);
    const ids = REBAC_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("every template has valid DSL that starts with 'model'", () => {
    for (const t of REBAC_TEMPLATES) {
      expect(t.dsl.trim().startsWith("model")).toBe(true);
      expect(t.dsl).toContain("schema 1.1");
    }
  });

  it("every template has at least one sample tuple", () => {
    for (const t of REBAC_TEMPLATES) {
      expect(t.sampleTuples.length).toBeGreaterThan(0);
      for (const tk of t.sampleTuples) {
        expect(tk.object).toMatch(/^[a-z_]+:[a-z0-9_*-]+$/i);
        expect(tk.user).toMatch(/^[a-z_]+:[a-z0-9_*-]+(#[a-z_]+)?$/i);
      }
    }
  });

  it("getTemplateById returns the right template or null", () => {
    expect(getTemplateById("document-collab")?.id).toBe("document-collab");
    expect(getTemplateById("nonexistent")).toBeNull();
  });
});
