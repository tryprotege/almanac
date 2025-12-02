import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { MCPServerConfig, mcpServersApi } from "../lib/api";

/**
 * Hook to fetch MCP server configurations with automatic polling
 * Polls every 5 seconds to get updated connection status
 */
export function useMCPServers() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["mcp-servers"],
    queryFn: async () => {
      const response = await mcpServersApi.list();
      return response.data.data as MCPServerConfig[];
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
 * Hook to create a new MCP server configuration
 */
export function useCreateMCPServer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (config: Omit<MCPServerConfig, "createdAt" | "updatedAt">) =>
      mcpServersApi.create(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
      toast.success("MCP server created successfully");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Failed to create MCP server");
    },
  });
}

/**
 * Hook to update an existing MCP server configuration
 */
export function useUpdateMCPServer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      name,
      config,
    }: {
      name: string;
      config: Partial<MCPServerConfig>;
    }) => mcpServersApi.update(name, config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
      toast.success("MCP server updated successfully");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Failed to update MCP server");
    },
  });
}

/**
 * Hook to delete an MCP server configuration
 */
export function useDeleteMCPServer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => mcpServersApi.delete(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
      toast.success("MCP server deleted successfully");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Failed to delete MCP server");
    },
  });
}

/**
 * Hook to connect to an MCP server
 */
export function useConnectMCPServer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => mcpServersApi.connect(name),
    onSuccess: (_, name) => {
      queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
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
 * Hook to disconnect from an MCP server
 */
export function useDisconnectMCPServer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => mcpServersApi.disconnect(name),
    onSuccess: (_, name) => {
      queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
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
 * Hook to sync an MCP server configuration
 */
export function useSyncMCPServer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ configId }: { configId: string; name: string }) =>
      mcpServersApi.sync(configId),
    onSuccess: (response, { name }) => {
      queryClient.invalidateQueries({ queryKey: ["mcp-servers"] });
      // Don't show success toast immediately - let the component handle it when job completes
      // Return the jobId for the component to use
      return response.data.data?.jobId;
    },
    onError: (error: any, { name }) => {
      toast.error(error.response?.data?.error || `Failed to sync ${name}`);
    },
  });
}

/**
 * Hook to check connection status of an MCP server
 */
export function useMCPServerStatus(name: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ["mcp-server-status", name],
    queryFn: async () => {
      const response = await mcpServersApi.status(name);
      return response.data.data;
    },
    enabled,
    refetchInterval: 5000,
    staleTime: 4000,
  });
}
