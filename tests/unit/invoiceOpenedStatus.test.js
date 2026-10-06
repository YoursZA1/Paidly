import { describe, expect, it, vi } from "vitest";
import { markInvoiceOpened } from "../../server/src/documents/invoiceOpenedStatus.js";

function supabaseFor(invoice) {
  const updates = [];
  const api = {
    from(table) {
      const query = {
        update(patch) {
          updates.push({ table, patch });
          return query;
        },
        eq() {
          return query;
        },
        is() {
          return query;
        },
        select() {
          return query;
        },
        maybeSingle: async () => ({ data: { status: "viewed" }, error: null }),
        then(resolve, reject) {
          return Promise.resolve({ error: null }).then(resolve, reject);
        },
      };
      return query;
    },
    updates,
    invoice,
  };
  return api;
}

describe("markInvoiceOpened", () => {
  it("sets a sent invoice to viewed and records the open", async () => {
    const supabase = supabaseFor();
    const row = await markInvoiceOpened(supabase, { id: "inv-1", status: "sent" });
    expect(row.status).toBe("viewed");
    expect(supabase.updates).toEqual([
      expect.objectContaining({ table: "invoices", patch: expect.objectContaining({ status: "viewed" }) }),
      expect.objectContaining({ table: "message_logs", patch: expect.objectContaining({ viewed: true }) }),
    ]);
  });

  it("leaves a paid invoice paid", async () => {
    const supabase = supabaseFor();
    const row = await markInvoiceOpened(supabase, { id: "inv-2", status: "paid" });
    expect(row.status).toBe("paid");
    expect(supabase.updates.map((entry) => entry.table)).toEqual(["message_logs"]);
  });

  it("logs a message-log failure without throwing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const supabase = {
      from(table) {
        const query = {
          update() {
            return query;
          },
          eq() {
            return query;
          },
          is() {
            return Promise.resolve({ error: { message: "nope" } });
          },
          select() {
            return query;
          },
          maybeSingle: async () => ({ data: { status: "viewed" }, error: null }),
        };
        if (table !== "message_logs") return query;
        return query;
      },
    };
    const row = await markInvoiceOpened(supabase, { id: "inv-3", status: "sent" });
    expect(row.status).toBe("viewed");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
