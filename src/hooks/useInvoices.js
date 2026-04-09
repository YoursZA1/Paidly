import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export const useInvoices = (user) => {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchInvoices = useCallback(async () => {
    if (!user?.id) {
      setInvoices([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.from("invoices").select("*").eq("user_id", user.id);

    if (!error) {
      setInvoices(Array.isArray(data) ? data : []);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void fetchInvoices();
  }, [fetchInvoices]);

  return { invoices, loading, refetch: fetchInvoices };
};
