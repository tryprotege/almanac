import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  modelConfigApi,
  ModelConfigData,
  TestConnectionRequest,
} from "../lib/api";

export function useModelConfig() {
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["modelConfig"],
    queryFn: async () => {
      const response = await modelConfigApi.get();
      return response.data.data;
    },
    staleTime: 30000, // 30 seconds
  });

  const updateMutation = useMutation({
    mutationFn: (config: Partial<ModelConfigData>) =>
      modelConfigApi.update(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["modelConfig"] });
      toast.success("Model configuration updated successfully");
    },
    onError: (error: any) => {
      toast.error(
        error.response?.data?.error || "Failed to update model configuration"
      );
    },
  });

  const testMutation = useMutation({
    mutationFn: (testConfig: TestConnectionRequest) =>
      modelConfigApi.test(testConfig),
    onSuccess: (response) => {
      toast.success(
        `Connection test successful! Model: ${response.data.data?.model}`
      );
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Connection test failed");
    },
  });

  return {
    config: data,
    isLoading,
    error,
    refetch,
    updateConfig: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
    testConnection: testMutation.mutate,
    isTesting: testMutation.isPending,
    testSuccess: testMutation.isSuccess,
    testError: testMutation.isError,
  };
}
