import { parsePosSale } from "./posSaleParsers.js";
import { applyPosSaleInventory } from "./posInventorySync.js";
import { recordPosAuditEvents } from "./posAudit.js";
import {
  POS_AUDIT_ACTOR,
  posAuditInventoryAndCompletion,
  posAuditSaleCreatedAndPayment,
} from "./posAuditMath.js";

async function auditWebhookSale({
  connection,
  saleEventId,
  normalized,
  inventoryApplied,
  inventoryFailed,
  duplicate,
  inventoryJustApplied,
}) {
  if (!duplicate) {
    await recordPosAuditEvents(
      posAuditSaleCreatedAndPayment({
        orgId: connection.org_id,
        saleId: saleEventId,
        actorType: POS_AUDIT_ACTOR.WEBHOOK,
        receiptNumber: normalized.externalId,
        saleKind: "sale",
        amount: normalized.totalAmount,
        currency: normalized.currency,
        method: normalized.paymentMethod,
      })
    );
  }
  if (!duplicate || inventoryJustApplied) {
    await recordPosAuditEvents(
      posAuditInventoryAndCompletion({
        orgId: connection.org_id,
        saleId: saleEventId,
        actorType: POS_AUDIT_ACTOR.WEBHOOK,
        direction: "out",
        applied: inventoryApplied,
        failed: Boolean(inventoryFailed),
        skip: !inventoryJustApplied,
      })
    );
  }
}

/**
 * Ingest a normalized POS sale: idempotent insert + optional inventory decrement.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{
 *   connection: { id: string, org_id: string, provider: string },
 *   payload: Record<string, unknown>,
 * }} input
 */
export async function processPosWebhookSale(supabase, { connection, payload }) {
  const normalized = parsePosSale(connection.provider, payload);
  if (!normalized) {
    return { ok: false, status: 422, error: "Unrecognized or incomplete sale payload" };
  }

  const { data: existing, error: existingError } = await supabase
    .from("pos_sales_events")
    .select("id, inventory_applied, items")
    .eq("connection_id", connection.id)
    .eq("external_id", normalized.externalId)
    .maybeSingle();

  if (existingError) {
    return { ok: false, status: 500, error: existingError.message || "Duplicate lookup failed" };
  }

  if (existing?.id) {
    if (!existing.inventory_applied && normalized.items.length > 0) {
      const inventory = await applyPosSaleInventory(
        supabase,
        connection.org_id,
        existing.id,
        normalized.items
      );
      const { error: inventoryUpdateError } = await supabase
        .from("pos_sales_events")
        .update({
          inventory_applied: inventory.applied,
          inventory_result: inventory.results,
        })
        .eq("id", existing.id);
      if (inventoryUpdateError) {
        return {
          ok: false,
          status: 500,
          error: inventoryUpdateError.message || "Could not save inventory result",
          saleEventId: existing.id,
        };
      }
      await auditWebhookSale({
        connection,
        saleEventId: existing.id,
        normalized,
        inventoryApplied: inventory.applied,
        inventoryFailed: inventory.failed,
        duplicate: true,
        inventoryJustApplied: true,
      });
      return {
        ok: true,
        status: 200,
        duplicate: true,
        saleEventId: existing.id,
        inventoryApplied: inventory.applied,
        inventoryResult: inventory.results,
      };
    }
    return {
      ok: true,
      status: 200,
      duplicate: true,
      saleEventId: existing.id,
      inventoryApplied: !!existing.inventory_applied,
    };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("pos_sales_events")
    .insert({
      org_id: connection.org_id,
      connection_id: connection.id,
      external_id: normalized.externalId,
      provider: connection.provider,
      status: normalized.status,
      total_amount: normalized.totalAmount,
      currency: normalized.currency,
      payment_method: normalized.paymentMethod,
      occurred_at: normalized.occurredAt,
      items: normalized.items,
      raw_payload: payload,
      inventory_applied: false,
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return { ok: true, status: 200, duplicate: true };
    }
    return { ok: false, status: 500, error: insertError.message || "Could not record sale" };
  }

  const saleEventId = inserted.id;
  let inventoryApplied = false;
  let inventoryResult = null;
  let inventoryFailed = false;

  if (normalized.items.length > 0) {
    const inventory = await applyPosSaleInventory(
      supabase,
      connection.org_id,
      saleEventId,
      normalized.items
    );
    inventoryApplied = inventory.applied;
    inventoryResult = inventory.results;
    inventoryFailed = Boolean(inventory.failed);

    const { error: inventoryUpdateError } = await supabase
      .from("pos_sales_events")
      .update({
        inventory_applied: inventoryApplied,
        inventory_result: inventoryResult,
      })
      .eq("id", saleEventId);

    if (inventoryUpdateError) {
      console.error("[pos-sale] inventory metadata update failed", inventoryUpdateError.message);
      return {
        ok: false,
        status: 500,
        error: inventoryUpdateError.message || "Could not save inventory result",
        saleEventId,
      };
    }
  }

  await auditWebhookSale({
    connection,
    saleEventId,
    normalized,
    inventoryApplied,
    inventoryFailed,
    duplicate: false,
    inventoryJustApplied: normalized.items.length > 0,
  });

  const { error: connectionUpdateError } = await supabase
    .from("pos_connections")
    .update({ last_event_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", connection.id);

  if (connectionUpdateError) {
    console.error("[pos-sale] connection last_event_at update failed", connectionUpdateError.message);
    return {
      ok: false,
      status: 500,
      error: connectionUpdateError.message || "Could not update connection",
      saleEventId,
    };
  }

  return {
    ok: true,
    status: 201,
    saleEventId,
    inventoryApplied,
    inventoryResult,
  };
}
