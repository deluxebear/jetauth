import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import EnableMfaNotification from "../EnableMfaNotification";

vi.mock("../../i18n", () => ({
  useTranslation: () => ({ t: (k: string) => k, locale: "en", setLocale: () => {} }),
}));

const account = {
  owner: "org",
  name: "alice",
  organization: { mfaItems: [{ name: "app", rule: "Prompted" }] },
  multiFactorAuths: [{ mfaType: "app", enabled: false }],
};

function renderIt(props: Partial<React.ComponentProps<typeof EnableMfaNotification>>) {
  const onDismiss = vi.fn();
  const utils = render(
    <MemoryRouter>
      <EnableMfaNotification account={account} justLoggedIn onDismiss={onDismiss} {...props} />
    </MemoryRouter>,
  );
  return { onDismiss, ...utils };
}

describe("EnableMfaNotification", () => {
  it("shows the banner when a prompted MFA type is not enabled", () => {
    renderIt({});
    expect(screen.getByText("users.mfa.app")).toBeInTheDocument();
  });

  it("renders nothing when the user did not just log in", () => {
    const { container } = renderIt({ justLoggedIn: false });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when MFA is already enabled", () => {
    const { container } = renderIt({
      account: { ...account, multiFactorAuths: [{ mfaType: "app", enabled: true }] },
    });
    expect(container).toBeEmptyDOMElement();
  });

  it("hides and calls onDismiss when dismissed", () => {
    const { onDismiss, container } = renderIt({});
    fireEvent.click(screen.getAllByRole("button")[screen.getAllByRole("button").length - 1]);
    expect(onDismiss).toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });
});
