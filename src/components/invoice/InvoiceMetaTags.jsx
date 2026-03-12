import { useEffect } from 'react';
import { formatCurrency } from '@/utils/currencyCalculations';
import { format } from 'date-fns';

/**
 * Injects dynamic <title> and meta tags into document.head for Open Graph (WhatsApp, Facebook)
 * and Twitter so shared links show a rich preview with client name, invoice number, and total.
 * Uses the dynamic OG image API (/api/og) for og:image so WhatsApp previews show invoice details.
 * Used on the public invoice view page (/view/:token).
 *
 * @param {object} props
 * @param {object} props.invoice - Invoice record (invoice_number, total_amount, delivery_date, owner_currency, etc.)
 * @param {object} [props.client] - Client record (name) for title/description and OG image
 * @param {string} [props.baseUrl] - Full page URL for og:url (e.g. https://paidly.co.za/view/abc123). Also used as origin for og:image.
 * @param {string} [props.previewImageUrl] - Optional override for og:image (if set, used instead of dynamic /api/og).
 */
export default function InvoiceMetaTags({ invoice, client, baseUrl, previewImageUrl }) {
  useEffect(() => {
    if (!invoice) return;

    const clientName = client?.name || 'Client';
    const currency = invoice.owner_currency || 'ZAR';
    const totalFormatted = formatCurrency(invoice.total_amount, currency);
    const dueDate = invoice.delivery_date
      ? format(new Date(invoice.delivery_date), 'MMM d, yyyy')
      : '';

    const previewTitle = `Invoice ${invoice.invoice_number} for ${clientName}`;
    const previewDesc = [
      clientName,
      `Invoice ${invoice.invoice_number}`,
      `Amount Due: ${totalFormatted}`,
      dueDate ? `Due: ${dueDate}` : '',
    ]
      .filter(Boolean)
      .join(' | ');

    const url = baseUrl || (typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '');
    const origin = url ? new URL(url).origin : (typeof window !== 'undefined' ? window.location.origin : '');
    const ogImageUrl =
      previewImageUrl ||
      (origin
        ? `${origin}/api/og?${new URLSearchParams({
            num: String(invoice.invoice_number ?? ''),
            client: String(clientName ?? ''),
            total: String(totalFormatted ?? ''),
          }).toString()}`
        : '');

    const previousTitle = document.title;
    document.title = previewTitle;

    const metaPairs = [
      ['name', 'description', previewDesc],
      ['property', 'og:type', 'website'],
      ['property', 'og:title', previewTitle],
      ['property', 'og:description', previewDesc],
      ['property', 'og:url', url],
      ['name', 'twitter:card', 'summary_large_image'],
      ['name', 'twitter:title', previewTitle],
      ['name', 'twitter:description', previewDesc],
    ];
    if (ogImageUrl) {
      metaPairs.push(['property', 'og:image', ogImageUrl]);
      metaPairs.push(['name', 'twitter:image', ogImageUrl]);
    }

    const elements = [];
    for (const [attr, key, content] of metaPairs) {
      const el = document.createElement('meta');
      if (attr === 'property') {
        el.setAttribute('property', key);
      } else {
        el.setAttribute('name', key);
      }
      el.setAttribute('content', content || '');
      document.head.appendChild(el);
      elements.push(el);
    }

    return () => {
      document.title = previousTitle;
      elements.forEach((el) => el.remove());
    };
  }, [invoice, client, baseUrl, previewImageUrl]);

  return null;
}
