/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  portalFetchData,
  portalLogin,
  portalProcessPayment,
  portalUpdateClient,
} from "@/api/clientPortalClient";
import {
  clearPortalTabSession,
  readPortalTabSession,
  writePortalTabSession,
} from "@/lib/portalTabSession";

const ClientPortalContext = createContext(null);

export function ClientPortalProvider({ children }) {
  const [token, setToken] = useState(null);
  const [client, setClient] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const applyDocuments = useCallback((payload) => {
    const inv = Array.isArray(payload?.invoices) ? payload.invoices : [];
    const q = Array.isArray(payload?.quotes) ? payload.quotes : [];
    setInvoices(inv.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
    setQuotes(q.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
    if (payload?.client) {
      setClient(payload.client);
    }
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setClient(null);
    setInvoices([]);
    setQuotes([]);
    setError("");
    clearPortalTabSession();
  }, []);

  const refreshDocuments = useCallback(
    async (authToken) => {
      const t = authToken || token;
      if (!t) return;
      const data = await portalFetchData(t);
      applyDocuments(data);
    },
    [token, applyDocuments]
  );

  const login = useCallback(
    async (email) => {
      setIsLoading(true);
      setError("");
      try {
        const { client: clientData, token: newToken } = await portalLogin(email);
        if (!newToken || !clientData) {
          throw new Error("Invalid response from server");
        }
        setToken(newToken);
        setClient(clientData);
        writePortalTabSession({ token: newToken, email: clientData.email || email });
        const data = await portalFetchData(newToken);
        applyDocuments({ ...data, client: data.client || clientData });
      } catch (e) {
        const msg = e?.message || "Login failed";
        setError(msg);
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    [applyDocuments]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = readPortalTabSession();
      if (!saved?.token) {
        if (!cancelled) setIsBootstrapping(false);
        return;
      }
      try {
        const data = await portalFetchData(saved.token);
        if (cancelled) return;
        setToken(saved.token);
        applyDocuments(data);
      } catch {
        if (!cancelled) {
          clearPortalTabSession();
          setToken(null);
          setClient(null);
          setInvoices([]);
          setQuotes([]);
        }
      } finally {
        if (!cancelled) setIsBootstrapping(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyDocuments]);

  const updateClientProfile = useCallback(
    async (formData) => {
      if (!token || !client?.id) return;
      const { client: updated } = await portalUpdateClient(token, formData);
      setClient((c) => ({ ...c, ...updated }));
    },
    [token, client?.id]
  );

  const recordPayment = useCallback(
    async (invoiceId, amount, extra = {}) => {
      if (!token) return;
      await portalProcessPayment(token, {
        invoiceId,
        amount,
        method: extra.method || "credit_card",
        notes: extra.notes || "Online payment via client portal",
      });
      await refreshDocuments(token);
    },
    [token, refreshDocuments]
  );

  const value = useMemo(
    () => ({
      token,
      client,
      invoices,
      quotes,
      isBootstrapping,
      isLoading,
      error,
      setError,
      login,
      logout,
      refreshDocuments,
      updateClientProfile,
      recordPayment,
    }),
    [
      token,
      client,
      invoices,
      quotes,
      isBootstrapping,
      isLoading,
      error,
      login,
      logout,
      refreshDocuments,
      updateClientProfile,
      recordPayment,
    ]
  );

  return <ClientPortalContext.Provider value={value}>{children}</ClientPortalContext.Provider>;
}

export function useClientPortal() {
  const ctx = useContext(ClientPortalContext);
  if (!ctx) {
    throw new Error("useClientPortal must be used within ClientPortalProvider");
  }
  return ctx;
}
