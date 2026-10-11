// Public entry point for DataTable. The component lives in DataTableView.tsx
// and the persisted-prefs hook in tablePrefs.ts so that each module satisfies
// react-refresh's "components only" export rule.
export { default, ColumnsMenu } from "./DataTableView";
export type { Column, FilterState, BulkActionContext } from "./DataTableView";
export { useTablePrefs } from "./tablePrefs";
export type { SortState, TablePrefs } from "./tablePrefs";
