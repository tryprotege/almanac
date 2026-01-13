import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { personaApi } from '../lib/api';
import toast from 'react-hot-toast';

export function usePersona() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['persona'],
    queryFn: async () => {
      const response = await personaApi.get();
      return response.data.data;
    },
    retry: 1,
  });

  const updateMutation = useMutation({
    mutationFn: (persona: string) => personaApi.update(persona),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['persona'] });
      toast.success('Persona updated successfully');
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || 'Failed to update persona';
      toast.error(errorMessage);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => personaApi.delete(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['persona'] });
      toast.success('Persona cleared');
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || 'Failed to clear persona';
      toast.error(errorMessage);
    },
  });

  return {
    persona: data?.persona || '',
    updatedAt: data?.updatedAt,
    isLoading,
    error,
    updatePersona: updateMutation.mutate,
    deletePersona: deleteMutation.mutate,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
