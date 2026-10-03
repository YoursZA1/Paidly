// @vitest-environment jsdom
/**
 * Expense form attachments are receipts: they go to the PRIVATE receipts bucket through the same
 * server-chosen path as Scan Receipt (never the shared `activities` bucket every member — POS cashiers
 * included — could read and delete), and an upload the person abandons is removed again.
 */
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const svc = vi.hoisted(() => ({
  attachReceiptFile: vi.fn(),
  discardReceiptUpload: vi.fn(async () => {}),
  getReceiptViewUrl: vi.fn(async () => "https://signed.example/r"),
}));
vi.mock("@/services/ReceiptScanService", () => svc);
const integrations = vi.hoisted(() => ({ UploadToActivities: vi.fn(), InvokeLLM: vi.fn() }));
vi.mock("@/api/integrations", () => integrations);
vi.mock("@/api/entities", () => ({ Vendor: { list: vi.fn(async () => []) } }));
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const { default: ExpenseForm } = await import("@/components/cashflow/ExpenseForm");

let container;
let root;
const flush = async () => {
  for (let i = 0; i < 6; i += 1) await act(async () => new Promise((r) => setTimeout(r, 0)));
};
const button = (label) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === label);

async function render(props = {}) {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  await act(async () => root.render(<ExpenseForm onSave={onSave} onCancel={onCancel} {...props} />));
  await flush();
  return { onSave, onCancel };
}

async function attach(file) {
  const input = document.querySelector('input[name="expense_attachments"]');
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  await flush();
}

const PATH = "11111111-1111-4111-8111-111111111111/receipts/22222222-2222-4222-8222-222222222222/a.jpg";
const receipt = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "till-slip.jpg", { type: "image/jpeg" });

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  svc.attachReceiptFile.mockReset();
  svc.discardReceiptUpload.mockClear();
  svc.attachReceiptFile.mockResolvedValue({
    name: "till-slip.jpg",
    url: `https://x.supabase.co/storage/v1/object/authenticated/receipts/${PATH}`,
    receipt_path: PATH,
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("Expense form receipt attachments", () => {
  it("uploads to the private receipts bucket — never the shared activities bucket", async () => {
    await render();
    const input = document.querySelector('input[name="expense_attachments"]');
    expect(input.getAttribute("accept")).toBe("image/jpeg,image/png,image/webp,application/pdf");
    await attach(receipt());
    expect(svc.attachReceiptFile).toHaveBeenCalledTimes(1);
    expect(integrations.UploadToActivities).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("till-slip.jpg");
  });

  it("cancel removes receipts uploaded in this session", async () => {
    const { onCancel } = await render();
    await attach(receipt());
    await act(async () => button("Cancel").click());
    expect(svc.discardReceiptUpload).toHaveBeenCalledWith(PATH);
    expect(onCancel).toHaveBeenCalled();
  });

  it("removing a fresh attachment removes the upload; saving keeps it", async () => {
    await render();
    await attach(receipt());
    const remove = [...document.querySelectorAll("button")].find((b) => b.querySelector("svg.text-red-500"));
    await act(async () => remove.click());
    expect(svc.discardReceiptUpload).toHaveBeenCalledWith(PATH);
    expect(document.body.textContent).not.toContain("till-slip.jpg");
  });

  it("a saved expense keeps its receipt (no discard on save, nor on a later close)", async () => {
    const { onSave } = await render({ expense: { amount: "120.00", description: "Fuel", category: "travel" } });
    await attach(receipt());
    await act(async () => button("Update Expense").click());
    await flush();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].receipt_url).toContain(`/receipts/${PATH}`);
    await act(async () => button("Cancel").click());
    expect(svc.discardReceiptUpload).not.toHaveBeenCalled();
  });

  it("a file that is not a receipt image/PDF is refused, nothing attached", async () => {
    svc.attachReceiptFile.mockRejectedValueOnce(Object.assign(new Error("Use a JPG, PNG, WEBP or PDF receipt."), { code: "unsupported" }));
    await render();
    await attach(new File(["<html>"], "evil.html", { type: "text/html" }));
    expect(document.body.textContent).not.toContain("evil.html");
  });
});
