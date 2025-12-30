import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { indexingConfigApi } from "../lib/api";

// Hook to list all indexing configs
export function useIndexingConfigs() {
  return useQuery({
    queryKey: ["indexing-configs"],
    queryFn: async () => {
      const response = await indexingConfigApi.list();
      return response.data.data?.configs || [];
    },
  });
}

// Hook to get a single indexing config
export function useIndexingConfig(serverName: string | null) {
  return useQuery({
    queryKey: ["indexing-config", serverName],
    queryFn: async () => {
      if (!serverName) return null;
      try {
        const response = await indexingConfigApi.get(serverName);
        // Ensure we return null instead of undefined
        return response.data.data || null;
      } catch (error) {
        // Return null if config doesn't exist (404) or other errors
        console.log(`No indexing config found for ${serverName}`);
        return null;
      }
    },
    enabled: !!serverName,
  });
}

// Hook to generate a config
export function useGenerateConfig() {
  return useMutation({
    mutationFn: async (params: {
      serverName: string;
      displayName?: string;
      sampleLimit?: number;
      userGuidance?: string;
    }) => {
      const response = await indexingConfigApi.generate(params);
      return response.data.data;
    },
    // Don't invalidate queries - generation doesn't save anything to DB
    // Invalidation should only happen when saving via useSaveConfig
  });
}

// Hook to save a config
export function useSaveConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      config: any;
      status?: "draft" | "active" | "disabled";
    }) => {
      const response = await indexingConfigApi.save(params);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["indexing-configs"] });
    },
  });
}

// Hook to sync with a config
export function useSyncConfig() {
  return useMutation({
    mutationFn: async (params: {
      serverName: string;
      incremental?: boolean;
    }) => {
      const response = await indexingConfigApi.sync(params);
      return response.data.data;
    },
  });
}

// Hook to delete a config
export function useDeleteConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (serverName: string) => {
      const response = await indexingConfigApi.delete(serverName);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["indexing-configs"] });
    },
  });
}

// Hook to preview transformation
export function usePreviewTransform() {
  return useMutation({
    mutationFn: async (params: {
      config: any;
      sampleRecords: any[];
      recordTypeName: string;
    }) => {
      const response = await indexingConfigApi.preview(params);
      return response.data.data;
    },
  });
}
