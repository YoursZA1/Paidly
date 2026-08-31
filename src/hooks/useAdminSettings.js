import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authedApiRequest } from '@/lib/authedApiRequest';

const DEFAULT_SETTINGS = {
  system: {
    siteName: 'Paidly',
    supportEmail: 'support@paidly.co.za',
    maintenanceMode: false,
  },
};

export function useAdminSettings() {
  const query = useQuery({
    queryKey: ['admin-settings'],
    queryFn: async () => {
      const res = await authedApiRequest('/api/admin/settings', {
        method: 'GET',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || json?.message || `Settings load failed (${res.status})`);
      }
      return json?.settings || null;
    },
    staleTime: 30000,
  });

  const settings = useMemo(() => {
    if (!query.data || typeof query.data !== 'object') return DEFAULT_SETTINGS;
    const system = query.data.system && typeof query.data.system === 'object' ? query.data.system : {};
    return {
      ...DEFAULT_SETTINGS,
      system: { ...DEFAULT_SETTINGS.system, ...system },
    };
  }, [query.data]);

  return {
    ...query,
    settings,
  };
}

export default useAdminSettings;
