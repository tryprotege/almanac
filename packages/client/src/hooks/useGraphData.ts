import { useQuery } from "@tanstack/react-query";
import { graphApi, GraphDataResponse } from "../lib/api";

interface UseGraphDataOptions {
  limit?: number;
  offset?: number;
  nodeTypes?: string[];
  relationshipTypes?: string[];
  enabled?: boolean;
}

export function useGraphData(options?: UseGraphDataOptions) {
  const {
    limit = 100,
    offset = 0,
    nodeTypes,
    relationshipTypes,
    enabled = true,
  } = options || {};

  const {
    data: response,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["graphData", limit, offset, nodeTypes, relationshipTypes],
    queryFn: async () => {
      const result = await graphApi.getData({
        limit,
        offset,
        nodeTypes,
        relationshipTypes,
      });
      return result.data;
    },
    enabled,
    staleTime: 30000, // 30 seconds
    retry: 2,
  });

  return {
    graphData: response?.data as GraphDataResponse | undefined,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
