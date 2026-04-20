import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

const DEFAULT_SETTINGS = {
  system: {
    siteName: 'Paidly',
    supportEmail: 'support@paidly.co.za',
    maintenanceMode: false,
  },
  affiliateProgram: {
    defaultCommissionPercent: 15,
    autoApproveApplications: false,
  },
};

export function getAffiliateDefaultCommissionFromSettings(settings) {
  const raw = Number(settings?.affiliateProgram?.defaultCommissionPercent);
  if (!Number.isFinite(raw) || raw < 0) return 15;
  return Math.min(100, raw);
}

export function useAdminSettings() {
  const query = useQuery({
    queryKey: ['admin-settings'],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error('Not authenticated');
      const res = await fetch('/api/admin/settings', {
        headers: { Authorization: `Bearer ${token}` },
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
    const affiliateProgram =
      query.data.affiliateProgram && typeof query.data.affiliateProgram === 'object'
        ? query.data.affiliateProgram
        : {};
    return {
      ...DEFAULT_SETTINGS,
      system: { ...DEFAULT_SETTINGS.system, ...system },
      affiliateProgram: { ...DEFAULT_SETTINGS.affiliateProgram, ...affiliateProgram },
    };
  }, [query.data]);

  return {
    ...query,
    settings,
    affiliateDefaultCommissionPercent: getAffiliateDefaultCommissionFromSettings(settings),
  };
}

export default useAdminSettings;
