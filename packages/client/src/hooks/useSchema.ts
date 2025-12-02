import { useQuery } from "@tanstack/react-query";
import { schemaApi, SchemaData } from "../lib/api";

export function useSchema() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["schema"],
    queryFn: async () => {
      const response = await schemaApi.get();
      return response.data.data;
    },
    staleTime: 30000, // 30 seconds
  });

  return {
    schema: data as SchemaData | undefined,
    isLoading,
    error,
    refetch,
  };
}
