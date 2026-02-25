import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

/**
 * Subscribe to Supabase Realtime postgres_changes for the given tables.
 * Use for live updates (e.g. invoice status changes, new payments).
 * RLS applies: you only receive events for rows you can select.
 *
 * @param {string[]} tables - Table names (e.g. ['invoices', 'quotes', 'payments', 'clients'])
 * @param {(payload: { table: string, eventType: string, new: object | null, old: object | null }) => void} onPayload - Called on INSERT/UPDATE/DELETE
 * @param {object} [opts] - Optional: { schema: 'public', channelName: string }
 */
export function useSupabaseRealtime(tables, onPayload, opts = {}) {
  const schema = opts.schema ?? "public";
  const channelName = opts.channelName ?? "realtime-db-changes";
  const onPayloadRef = useRef(onPayload);
  onPayloadRef.current = onPayload;

  useEffect(() => {
    if (!Array.isArray(tables) || tables.length === 0) return () => {};

    const channel = supabase.channel(channelName);

    tables.forEach((table) => {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema,
          table,
        },
        (payload) => {
          const { eventType, new: newRecord, old: oldRecord } = payload;
          onPayloadRef.current?.({
            table,
            eventType,
            new: newRecord ?? null,
            old: oldRecord ?? null,
          });
        }
      );
    });

    channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        console.warn("[useSupabaseRealtime] channel error; ensure tables are in supabase_realtime publication.");
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [schema, channelName, tables.join(",")]);
}
