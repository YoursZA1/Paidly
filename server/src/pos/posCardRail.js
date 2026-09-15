import { supabaseAdmin } from "../supabaseAdmin.js";

function isActive(row) {
  return String(row?.status || "").trim().toLowerCase() === "active";
}

function publicRail(rail) {
  if (!rail) {
    return {
      id: "paidly_pay",
      label: "Paidly Pay",
      device_name: null,
      connection_id: null,
      device_id: null,
      action: "tap_to_pay",
    };
  }
  return {
    id: rail.id,
    label: rail.label,
    device_name: rail.device_name || null,
    connection_id: rail.connection_id || null,
    device_id: rail.device_id || null,
    action: rail.action,
  };
}

/**
 * Pick the card rail the native till should show.
 * Paired Paidly Pay devices win, then Yoco/Square connections created in POS
 * Integrations, then the native Paidly POS connection.
 */
export function pickTillCardRail({ connections = [], devices = [] } = {}) {
  const activeDevices = devices.filter(isActive);
  const device = activeDevices[0];
  if (device) {
    return publicRail({
      id: "paidly_pay",
      label: "Paidly Pay",
      device_name: device.device_name || device.deviceName || null,
      device_id: device.id,
      action: "tap_to_pay",
    });
  }

  const activeConnections = connections.filter(isActive);
  const yoco = activeConnections.find((row) => row.provider === "yoco");
  if (yoco) {
    return publicRail({
      id: "yoco",
      label: yoco.label || "Yoco",
      connection_id: yoco.id,
      action: "reader",
    });
  }
  const square = activeConnections.find((row) => row.provider === "square");
  if (square) {
    return publicRail({
      id: "square",
      label: square.label || "Square",
      connection_id: square.id,
      action: "reader",
    });
  }

  const paidly = activeConnections.find((row) => row.provider === "paidly");
  return publicRail({
    id: "paidly_pay",
    label: "Paidly Pay",
    connection_id: paidly?.id || null,
    action: "tap_to_pay",
  });
}

async function loadActiveConnections(orgId) {
  const { data, error } = await supabaseAdmin
    .from("pos_connections")
    .select("id, provider, label, status")
    .eq("org_id", orgId)
    .eq("status", "active");
  if (error && /pos_connections|schema cache|does not exist/i.test(error.message || "")) {
    return [];
  }
  if (error) throw error;
  return data || [];
}

async function loadActiveDevices(orgId) {
  const { data, error } = await supabaseAdmin
    .from("paidly_devices")
    .select("id, device_name, status, last_seen_at")
    .eq("org_id", orgId)
    .eq("status", "active")
    .order("last_seen_at", { ascending: false });
  if (error && /paidly_devices|schema cache|does not exist/i.test(error.message || "")) {
    return [];
  }
  if (error) throw error;
  return data || [];
}

export async function resolveTillCardRail(orgId) {
  const [connections, devices] = await Promise.all([
    loadActiveConnections(orgId),
    loadActiveDevices(orgId),
  ]);
  return pickTillCardRail({ connections, devices });
}
