import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { format, isValid, parseISO } from "date-fns";
import { formatCurrency } from "@/components/CurrencySelector";
import { resolveDocumentBrandColors } from "@/utils/documentBrandColors";
import { mergeLiveBrandingForDocuments } from "@/utils/documentPreviewData";
import { resolveIssuerLogoPath, resolveIssuerName } from "@/lib/documentIssuerBrand";
import { useAuth } from "@/contexts/AuthContext";
import { formatLineItemNameAndDescription } from "@/utils/invoiceTemplateData";
import { effectiveBankingDetail } from "@/utils/effectiveBankingDetail";
import { formatDocumentPreviewBankingLines } from "@/utils/formatDocumentPreviewBankingLines";
import {
  CONTENT_HEIGHT_PX,
  PAGE_OVERFLOW_SAFETY_PX,
  createBlock,
  pageBlockRuns,
  paginateMeasuredDocument,
  splitFlowableText,
} from "@/lib/documentPdf";
import { waitForPdfAssets } from "@/lib/documentPdf/waitForPdfDocumentReady";
import {
  BillToDates,
  BrandBar,
  ContinuationHeader,
  FirstHeader,
  LineItemRow,
  LineItemsTable,
  LineItemsTableHeader,
  NotesBlock,
  PageFooter,
  TermsHeading,
  TermsPart,
  TotalsPaymentBlock,
} from "@/components/documentPdf/PaidlyDocumentSections";
import "@/components/documentPdf/paidlyDocumentPages.css";

function safeFormatDate(value) {
  if (!value) return "—";
  try {
    const d =
      typeof value === "string"
        ? parseISO(value.includes("T") ? value : `${value}T12:00:00`)
        : value instanceof Date
          ? value
          : new Date(value);
    return isValid(d) ? format(d, "MMMM dd, yyyy") : "—";
  } catch {
    return "—";
  }
}

function normalizeDocType(doc, docTypeProp) {
  const t = (docTypeProp || doc?.type || "invoice").toString().toLowerCase();
  if (t === "quote" || t === "quotes") return "quote";
  return "invoice";
}

function isDiscountItem(it) {
  const name = String(it?.service_name || it?.name || "").trim();
  const tp = Number(it?.total_price ?? it?.total ?? 0);
  return /^discount$/i.test(name) && tp < 0;
}

/** Rows for the line-items table (no synthetic discount line — discount is in totals). */
function normalizeLineItems(doc) {
  if (Array.isArray(doc?.line_items) && doc.line_items.length > 0) {
    return doc.line_items
      .map((row) => {
        const qty = Number(row.quantity) || 0;
        const unit = Number(row.unit_price) || 0;
        const total =
          row.total != null && row.total !== ""
            ? Number(row.total)
            : Math.round(qty * unit * 100) / 100;
        const desc = formatLineItemNameAndDescription(row);
        return { description: desc, quantity: qty || 1, unit_price: unit, total };
      })
      .filter((row) => row.description || row.unit_price || row.quantity !== 1 || row.total);
  }

  if (Array.isArray(doc?.items) && doc.items.length > 0) {
    return doc.items
      .filter((it) => !isDiscountItem(it))
      .map((it) => {
        const qty = Number(it.quantity ?? it.qty ?? 1) || 1;
        const unit = Number(it.unit_price ?? it.rate ?? it.price ?? 0) || 0;
        const rawTotal = it.total_price ?? it.total;
        const hasExplicitTotal =
          rawTotal != null && rawTotal !== "" && !Number.isNaN(Number(rawTotal));
        const total = hasExplicitTotal
          ? Number(rawTotal)
          : Math.round(qty * unit * 100) / 100;
        const desc = formatLineItemNameAndDescription(it) || "Item";
        return { description: desc, quantity: qty, unit_price: unit, total };
      });
  }

  return [];
}

const STATUS_STYLES_BASE = {
  paid: { color: "#10b981", border: "#10b981" },
  partial_paid: { color: "#f59e0b", border: "#f59e0b" },
  sent: { color: "#3b82f6", border: "#3b82f6" },
  viewed: { color: "#3b82f6", border: "#3b82f6" },
  accepted: { color: "#10b981", border: "#10b981" },
  pending: { color: "#f59e0b", border: "#f59e0b" },
  overdue: { color: "#ef4444", border: "#ef4444" },
  declined: { color: "#6b7280", border: "#6b7280" },
  rejected: { color: "#6b7280", border: "#6b7280" },
  expired: { color: "#6b7280", border: "#6b7280" },
  draft: { color: "#9ca3af", border: "#9ca3af" },
  cancelled: { color: "#6b7280", border: "#6b7280" },
};

function statusLabel(status) {
  if (!status) return "";
  return String(status).replace(/_/g, " ");
}

/**
 * One-page fallback when measurement is slow or fails: all blocks on page 1.
 * Still a block list — never a fixed item count.
 */
function fallbackPages(resolved) {
  const blocks = [];
  if (resolved.lineRows.length === 0) {
    blocks.push(
      createBlock({
        id: "line-empty",
        kind: "line-item-empty",
        heightPx: 1,
        repeatChrome: "line-table",
      })
    );
  } else {
    resolved.lineRows.forEach((_, i) => {
      blocks.push(
        createBlock({
          id: `line:${i}`,
          kind: "line-item",
          heightPx: 1,
          repeatChrome: "line-table",
          meta: { rowIndex: i },
        })
      );
    });
  }
  blocks.push(createBlock({ id: "totals-payment", kind: "totals-payment", heightPx: 1 }));
  if (resolved.notes) {
    blocks.push(createBlock({ id: "notes", kind: "notes", heightPx: 1 }));
  }
  resolved.termsParts.forEach((_, i) => {
    blocks.push(
      createBlock({
        id: `terms:${i}`,
        kind: "terms-part",
        heightPx: 1,
        policy: "flow-part",
        flowGroup: "terms",
        meta: { termsIndex: i },
      })
    );
  });
  return [{ isFirst: true, showFirstOnly: true, blocks, flowContinued: {} }];
}

function CommercialPageBody({ page, resolved, bankingLines, primary, secondary }) {
  return pageBlockRuns(page.blocks).map((run, i) => {
    if (run.type === "table") {
      const isEmpty = run.blocks.some((b) => b.kind === "line-item-empty");
      const rows = isEmpty
        ? []
        : run.blocks
            .filter((b) => b.kind === "line-item")
            .map((b) => resolved.lineRows[Number(b.meta.rowIndex)])
            .filter(Boolean);
      return (
        <LineItemsTable
          key={`tbl-${i}`}
          rows={rows}
          fmt={resolved.fmt}
          secondary={secondary}
          continued={!page.isFirst && rows.length > 0}
        />
      );
    }
    if (run.type === "flow" && run.group === "terms") {
      return (
        <div key={`terms-${i}`}>
          <TermsHeading continued={Boolean(page.flowContinued?.terms)} />
          {run.blocks.map((b) => (
            <TermsPart
              key={b.id}
              text={resolved.termsParts[Number(b.meta.termsIndex)]}
              index={Number(b.meta.termsIndex)}
            />
          ))}
        </div>
      );
    }
    const block = run.block;
    if (block?.kind === "totals-payment") {
      return (
        <TotalsPaymentBlock
          key={block.id}
          resolved={resolved}
          primary={primary}
          bankingLines={bankingLines}
        />
      );
    }
    if (block?.kind === "notes") {
      return <NotesBlock key={block.id} notes={resolved.notes} primary={primary} />;
    }
    return null;
  });
}

/**
 * Styled invoice/quote preview for CreateDocument, ViewDocument, and PDF capture.
 *
 * Document → Page → Blocks → measured content → pagination.
 * Invoice and quote only differ in labels (QUOTE vs INVOICE, Valid until vs Due date).
 * html2pdf maps one `.paidly-doc-page` to one A4 page.
 */
const DocumentPreview = forwardRef(function DocumentPreview(
  { doc, docType: docTypeProp, clients = [], user, bankingDetail = null, hideStatus = false },
  ref
) {
  const { user: authUser } = useAuth();
  const effectiveUser = useMemo(
    () => mergeLiveBrandingForDocuments(user, authUser),
    [user, authUser]
  );

  const { primary: BRAND_PRIMARY, secondary: BRAND_SECONDARY } = useMemo(
    () => resolveDocumentBrandColors(effectiveUser),
    [effectiveUser?.document_brand_primary, effectiveUser?.document_brand_secondary]
  );

  const statusStylesMap = useMemo(
    () => ({
      ...STATUS_STYLES_BASE,
      sending: { color: BRAND_PRIMARY, border: BRAND_PRIMARY },
      preparing: { color: BRAND_PRIMARY, border: BRAND_PRIMARY },
    }),
    [BRAND_PRIMARY]
  );

  const bankingLines = useMemo(() => {
    const merged = effectiveBankingDetail(bankingDetail, effectiveUser);
    return formatDocumentPreviewBankingLines(merged);
  }, [bankingDetail, effectiveUser]);

  const resolved = useMemo(() => {
    if (!doc) return null;
    const docType = normalizeDocType(doc, docTypeProp);
    const currency = doc.currency || effectiveUser?.currency || "ZAR";

    const clientFromList =
      doc.client_id && Array.isArray(clients) ? clients.find((c) => c.id === doc.client_id) : null;
    const client_name = doc.client_name || clientFromList?.name || "Client";
    const client_email = doc.client_email || clientFromList?.email || "";
    const client_address =
      doc.client_address ||
      [clientFromList?.address, clientFromList?.city, clientFromList?.country].filter(Boolean).join("\n") ||
      "";

    const company_name =
      resolveIssuerName({
        document: doc,
        company: doc.company,
        profile: effectiveUser,
      }) ||
      doc.company_name ||
      "Your Company";
    const company_email = doc.company_email || effectiveUser?.email || "";
    const company_phone = String(doc.company_phone || effectiveUser?.phone || "").trim();
    const company_website = String(
      doc.company_website || effectiveUser?.company_website || effectiveUser?.website || ""
    ).trim();
    const company_address = doc.company_address || effectiveUser?.company_address || "";
    const logo_url = resolveIssuerLogoPath({
      document: doc,
      company: doc.company,
      profile: effectiveUser,
    });

    const number = doc.number || doc.invoice_number || doc.quote_number || "—";
    const status = doc.status || "draft";

    const issue_date = doc.issue_date || doc.invoice_date || doc.created_at;
    const due_date =
      doc.due_date || (docType === "quote" ? doc.valid_until : null) || doc.delivery_date || doc.valid_until;

    const lineRows = normalizeLineItems(doc);
    const lineSubtotal = lineRows.reduce((sum, row) => sum + (Number(row.total) || 0), 0);
    const discount = Math.max(0, Number(doc.discount) || 0);
    const tax_rate = Number(doc.tax_rate) || 0;
    const tax_amount = Number(doc.tax_amount ?? 0);
    const total =
      Number(doc.total ?? doc.total_amount) ||
      Math.round((lineSubtotal - discount + tax_amount) * 100) / 100;

    const amountPaidRaw = doc.amount_paid ?? doc.paid_amount;
    const amount_paid =
      amountPaidRaw != null && amountPaidRaw !== "" && !Number.isNaN(Number(amountPaidRaw))
        ? Number(amountPaidRaw)
        : null;
    const balanceRaw = doc.balance_due ?? doc.balance;
    const balance_due =
      balanceRaw != null && balanceRaw !== "" && !Number.isNaN(Number(balanceRaw))
        ? Number(balanceRaw)
        : null;

    const fmt = (amount) => formatCurrency(amount, currency);
    const notes = doc.notes || "";
    const terms_conditions = doc.terms_conditions || "";
    const termsParts = splitFlowableText(terms_conditions);

    return {
      docType,
      currency,
      client_name,
      client_email,
      client_address,
      company_name,
      company_email,
      company_phone,
      company_website,
      company_address,
      number,
      status,
      issue_date,
      due_date,
      dueLabel: docType === "quote" ? "Valid until" : "Due date",
      safeFormatDate,
      lineRows,
      lineSubtotal,
      discount,
      tax_rate,
      tax_amount,
      total,
      amount_paid,
      balance_due,
      notes,
      terms_conditions,
      termsParts,
      fmt,
      logo_url,
    };
  }, [doc, docTypeProp, clients, effectiveUser]);

  const measureRef = useRef(null);
  const [plan, setPlan] = useState(null);
  const measureKey = resolved
    ? JSON.stringify({
        n: resolved.number,
        rows: resolved.lineRows,
        notes: resolved.notes,
        terms: resolved.terms_conditions,
        total: resolved.total,
        type: resolved.docType,
      })
    : "";

  useLayoutEffect(() => {
    setPlan(null);
  }, [measureKey]);

  useEffect(() => {
    if (!resolved) return undefined;
    const root = measureRef.current;
    if (!root) return undefined;
    let cancelled = false;

    (async () => {
      try {
        await waitForPdfAssets(root);
        if (cancelled) return;
        const next = paginateMeasuredDocument(root, {
          pageBudgetPx: CONTENT_HEIGHT_PX,
          safetyPx: PAGE_OVERFLOW_SAFETY_PX,
        });
        if (!cancelled) setPlan(next);
      } catch {
        if (!cancelled) setPlan(fallbackPages(resolved));
      }
    })();

    const t = window.setTimeout(() => {
      if (!cancelled) {
        setPlan((p) => p || fallbackPages(resolved));
      }
    }, 4000);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [resolved, measureKey]);

  if (!doc || !resolved) return null;

  const showStatusPill = !hideStatus && resolved.status;
  const st = showStatusPill ? statusStylesMap[resolved.status] || { color: "#9ca3af", border: "#9ca3af" } : null;
  const pageCount = plan?.length || 1;

  const headerProps = {
    resolved,
    primary: BRAND_PRIMARY,
    secondary: BRAND_SECONDARY,
    showStatusPill,
    statusStyle: st,
    statusLabelFn: statusLabel,
  };

  return (
    <>
      <div ref={measureRef} className="paidly-doc-measure" aria-hidden="true">
        <div className="paidly-doc-sheet" style={{ width: "174mm" }}>
          <FirstHeader {...headerProps} />
          <ContinuationHeader resolved={resolved} primary={BRAND_PRIMARY} />
          <BillToDates resolved={resolved} primary={BRAND_PRIMARY} />
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <LineItemsTableHeader secondary={BRAND_SECONDARY} />
            <tbody>
              {resolved.lineRows.length === 0 ? (
                <tr
                  data-measure="empty-row"
                  data-doc-block="line-item-empty"
                  data-doc-block-id="line-empty"
                  data-doc-repeat-chrome="line-table"
                >
                  <td colSpan={4}>No line items</td>
                </tr>
              ) : (
                resolved.lineRows.map((item, i) => (
                  <LineItemRow key={`m-${i}`} item={item} index={i} fmt={resolved.fmt} />
                ))
              )}
            </tbody>
          </table>
          <TotalsPaymentBlock resolved={resolved} primary={BRAND_PRIMARY} bankingLines={bankingLines} />
          <NotesBlock notes={resolved.notes} primary={BRAND_PRIMARY} />
          <TermsHeading continued={false} />
          <TermsHeading continued />
          {resolved.termsParts.map((text, i) => (
            <TermsPart key={`mt-${i}`} text={text} index={i} />
          ))}
          <PageFooter companyEmail={resolved.company_email} pageIndex={0} pageCount={2} />
        </div>
      </div>

      <div
        ref={ref}
        className="document-preview-styled paidly-doc-sheet"
        data-paidly-doc-ready={plan ? "true" : "false"}
        data-invoice-pdf-capture="true"
      >
        {(plan || []).length === 0 ? (
          <div style={{ minHeight: "400px", padding: "24px", color: "#9ca3af", fontSize: "12px" }}>
            Preparing document pages…
          </div>
        ) : null}
        {(plan || []).map((page, pageIndex) => {
          return (
            <section
              key={`page-${pageIndex}`}
              className="paidly-doc-page"
              style={{ display: "flex", flexDirection: "column" }}
            >
              {page.isFirst ? (
                <FirstHeader {...headerProps} />
              ) : (
                <ContinuationHeader resolved={resolved} primary={BRAND_PRIMARY} />
              )}
              {page.showFirstOnly ? <BillToDates resolved={resolved} primary={BRAND_PRIMARY} /> : null}
              <CommercialPageBody
                page={page}
                resolved={resolved}
                bankingLines={bankingLines}
                primary={BRAND_PRIMARY}
                secondary={BRAND_SECONDARY}
              />
              <PageFooter
                companyEmail={resolved.company_email}
                pageIndex={pageIndex}
                pageCount={pageCount}
              />
              {pageIndex === pageCount - 1 ? (
                <BrandBar primary={BRAND_PRIMARY} secondary={BRAND_SECONDARY} height={4} />
              ) : null}
            </section>
          );
        })}
      </div>
    </>
  );
});

DocumentPreview.displayName = "DocumentPreview";

export default DocumentPreview;
