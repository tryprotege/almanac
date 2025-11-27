import { useQuery } from "@tanstack/react-query";
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
