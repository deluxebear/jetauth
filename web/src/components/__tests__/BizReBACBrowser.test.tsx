/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import BizReBACBrowser from "../BizReBACBrowser";
import * as BizBackend from "../../backend/BizBackend";

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

// Minimal OpenFGA proto-JSON; parseSchemaJson accepts this shape.
const SCHEMA_JSON = JSON.stringify({
  schema_version: "1.1",
  type_definitions: [
    { type: "user", relations: {} },
    {
      type: "document",
      relations: {
        viewer: { this: {} },
        editor: { this: {} },
      },
    },
  ],
});

describe("BizReBACBrowser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(BizBackend.getBizAuthorizationModel).mockResolvedValue({
      status: "ok",
      data: { id: "m1", schemaDsl: "", schemaJson: SCHEMA_JSON, schemaHash: "h" },
    } as any);
  });

  it("By User mode calls bizListObjects and renders the result list", async () => {
    vi.mocked(BizBackend.bizListObjects).mockResolvedValue({
      status: "ok",
      data: { objects: ["document:d1", "document:d2"] },
    } as any);

    render(<BizReBACBrowser appId="o/a" />);

    // Wait for schema load
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: /objectType|object type|对象类型/i })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/user|用户/i), {
      target: { value: "user:alice" },
    });
    fireEvent.change(
      screen.getByRole("combobox", { name: /objectType|object type|对象类型/i }),
      { target: { value: "document" } },
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: /relation/i }),
      { target: { value: "viewer" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /search|查询/i }));

    await waitFor(() => {
      expect(BizBackend.bizListObjects).toHaveBeenCalledWith(
        expect.objectContaining({
          appId: "o/a",
          objectType: "document",
          relation: "viewer",
          user: "user:alice",
        }),
      );
    });
    expect(screen.getByText("document:d1")).toBeInTheDocument();
    expect(screen.getByText("document:d2")).toBeInTheDocument();
  });

  it("By Object mode switches and calls bizListUsers", async () => {
    vi.mocked(BizBackend.bizListUsers).mockResolvedValue({
      status: "ok",
      data: { users: ["user:alice", "user:bob"] },
    } as any);

    render(<BizReBACBrowser appId="o/a" />);

    await waitFor(() => {
      expect(screen.getAllByRole("button").length).toBeGreaterThan(0);
    });

    // Click By Object segmented control — match by unique substring in key
    fireEvent.click(screen.getByRole("button", { name: /byObject/i }));

    // Fill object + relation
    fireEvent.change(screen.getByLabelText(/object|对象/i), {
      target: { value: "document:d1" },
    });
    // For By Object mode, relation is a text input (not a combobox since we don't know objectType at form time)
    const relationInputs = screen.getAllByLabelText(/relation/i);
    const relationInput = relationInputs[relationInputs.length - 1]; // the input in by-object mode
    fireEvent.change(relationInput, { target: { value: "viewer" } });

    fireEvent.click(screen.getByRole("button", { name: /search|查询/i }));

    await waitFor(() => {
      expect(BizBackend.bizListUsers).toHaveBeenCalledWith(
        expect.objectContaining({
          appId: "o/a",
          object: "document:d1",
          relation: "viewer",
        }),
      );
    });
    expect(screen.getByText("user:alice")).toBeInTheDocument();
  });

  it("calls onInvestigate with the right tuple when 'Why?' is clicked", async () => {
    vi.mocked(BizBackend.bizListObjects).mockResolvedValue({
      status: "ok",
      data: { objects: ["document:d1"] },
    } as any);

    const onInvestigate = vi.fn();
    render(<BizReBACBrowser appId="o/a" onInvestigate={onInvestigate} />);

    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: /objectType|object type|对象类型/i })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/user|用户/i), { target: { value: "user:alice" } });
    fireEvent.change(
      screen.getByRole("combobox", { name: /objectType|object type|对象类型/i }),
      { target: { value: "document" } },
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: /relation/i }),
      { target: { value: "viewer" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /search|查询/i }));

    await waitFor(() => {
      expect(screen.getByText("document:d1")).toBeInTheDocument();
    });

    // Click the Why? button on the first row
    fireEvent.click(screen.getByRole("button", { name: /why|why\?|为什么/i }));

    expect(onInvestigate).toHaveBeenCalledWith({
      object: "document:d1",
      relation: "viewer",
      user: "user:alice",
    });
  });

  it("renders no-schema empty state when schema is missing", async () => {
    vi.mocked(BizBackend.getBizAuthorizationModel).mockResolvedValue({
      status: "ok",
      data: undefined,
    } as any);

    render(<BizReBACBrowser appId="o/a" />);
    await waitFor(() => {
      expect(screen.getByText(/noSchemaYet|请先在 Schema|define an authorization model/i)).toBeInTheDocument();
    });
  });
});
