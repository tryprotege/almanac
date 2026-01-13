import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { syncConfigApi } from '../lib/api';

// Hook to list all sync configs
export function useSyncConfigs() {
  return useQuery({
    queryKey: ['indexing-configs'],
    queryFn: async () => {
      const response = await syncConfigApi.list();
      return response.data.data?.configs || [];
    },
  });
}

// Hook to get a single sync config
export function useSyncConfig(serverName: string | null) {
  return useQuery({
    queryKey: ['indexing-config', serverName],
    queryFn: async () => {
      if (!serverName) return null;
      try {
        const response = await syncConfigApi.get(serverName);
        // Ensure we return null instead of undefined
        return response.data.data || null;
      } catch (error) {
        // Return null if config doesn't exist (404) or other errors
        console.log(`No sync config found for ${serverName}`);
        return null;
      }
    },
    enabled: !!serverName,
  });
}

// Hook to generate a config
export function useGenerateSyncConfig() {
  return useMutation({
    mutationFn: async (params: {
      serverName: string;
      displayName?: string;
      sampleLimit?: number;
      userGuidance?: string;
    }) => {
      const response = await syncConfigApi.generate(params);
      return response.data.data;
    },
    // Don't invalidate queries - generation doesn't save anything to DB
    // Invalidation should only happen when saving via useSaveSyncConfig
  });
}

// Hook to save a config
export function useSaveSyncConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      config: any;
      status?: 'draft' | 'active' | 'disabled';
      startingPointValues?: Record<string, string[]>;
    }) => {
      const response = await syncConfigApi.save(params);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['indexing-configs'] });
    },
  });
}

// Hook to sync with a config
export function useSyncWithConfig() {
  return useMutation({
    mutationFn: async (params: { serverName: string; incremental?: boolean }) => {
      const response = await syncConfigApi.sync(params);
      return response.data.data;
    },
  });
}

// Hook to delete a config
export function useDeleteSyncConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (serverName: string) => {
      const response = await syncConfigApi.delete(serverName);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['indexing-configs'] });
    },
  });
}

// Hook to preview transformation
export function usePreviewTransform() {
  return useMutation({
    mutationFn: async (params: { config: any; sampleRecords: any[]; recordTypeName: string }) => {
      const response = await syncConfigApi.preview(params);
      return response.data.data;
    },
  });
}

// Hook to reset sync state
export function useResetSyncState() {
  return useMutation({
    mutationFn: async (serverName: string) => {
      const response = await syncConfigApi.resetSync(serverName);
      return response.data.data;
    },
  });
}

// Hook to reload config from marketplace
export function useReloadFromMarketplace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (serverName: string) => {
      const response = await syncConfigApi.reloadFromMarketplace(serverName);
      return response.data.data;
    },
    onSuccess: (data, serverName) => {
      // Invalidate the specific config and the list
      queryClient.invalidateQueries({
        queryKey: ['indexing-config', serverName],
      });
      queryClient.invalidateQueries({ queryKey: ['indexing-configs'] });
    },
  });
}
