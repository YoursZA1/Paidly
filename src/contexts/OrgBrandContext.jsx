import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import useCompanyContext from "@/hooks/useCompanyContext";
import { PERMISSIONS } from "@/lib/companyPermissions";
import { OrgBrandService } from "@/services/OrgBrandService";
import {
  readActiveBrandId,
  writeActiveBrandId,
  reconcileStoredBrandId,
  normalizeBrandId,
} from "@/lib/orgBrandStorage";

const OrgBrandContext = createContext(null);

export function OrgBrandProvider({ children }) {
  const { companyId: orgId, loading: orgLoading, hasPermission } = useCompanyContext();
  const [brands, setBrands] = useState([]);
  const [activeBrandId, setActiveBrandIdState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const canManageBrands = hasPermission(PERMISSIONS.MANAGE_COMPANY_SETTINGS);

  const refresh = useCallback(async () => {
    if (!orgId) {
      setBrands([]);
      setActiveBrandIdState(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await OrgBrandService.list();
      setBrands(rows);
      const nextId = reconcileStoredBrandId(readActiveBrandId(orgId), rows);
      setActiveBrandIdState(nextId);
      writeActiveBrandId(orgId, nextId);
    } catch (e) {
      setError(e?.message || String(e));
      setBrands([]);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (orgLoading) return;
    void refresh();
  }, [orgLoading, refresh]);

  const setActiveBrandId = useCallback(
    (brandId) => {
      const next = normalizeBrandId(brandId);
      const reconciled = reconcileStoredBrandId(next, brands);
      setActiveBrandIdState(reconciled);
      if (orgId) writeActiveBrandId(orgId, reconciled);
    },
    [brands, orgId]
  );

  const activeBrand = useMemo(
    () => brands.find((row) => row.id === activeBrandId) || null,
    [brands, activeBrandId]
  );

  const value = useMemo(
    () => ({
      loading: orgLoading || loading,
      error,
      orgId,
      brands,
      activeBrandId,
      activeBrand,
      setActiveBrandId,
      canManageBrands,
      refresh,
    }),
    [
      orgLoading,
      loading,
      error,
      orgId,
      brands,
      activeBrandId,
      activeBrand,
      setActiveBrandId,
      canManageBrands,
      refresh,
    ]
  );

  return <OrgBrandContext.Provider value={value}>{children}</OrgBrandContext.Provider>;
}

export function useOrgBrands() {
  const value = useContext(OrgBrandContext);
  if (!value) {
    throw new Error("useOrgBrands must be used within OrgBrandProvider");
  }
  return value;
}

export default useOrgBrands;
