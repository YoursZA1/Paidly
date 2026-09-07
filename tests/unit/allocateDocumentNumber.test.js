import { describe, expect, it, vi } from "vitest";
import {
  allocateDocumentNumber,
  resolveDocumentNumberAllocation,
} from "@/document-engine/allocateDocumentNumber";

describe("resolveDocumentNumberAllocation", () => {
  it("skips the RPC when a custom number is present", () => {
    expect(resolveDocumentNumberAllocation({ docType: "invoice", customNumber: " INV-CUSTOM " })).toEqual({
      mode: "custom",
      number: "INV-CUSTOM",
    });
  });

  it("plans an invoice RPC", () => {
    expect(resolveDocumentNumberAllocation({ docType: "invoice" })).toEqual({
      mode: "rpc",
      docType: "invoice",
      prefix: "INV",
    });
  });

  it("plans a quote RPC", () => {
    expect(resolveDocumentNumberAllocation({ docType: "quote" })).toEqual({
      mode: "rpc",
      docType: "quote",
      prefix: "QUO",
    });
  });
});

describe("allocateDocumentNumber", () => {
  it("returns the custom number without calling rpc", async () => {
    const rpc = vi.fn();
    await expect(
      allocateDocumentNumber({ orgId: "org-1", docType: "invoice", customNumber: "INV-9", rpc })
    ).resolves.toBe("INV-9");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls next_document_number for invoices", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "INV-1001", error: null });
    await expect(
      allocateDocumentNumber({ orgId: "org-1", docType: "invoice", rpc })
    ).resolves.toBe("INV-1001");
    expect(rpc).toHaveBeenCalledWith("next_document_number", {
      p_org_id: "org-1",
      p_doc_type: "invoice",
      p_prefix: "INV",
    });
  });

  it("calls next_document_number for quotes", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "QUO-1001", error: null });
    await expect(
      allocateDocumentNumber({ orgId: "org-1", docType: "quote", rpc })
    ).resolves.toBe("QUO-1001");
    expect(rpc).toHaveBeenCalledWith("next_document_number", {
      p_org_id: "org-1",
      p_doc_type: "quote",
      p_prefix: "QUO",
    });
  });

  it("throws without an org id", async () => {
    await expect(allocateDocumentNumber({ docType: "invoice", rpc: vi.fn() })).rejects.toThrow(/org_id/i);
  });
});
