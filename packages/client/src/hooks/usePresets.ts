import { useQuery } from '@tanstack/react-query';
import { presetsApi } from '../lib/api';

export function usePresets() {
  return useQuery({
    queryKey: ['presets'],
    queryFn: () => presetsApi.list(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function usePreset(presetId: string | null) {
  return useQuery({
    queryKey: ['presets', presetId],
    queryFn: () => (presetId ? presetsApi.get(presetId) : null),
    enabled: !!presetId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
