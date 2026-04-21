import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TemplateGalleryModal from "../TemplateGalleryModal";
import { AUTH_TEMPLATES } from "../templates";

vi.mock("../../../i18n", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

describe("TemplateGalleryModal", () => {
  it("renders one card per template", () => {
    render(
      <TemplateGalleryModal open onClose={() => {}} onApply={() => {}} />
    );
    // 3 layout-template manifests (store v1) + 6 legacy CSS-overlay presets.
    // If this count shifts, re-check whether the new entry is intended.
    expect(AUTH_TEMPLATES).toHaveLength(9);
    for (const tmpl of AUTH_TEMPLATES) {
      expect(screen.getByTestId(`template-card-${tmpl.id}`)).toBeInTheDocument();
    }
  });

  it("invokes onApply with the clicked template", () => {
    const onApply = vi.fn();
    render(
      <TemplateGalleryModal open onClose={() => {}} onApply={onApply} />
    );
    const first = AUTH_TEMPLATES[0];
    fireEvent.click(screen.getByTestId(`template-apply-${first.id}`));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0].id).toBe(first.id);
  });
});
