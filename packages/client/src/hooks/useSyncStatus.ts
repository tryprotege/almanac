import { useQuery } from "@tanstack/react-query";
import { syncStatusApi, SyncJobStatus, SyncStatusResponse } from "../lib/api";

// Hook to get all sync statuses with polling
export function useSyncStatuses(options?: {
  enabled?: boolean;
  refetchInterval?: number;
}) {
  return useQuery({
    queryKey: ["sync-statuses"],
    queryFn: async () => {
      const response = await syncStatusApi.getAll();
      return response.data.data as SyncStatusResponse;
    },
    enabled: options?.enabled !== false,
    refetchInterval: options?.refetchInterval || 3000, // Poll every 3 seconds by default
    staleTime: 1000, // Consider data stale after 1 second
  });
}

// Hook to get sync status for a specific server
export function useSyncStatus(
  serverName: string | null,
  options?: { enabled?: boolean; refetchInterval?: number }
) {
  return useQuery({
    queryKey: ["sync-status", serverName],
    queryFn: async () => {
      if (!serverName) return null;
      const response = await syncStatusApi.getByServerName(serverName);
      return response.data.data as SyncJobStatus | null;
    },
    enabled: !!serverName && options?.enabled !== false,
    refetchInterval: options?.refetchInterval || 3000, // Poll every 3 seconds by default
    staleTime: 1000, // Consider data stale after 1 second
  });
}
