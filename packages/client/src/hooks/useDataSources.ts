import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { DataSourceConfig, dataSourcesApi } from "../lib/api";

/**
 * Hook to fetch data source configurations with automatic polling
 * Polls every 5 seconds to get updated connection status
 */
export function useDataSources() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["data-sources"],
    queryFn: async () => {
      const response = await dataSourcesApi.list();
      return response.data.data as DataSourceConfig[];
    },
    refetchInterval: 5000, // Poll every 5 seconds
    refetchIntervalInBackground: false,
    staleTime: 4000,
  });

  return {
    servers: data || [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

/**
 * Hook to create a new data source configuration
 */
export function useCreateDataSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (
      config: Omit<DataSourceConfig, "_id" | "createdAt" | "updatedAt">
    ) => dataSourcesApi.create(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["data-sources"] });
      toast.success("Data source created successfully");
    },
    onError: (error: any) => {
      toast.error(
        error.response?.data?.error || "Failed to create data source"
      );
    },
  });
}

/**
 * Hook to update an existing data source configuration
 */
export function useUpdateDataSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      name,
      config,
    }: {
      name: string;
      config: Partial<DataSourceConfig>;
    }) => dataSourcesApi.update(name, config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["data-sources"] });
      toast.success("Data source updated successfully");
    },
    onError: (error: any) => {
      toast.error(
        error.response?.data?.error || "Failed to update data source"
      );
    },
  });
}

/**
 * Hook to delete a data source configuration
 */
export function useDeleteDataSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => dataSourcesApi.delete(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["data-sources"] });
      toast.success("Data source deleted successfully");
    },
    onError: (error: any) => {
      toast.error(
        error.response?.data?.error || "Failed to delete data source"
      );
    },
  });
}

/**
 * Hook to connect to a data source
 */
export function useConnectDataSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => dataSourcesApi.connect(name),
    onSuccess: (_, name) => {
      queryClient.invalidateQueries({ queryKey: ["data-sources"] });
      toast.success(`Connected to ${name}`);
    },
    onError: (error: any, name) => {
      toast.error(
        error.response?.data?.error || `Failed to connect to ${name}`
      );
    },
  });
}

/**
 * Hook to disconnect from a data source
 */
export function useDisconnectDataSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => dataSourcesApi.disconnect(name),
    onSuccess: (_, name) => {
      queryClient.invalidateQueries({ queryKey: ["data-sources"] });
      toast.success(`Disconnected from ${name}`);
    },
    onError: (error: any, name) => {
      toast.error(
        error.response?.data?.error || `Failed to disconnect from ${name}`
      );
    },
  });
}

/**
 * Hook to sync a data source configuration
 */
export function useSyncDataSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ configId }: { configId: string; name: string }) =>
      dataSourcesApi.sync(configId),
    onSuccess: (response, { name }) => {
      queryClient.invalidateQueries({ queryKey: ["data-sources"] });
      toast.loading(`Sync started for ${name}`);
      return response.data.data?.jobId;
    },
    onError: (error: any, { name }) => {
      toast.error(error.response?.data?.error || `Failed to sync ${name}`);
    },
  });
}

/**
 * Hook to check connection status of a data source
 */
export function useDataSourceStatus(name: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ["data-source-status", name],
    queryFn: async () => {
      const response = await dataSourcesApi.status(name);
      return response.data.data;
    },
    enabled,
    refetchInterval: 5000,
    staleTime: 4000,
  });
}
