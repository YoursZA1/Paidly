import { describe, expect, it } from "vitest";
import { pickTillCardRail } from "../../server/src/pos/posCardRail.js";

describe("pickTillCardRail", () => {
  it("uses a paired Paidly Pay device before other POS connections", () => {
    expect(
      pickTillCardRail({
        devices: [{ id: "dev-1", device_name: "Counter 1", status: "active" }],
        connections: [{ id: "y1", provider: "yoco", status: "active", label: "Yoco store" }],
      })
    ).toEqual({
      id: "paidly_pay",
      label: "Paidly Pay",
      device_name: "Counter 1",
      connection_id: null,
      device_id: "dev-1",
      action: "tap_to_pay",
    });
  });

  it("recognizes an active Yoco connection from POS Integrations", () => {
    const rail = pickTillCardRail({
      connections: [{ id: "y1", provider: "yoco", status: "active", label: "Front desk Yoco" }],
    });
    expect(rail.id).toBe("yoco");
    expect(rail.label).toBe("Front desk Yoco");
    expect(rail.action).toBe("reader");
  });

  it("recognizes an active Square connection from POS Integrations", () => {
    const rail = pickTillCardRail({
      connections: [{ id: "s1", provider: "square", status: "active", label: "Square till" }],
    });
    expect(rail.id).toBe("square");
    expect(rail.action).toBe("reader");
  });

  it("defaults the native till to Paidly Pay", () => {
    const rail = pickTillCardRail({
      connections: [{ id: "p1", provider: "paidly", status: "active", label: "Paidly POS" }],
    });
    expect(rail).toMatchObject({
      id: "paidly_pay",
      label: "Paidly Pay",
      connection_id: "p1",
      action: "tap_to_pay",
    });
  });

  it("ignores revoked devices and disabled connections", () => {
    const rail = pickTillCardRail({
      devices: [{ id: "dev-2", device_name: "Old phone", status: "revoked" }],
      connections: [{ id: "y2", provider: "yoco", status: "disabled", label: "Yoco" }],
    });
    expect(rail.id).toBe("paidly_pay");
    expect(rail.device_id).toBeNull();
  });
});
