import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SortState, FilterState } from "../components/DataTable";
import type { ApiResponse } from "../backend/request";
import { useOrganization } from "../OrganizationContext";

interface UseEntityListOptions<T> {
  queryKey: string;
  fetchFn: (params: {
    owner: string;
    p: number;
    pageSize: number;
    sortField?: string;
    sortOrder?: string;
    field?: string;
    value?: string;
  }) => Promise<ApiResponse<T[]>>;
  /** Explicit owner override. If omitted, uses the org selector value. */
  owner?: string;
  pageSize?: number;
  /** Extra values to include in the query key for cache differentiation */
  extraKeys?: unknown[];
}

export function useEntityList<T>({ queryKey, fetchFn, owner: explicitOwner, pageSize = 10, extraKeys = [] }: UseEntityListOptions<T>) {
  const { getRequestOwner, selectedOrg } = useOrganization();
  const owner = explicitOwner ?? getRequestOwner();

  const [page, setPage] = useState(1);
  const [sortState, setSortState] = useState<SortState>({ field: "", order: "" });
  const [filterState, setFilterState] = useState<FilterState>({ field: "", value: "" });
  const queryClient = useQueryClient();

  // Reset to page 1 when org changes
  useEffect(() => { setPage(1); }, [selectedOrg]);

  const { data: res, isLoading, isFetching } = useQuery({
    queryKey: [queryKey, owner, page, pageSize, sortState, filterState, ...extraKeys],
    queryFn: () =>
      fetchFn({
        owner,
        p: page,
        pageSize,
        sortField: sortState.field || undefined,
        sortOrder: sortState.order || undefined,
        field: filterState.value ? filterState.field : undefined,
        value: filterState.value || undefined,
      }),
  });

  const items = res?.status === "ok" && Array.isArray(res.data) ? res.data : [];
  const total = res?.status === "ok"
    ? (typeof res.data2 === "number" ? res.data2 : items.length)
    : 0;

  const refetch = () => queryClient.invalidateQueries({ queryKey: [queryKey] });

  const handleSort = (s: SortState) => { setSortState(s); setPage(1); };
  const handleFilter = (f: FilterState) => { setFilterState(f); setPage(1); };

  return {
    items,
    total,
    page,
    pageSize,
    loading: isLoading,
    fetching: isFetching,
    setPage,
    sortState,
    filterState,
    handleSort,
    handleFilter,
    refetch,
  };
}
