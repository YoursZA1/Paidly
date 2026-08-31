/**
 * On-screen / PDF-capture receipt. Same fields as server/src/pos/posReceipt.js.
 * Not an invoice template.
 */
import { formatReceiptMoney } from "../../../server/src/pos/posReceipt.js";

export default function PosReceiptSheet({ view }) {
  if (!view) return null;
  const money = (n) => formatReceiptMoney(n, view.currency);

  return (
    <div className="bg-white p-6 text-zinc-900" data-pos-receipt="true">
      {view.logoUrl ? (
        <img src={view.logoUrl} alt="" className="mb-3 h-12 w-auto object-contain" />
      ) : null}
      <h1 className="text-lg font-semibold">{view.brandName}</h1>
      <p className="mt-1 text-sm font-medium">
        {view.kindLabel} {view.saleNumber}
      </p>
      {view.occurredLabel ? <p className="text-sm text-zinc-600">{view.occurredLabel}</p> : null}
      {view.cashierName ? <p className="text-sm text-zinc-600">Staff: {view.cashierName}</p> : null}
      {view.customerName ? <p className="text-sm text-zinc-600">Customer: {view.customerName}</p> : null}

      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-[11px] uppercase tracking-wide text-zinc-500">
            <th className="py-1.5">Product</th>
            <th className="py-1.5 text-center">Qty</th>
            <th className="py-1.5 text-right">Price</th>
            <th className="py-1.5 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {(view.items || []).map((item, index) => (
            <tr key={`${item.name}-${index}`} className="border-b border-zinc-100">
              <td className="py-1.5">{item.name}</td>
              <td className="py-1.5 text-center tabular-nums">{item.quantity}</td>
              <td className="py-1.5 text-right tabular-nums">{money(item.unitPrice)}</td>
              <td className="py-1.5 text-right tabular-nums">{money(item.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} className="pt-3 text-zinc-600">
              Subtotal
            </td>
            <td className="pt-3 text-right tabular-nums">{money(view.subtotal)}</td>
          </tr>
          <tr>
            <td colSpan={3} className="text-zinc-600">
              Discount
            </td>
            <td className="text-right tabular-nums">{money(view.discountAmount)}</td>
          </tr>
          <tr>
            <td colSpan={3} className="text-zinc-600">
              Tax
            </td>
            <td className="text-right tabular-nums">{money(view.taxAmount)}</td>
          </tr>
          <tr>
            <td colSpan={3} className="pt-1 text-base font-semibold">
              {view.isReturn ? "Refund" : "Total"}
            </td>
            <td className="pt-1 text-right text-base font-semibold tabular-nums">{money(view.total)}</td>
          </tr>
          {view.paymentLabel ? (
            <tr>
              <td colSpan={3} className="text-zinc-600">
                Payment
              </td>
              <td className="text-right">{view.paymentLabel}</td>
            </tr>
          ) : null}
          {view.amountTendered != null ? (
            <tr>
              <td colSpan={3} className="text-zinc-600">
                Tendered
              </td>
              <td className="text-right tabular-nums">{money(view.amountTendered)}</td>
            </tr>
          ) : null}
          {view.changeDue != null ? (
            <tr>
              <td colSpan={3} className="text-zinc-600">
                Change
              </td>
              <td className="text-right font-semibold tabular-nums">{money(view.changeDue)}</td>
            </tr>
          ) : null}
        </tfoot>
      </table>
      <p className="mt-4 text-xs text-zinc-500">{view.notice}</p>
      <p className="text-sm">Thank you</p>
    </div>
  );
}
