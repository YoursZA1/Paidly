import { describe, expect, it } from "vitest";
import { sanitizePostgrestSelect } from "@/lib/postgrestSelect";

describe("sanitizePostgrestSelect", () => {
  it("removes created_date and updated_date aliases", () => {
    const raw =
      "id,client_id,invoice_number,status,total_amount,currency,created_at,created_date,delivery_date,user_id,created_by";
    expect(sanitizePostgrestSelect(raw)).toBe(
      "id,client_id,invoice_number,status,total_amount,currency,created_at,delivery_date,user_id,created_by"
    );
  });
});
