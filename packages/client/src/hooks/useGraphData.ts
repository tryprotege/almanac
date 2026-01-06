import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
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

  // Track previous offset to detect changes
  const prevOffsetRef = useRef(offset);

  const {
    data: response,
    isLoading,
    error,
    refetch,
  } = useQuery({
    // Remove offset from queryKey to avoid creating separate cache entries per offset
    queryKey: ["graphData", limit, nodeTypes, relationshipTypes],
    queryFn: async () => {
      // Pass offset to the fetch function - it will use the current offset value
      const result = await graphApi.getData({
        limit,
        offset,
        nodeTypes,
        relationshipTypes,
      });
      return result.data;
    },
    enabled,
    staleTime: 0, // Don't cache - always fetch fresh data
    gcTime: 0, // Don't keep in cache after component unmounts
    retry: 2,
  });

  // Automatically refetch when offset changes (since it's not in queryKey)
  useEffect(() => {
    if (enabled && prevOffsetRef.current !== offset) {
      prevOffsetRef.current = offset;
      refetch();
    }
  }, [offset, enabled, refetch]);

  return {
    graphData: response?.data as GraphDataResponse | undefined,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
