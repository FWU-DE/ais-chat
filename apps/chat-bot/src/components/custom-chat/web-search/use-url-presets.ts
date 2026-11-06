import { useQuery } from '@tanstack/react-query';

import { getAllUrlPresetsAction } from './web-search-actions';

export function useUrlPresets() {
  return useQuery({
    queryKey: ['web-search-url-presets'],
    queryFn: async () => {
      const result = await getAllUrlPresetsAction();
      if (!result.success) {
        throw new Error(result.error.message);
      }
      return result.value;
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
