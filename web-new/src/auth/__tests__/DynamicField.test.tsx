import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DynamicField from "../signup/DynamicField";
import type { FieldSchema } from "../signup/useSignupSchema";

function makeSchema(overrides: Partial<FieldSchema>): FieldSchema {
  return {
    name: "field",
    type: "text",
    label: "Test Field",
    placeholder: "",
    required: false,
    visible: true,
    step: 0,
    ...overrides,
  };
}

const noop = () => {};

describe("DynamicField router", () => {
  it("dispatches 'email' type → input[type=email]", () => {
    render(
      <DynamicField
        schema={makeSchema({ type: "email", label: "Email" })}
        value=""
        onChange={noop}
      />
    );
    expect(screen.getByRole("textbox")).toHaveAttribute("type", "email");
  });

  it("dispatches 'phone' type → input[type=tel]", () => {
    render(
      <DynamicField
        schema={makeSchema({ type: "phone", label: "Phone" })}
        value=""
        onChange={noop}
      />
    );
    const input = document.querySelector("input[type='tel']");
    expect(input).not.toBeNull();
  });

  it("dispatches 'password' type → input[type=password] initially", () => {
    render(
      <DynamicField
        schema={makeSchema({ type: "password", label: "Password" })}
        value=""
        onChange={noop}
      />
    );
    const input = document.querySelector("input[type='password']");
    expect(input).not.toBeNull();
  });

  it("PasswordField eye toggle switches type to text", () => {
    render(
      <DynamicField
        schema={makeSchema({ type: "password", label: "Password" })}
        value=""
        onChange={noop}
      />
    );
    const btn = screen.getByRole("button", { name: /show password/i });
    fireEvent.click(btn);
    const input = document.querySelector("input[type='text']");
    expect(input).not.toBeNull();
    // clicking again hides it
    fireEvent.click(btn);
    const hidden = document.querySelector("input[type='password']");
    expect(hidden).not.toBeNull();
  });

  it("dispatches 'confirm-password' → input[type=password] with no eye toggle", () => {
    render(
      <DynamicField
        schema={makeSchema({ type: "confirm-password", label: "Confirm Password" })}
        value=""
        onChange={noop}
      />
    );
    const input = document.querySelector("input[type='password']");
    expect(input).not.toBeNull();
    // No eye button in ConfirmPasswordField
    const btn = screen.queryByRole("button", { name: /show password/i });
    expect(btn).toBeNull();
  });

  it("dispatches 'select' → renders a <select> with options", () => {
    render(
      <DynamicField
        schema={makeSchema({ type: "select", label: "Country", options: ["US", "UK", "CA"] })}
        value=""
        onChange={noop}
      />
    );
    const select = screen.getByRole("combobox");
    expect(select).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "US" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "UK" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "CA" })).toBeInTheDocument();
  });

  it("dispatches 'checkbox' → renders a checkbox input", () => {
    render(
      <DynamicField
        schema={makeSchema({ type: "checkbox", label: "Subscribe to newsletter" })}
        value={false}
        onChange={noop}
      />
    );
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("dispatches 'providers' → returns null (renders nothing)", () => {
    const { container } = render(
      <DynamicField
        schema={makeSchema({ type: "providers", label: "Providers" })}
        value={null}
        onChange={noop}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows error message below the field", () => {
    render(
      <DynamicField
        schema={makeSchema({ type: "email", label: "Email" })}
        value=""
        onChange={noop}
        error="Invalid email address"
      />
    );
    expect(screen.getByText("Invalid email address")).toBeInTheDocument();
  });

  it("required label shows red asterisk span", () => {
    render(
      <DynamicField
        schema={makeSchema({ type: "text", label: "Username", required: true })}
        value=""
        onChange={noop}
      />
    );
    // The asterisk is rendered as a <span> with text "*"
    const asterisk = screen.getByText("*");
    expect(asterisk).toBeInTheDocument();
    expect(asterisk.tagName).toBe("SPAN");
  });

  it("AgreementField renders terms link when context.termsOfUse is set and label contains {terms}", () => {
    render(
      <DynamicField
        schema={makeSchema({ type: "agreement", label: "I agree to the {terms}", required: true })}
        value={false}
        onChange={noop}
        context={{ termsOfUse: "https://example.com/terms" }}
      />
    );
    const link = screen.getByRole("link", { name: /terms of use/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://example.com/terms");
  });
});
