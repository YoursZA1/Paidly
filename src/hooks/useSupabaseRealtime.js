import { useEffect, useRef } from "react";
import {
  subscribePaidlyAuxPostgres,
  subscribePaidlyProfilesRealtime,
} from "@/lib/realtime/paidlyRealtimeManager";

/**
 * Subscribe to Supabase Realtime postgres_changes for the given tables.
 * All subscriptions share one app channel via {@link paidlyRealtimeManager}.
 *
 * @param {string[]} tables - Table names (e.g. ['invoices', 'quotes'] — avoid tables owned by SyncEngine; see PAIDLY_REALTIME_SYNC_TABLES)
 * @param {(payload: { table: string, eventType: string, new: object | null, old: object | null }) => void} onPayload
 * @param {object} [opts] - { schema?: string, filter?: string }
 */
export function useSupabaseRealtime(tables, onPayload, opts = {}) {
  const schema = opts.schema ?? "public";
  const filter = opts.filter;
  const onPayloadRef = useRef(onPayload);
  onPayloadRef.current = onPayload;

  useEffect(() => {
    if (!Array.isArray(tables) || tables.length === 0) return () => {};

    const isProfilesOnly = tables.length === 1 && tables[0] === "profiles" && schema === "public";

    if (isProfilesOnly) {
      return subscribePaidlyProfilesRealtime((payload) => {
        onPayloadRef.current?.(payload);
      });
    }

    const unsubs = tables.map((table) =>
      subscribePaidlyAuxPostgres({ schema, table, filter }, (payload) => {
        onPayloadRef.current?.({
          table,
          eventType: payload.eventType,
          new: payload.new ?? null,
          old: payload.old ?? null,
        });
      })
    );
    return () => {
      unsubs.forEach((u) => u());
    };
  }, [schema, tables.join(","), filter ?? ""]);
}
