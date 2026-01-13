import { useQuery } from '@tanstack/react-query';
import { OverviewStats, statsApi } from '../lib/api';

/**
 * Hook to fetch overview statistics with automatic polling
 * Polls every 5 seconds when the component is mounted
 */
export function useStats() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['stats', 'overview'],
    queryFn: async () => {
      const response = await statsApi.overview();
      return response.data.data as OverviewStats;
    },
    refetchInterval: 5000, // Poll every 5 seconds
    refetchIntervalInBackground: false, // Stop polling when tab is inactive
    staleTime: 4000, // Consider data stale after 4 seconds
  });

  return {
    stats: data,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
