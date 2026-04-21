import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiResponse } from "../backend/request";

interface UseEntityEditOptions<T> {
  queryKey: string;
  owner: string | undefined;
  name: string | undefined;
  fetchFn: (owner: string, name: string) => Promise<ApiResponse<T>>;
}

export function useEntityEdit<T>({ queryKey, owner, name, fetchFn }: UseEntityEditOptions<T>) {
  const queryClient = useQueryClient();

  const { data: res, isLoading } = useQuery({
    queryKey: [queryKey, owner, name],
    queryFn: () => fetchFn(owner!, name!),
    enabled: !!owner && !!name,
  });

  const entity = res?.status === "ok" ? res.data : null;

  // Invalidate this single entity's cache
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [queryKey, owner, name] });

  // Invalidate the corresponding list cache (plural key, e.g. "ticket" -> "tickets")
  // This ensures the list page shows fresh data after save/delete
  const invalidateList = () => {
    // Convention: list queryKey is the plural form (e.g. "tickets", "users", "roles")
    // The entity queryKey is singular (e.g. "ticket", "user", "role")
    // We invalidate both the plural form and any queryKey starting with the base key
    const listKey = queryKey.endsWith("s") ? queryKey : `${queryKey}s`;
    queryClient.invalidateQueries({ queryKey: [listKey] });
  };

  return { entity, loading: isLoading, invalidate, invalidateList };
}
