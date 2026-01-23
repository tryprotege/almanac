import { useQuery } from '@tanstack/react-query';
import { syncStatusApi, SyncStatusResponse } from '../lib/api';

// Hook to get all sync statuses with polling
export function useSyncStatuses(options?: { enabled?: boolean; refetchInterval?: number }) {
  return useQuery({
    queryKey: ['sync-statuses'],
    queryFn: async () => {
      const response = await syncStatusApi.getAll();
      return response.data.data as SyncStatusResponse;
    },
    enabled: options?.enabled !== false,
    refetchInterval: options?.refetchInterval || 3000, // Poll every 3 seconds by default
    staleTime: 1000, // Consider data stale after 1 second
  });
}
