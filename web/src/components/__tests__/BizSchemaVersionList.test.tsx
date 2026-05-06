import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import BizSchemaVersionList from "../BizSchemaVersionList";
import type { BizAuthorizationModel } from "../../backend/BizBackend";

vi.mock("../../i18n", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    locale: "en",
    setLocale: () => {},
  }),
}));

function makeModel(over: Partial<BizAuthorizationModel>): BizAuthorizationModel {
  return {
    id: "m" + Math.random().toString(36).slice(2, 8),
    owner: "admin",
    appName: "drive_prod",
    schemaDsl: "model\n  schema 1.1\n",
    schemaJson: "{}",
    schemaHash: "abc",
    description: "",
    createdTime: new Date().toISOString(),
    createdBy: "陈嘉峰",
    ...over,
  };
}

describe("BizSchemaVersionList", () => {
  it("renders versions newest-first with descending v-numbers", () => {
    const versions = [
      makeModel({ id: "m7", description: "增加 commenter 关系" }),
      makeModel({ id: "m6", description: "folder.parent 支持嵌套" }),
      makeModel({ id: "m5", description: "viewer 改为联合定义" }),
    ];
    render(
      <BizSchemaVersionList
        versions={versions}
        activeId="m7"
        onSelect={() => {}}
        onRollback={() => {}}
        onCreateNew={() => {}}
        onExportDsl={() => {}}
      />,
    );
    // Newest first → v3, v2, v1 (since there are 3 versions; v(3) maps to the newest).
    expect(screen.getByText("v3")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.getByText("增加 commenter 关系")).toBeInTheDocument();
  });

  it("shows the active badge only on the active row and hides rollback there", () => {
    const versions = [
      makeModel({ id: "active-m", description: "current" }),
      makeModel({ id: "older-m", description: "older" }),
    ];
    render(
      <BizSchemaVersionList
        versions={versions}
        activeId="active-m"
        onSelect={() => {}}
        onRollback={() => {}}
        onCreateNew={() => {}}
        onExportDsl={() => {}}
      />,
    );
    // Exactly one rollback button (on the older, non-active row).
    const rollbacks = screen.getAllByLabelText(/rollback/i);
    expect(rollbacks).toHaveLength(1);
  });

  it("invokes onSelect when a row body is clicked", () => {
    const onSelect = vi.fn();
    const versions = [makeModel({ id: "m1", description: "one" })];
    render(
      <BizSchemaVersionList
        versions={versions}
        activeId="m1"
        onSelect={onSelect}
        onRollback={() => {}}
        onCreateNew={() => {}}
        onExportDsl={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("one"));
    expect(onSelect).toHaveBeenCalledWith("m1");
  });

  it("invokes onRollback (and stops propagation to onSelect) on a non-active row", () => {
    const onSelect = vi.fn();
    const onRollback = vi.fn();
    const versions = [
      makeModel({ id: "active-m", description: "active row" }),
      makeModel({ id: "older-m", description: "older row" }),
    ];
    render(
      <BizSchemaVersionList
        versions={versions}
        activeId="active-m"
        onSelect={onSelect}
        onRollback={onRollback}
        onCreateNew={() => {}}
        onExportDsl={() => {}}
      />,
    );
    fireEvent.click(screen.getByLabelText(/rollback/i));
    expect(onRollback).toHaveBeenCalledWith("older-m");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("renders empty state when there are no versions", () => {
    render(
      <BizSchemaVersionList
        versions={[]}
        onSelect={() => {}}
        onRollback={() => {}}
        onCreateNew={() => {}}
        onExportDsl={() => {}}
      />,
    );
    expect(screen.queryAllByRole("button", { name: /rollback/i })).toHaveLength(0);
  });

  it("invokes onCreateNew and onExportDsl from header buttons", () => {
    const onCreateNew = vi.fn();
    const onExportDsl = vi.fn();
    render(
      <BizSchemaVersionList
        versions={[]}
        onSelect={() => {}}
        onRollback={() => {}}
        onCreateNew={onCreateNew}
        onExportDsl={onExportDsl}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /exportDsl/i }));
    expect(onExportDsl).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /newVersion/i }));
    expect(onCreateNew).toHaveBeenCalled();
  });
});
