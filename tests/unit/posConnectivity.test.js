import { describe, expect, it } from "vitest";
import {
  POS_CONNECTIVITY,
  POS_OFFLINE_QUEUE_SUPPORTED,
  derivePosConnectivity,
  posCheckoutAllowed,
  posOfflineCheckoutMessage,
  posServerWriteAllowed,
} from "@/lib/pos/posConnectivity";

describe("POS connectivity policy", () => {
  it("does not claim a safe offline till queue on the invoice SyncEngine", () => {
    expect(POS_OFFLINE_QUEUE_SUPPORTED).toBe(false);
  });

  it("is online only when the browser and session are reachable", () => {
    expect(
      derivePosConnectivity({
        navigatorOnline: true,
        connectionStatus: "connected",
        sessionStatus: "connected",
      })
    ).toBe(POS_CONNECTIVITY.ONLINE);
  });

  it("treats browser offline as offline even if stores still say connected", () => {
    expect(
      derivePosConnectivity({
        navigatorOnline: false,
        connectionStatus: "connected",
        sessionStatus: "connected",
      })
    ).toBe(POS_CONNECTIVITY.OFFLINE);
  });

  it("does not allow checkout while reconnecting or offline", () => {
    expect(posCheckoutAllowed(POS_CONNECTIVITY.ONLINE)).toBe(true);
    expect(posCheckoutAllowed(POS_CONNECTIVITY.RECONNECTING)).toBe(false);
    expect(posCheckoutAllowed(POS_CONNECTIVITY.OFFLINE)).toBe(false);
    expect(posServerWriteAllowed(POS_CONNECTIVITY.OFFLINE)).toBe(false);
  });

  it("explains that cash is not queued and card/digital cannot complete offline", () => {
    const offline = posOfflineCheckoutMessage(POS_CONNECTIVITY.OFFLINE);
    expect(offline).toMatch(/cash is not queued/i);
    expect(offline).toMatch(/card and digital/i);
    expect(posOfflineCheckoutMessage(POS_CONNECTIVITY.ONLINE)).toBeNull();
  });
});
