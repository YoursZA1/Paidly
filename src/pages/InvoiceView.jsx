import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getPublicApiBase } from '@/api/backendClient';
import {
  fetchPublicInvoicePayload,
  verifyPublicInvoiceEmail,
} from '@/api/publicInvoiceApiClient';
import {
  clearLegacyInvoiceVerificationSessionKeys,
  getPublicInvoiceViewerToken,
  setPublicInvoiceViewerToken,
} from '@/lib/publicInvoiceViewerStorage';
import { createPageUrl } from '@/utils';
import { formatCurrency } from '@/utils/currencyCalculations';
import { Loader2, AlertCircle, Download, Mail } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import InvoiceMetaTags from '@/components/invoice/InvoiceMetaTags';
import InvoicePreview from '@/components/invoice/InvoicePreview';
import { resolveInvoiceTemplateKey, DEFAULT_INVOICE_TEMPLATE } from '@/utils/invoiceTemplateData';
import { isValidShareToken } from '@/utils/inputSanitization';
import { resolveIssuerBrand } from '@/lib/documentIssuerBrand';
import DocumentPaymentActionBar from '@/components/invoice/DocumentPaymentActionBar';
import EftPaymentNotice, { eftPaymentRows } from '@/components/invoice/EftPaymentNotice';
import PublicDocumentPortal, {
  PublicDocumentSheet,
  PublicPortalMessage,
  formatPortalDate,
} from '@/components/documents/PublicDocumentPortal';
import InvoicePaymentHistory from '@/components/invoice/InvoicePaymentHistory';
import { fetchDocumentPaymentHistory, startDocumentPayment } from '@/api/documentPaymentApi';
import PaymentReturnDone from '@/components/invoice/PaymentReturnDone';

/**
 * Public read-only invoice view at /view/:token.
 * No login required. Uses public_share_token for lookup.
 * Renders InvoiceMetaTags for WhatsApp/OG previews.
 */
export default function InvoiceView() {
  const { token } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const trackingTokenRecorded = useRef(false);
  const [invoice, setInvoice] = useState(null);
  const [client, setClient] = useState(null);
  const [bankingDetail, setBankingDetail] = useState(null);
  const [eftNotice, setEftNotice] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [emailVerification, setEmailVerification] = useState('');
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState('');
  const [sentToEmailHint, setSentToEmailHint] = useState('');
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [paymentDue, setPaymentDue] = useState(null);
  const handlePaymentAmount = useCallback((next) => {
    setPaymentDue((prev) => {
      if (
        prev &&
        prev.amountDue === next.amountDue &&
        prev.currency === next.currency &&
        prev.label === next.label
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    clearLegacyInvoiceVerificationSessionKeys();
  }, []);

  useEffect(() => {
    const fetchInvoiceData = async () => {
      setIsLoading(true);
      try {
        if (!token || !isValidShareToken(token)) {
          setError('Invalid invoice link.');
          return;
        }

        const viewerToken = getPublicInvoiceViewerToken(token);
        const payload = await fetchPublicInvoicePayload(token, viewerToken);
        const currentInvoice = payload.invoice;
        if (!currentInvoice) {
          setError('Invoice not found or link has expired.');
          return;
        }

        if (payload.requiresEmailVerification) {
          setSentToEmailHint(payload.sentToEmailHint || '');
          setNeedsEmailVerification(true);
          setInvoice(currentInvoice);
          return;
        }

        setNeedsEmailVerification(false);
        setSentToEmailHint('');
        setInvoice(currentInvoice);

        if (payload.client) {
          setClient(payload.client);
        } else {
          setClient({ name: 'Client', email: '', address: '', phone: '' });
        }

        setBankingDetail(payload.bankingDetail || null);

        const tokenParam = searchParams.get('token') || searchParams.get('tracking');
        if (tokenParam && !trackingTokenRecorded.current) {
          trackingTokenRecorded.current = true;
          const apiBase = getPublicApiBase();
          fetch(`${apiBase}/api/track-open`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: tokenParam }),
          }).catch((e) => console.warn('Track open:', e));
        }
      } catch (e) {
        console.error('Error fetching public invoice:', e);
        setError(e?.message || 'Could not load the invoice. Please check the link and try again.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchInvoiceData();
  }, [token, searchParams]);

  useEffect(() => {
    if (!invoice?.id || !token || needsEmailVerification) return undefined;
    let cancelled = false;
    fetchDocumentPaymentHistory({ invoiceId: invoice.id, shareToken: token })
      .then((snap) => {
        if (!cancelled) setPaymentHistory(snap.history || []);
      })
      .catch(() => {
        if (!cancelled) setPaymentHistory([]);
      });
    return () => {
      cancelled = true;
    };
  }, [invoice?.id, token, needsEmailVerification]);

  const handleEmailVerification = async () => {
    if (!emailVerification.trim()) {
      setVerificationError('Please enter your email address');
      return;
    }
    if (!token) {
      setVerificationError('Invalid link.');
      return;
    }
    setIsVerifying(true);
    setVerificationError('');
    try {
      const viewerToken = await verifyPublicInvoiceEmail(token, emailVerification);
      setPublicInvoiceViewerToken(token, viewerToken);
      const payload = await fetchPublicInvoicePayload(token, viewerToken);
      const currentInvoice = payload.invoice;
      if (!currentInvoice || payload.requiresEmailVerification) {
        setVerificationError('Verification failed. Please try again.');
        return;
      }
      setNeedsEmailVerification(false);
      setSentToEmailHint('');
      setInvoice(currentInvoice);
      if (payload.client) {
        setClient(payload.client);
      } else {
        setClient({ name: 'Client', email: '', address: '', phone: '' });
      }
      setBankingDetail(payload.bankingDetail || null);
    } catch (err) {
      setVerificationError(
        err?.message ||
          'The email address does not match our records. Please enter the email address this invoice was sent to.'
      );
    } finally {
      setIsVerifying(false);
    }
  };

  if (isLoading) {
    return (
      <PublicPortalMessage icon={<Loader2 className="h-8 w-8 animate-spin" />} title="Loading invoice">
        <p className="text-center text-sm text-slate-500">Fetching the document…</p>
      </PublicPortalMessage>
    );
  }

  if (error) {
    return (
      <PublicPortalMessage icon={<AlertCircle className="h-8 w-8 text-red-500" />} title="This invoice could not be opened">
        <p className="text-center text-sm text-slate-500">{error}</p>
      </PublicPortalMessage>
    );
  }

  if (needsEmailVerification) {
    return (
      <PublicPortalMessage icon={<Mail className="h-8 w-8" />} title="Confirm your email">
        <p className="text-center text-sm text-slate-500">
          Enter the email address this invoice was sent to
          {sentToEmailHint ? (
            <>
              {' '}
              <span className="font-medium text-slate-800">(hint: {sentToEmailHint})</span>
            </>
          ) : null}
          .
        </p>
        <div className="mt-5 space-y-3">
          <Input
            type="email"
            placeholder="your.email@example.com"
            value={emailVerification}
            onChange={(e) => {
              setEmailVerification(e.target.value);
              setVerificationError('');
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleEmailVerification()}
            className="w-full"
          />
          {verificationError ? <p className="text-sm text-red-500">{verificationError}</p> : null}
          <Button
            onClick={handleEmailVerification}
            disabled={isVerifying || !emailVerification.trim()}
            className="h-10 w-full rounded-xl"
          >
            {isVerifying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Verifying…
              </>
            ) : (
              'View invoice'
            )}
          </Button>
        </div>
      </PublicPortalMessage>
    );
  }

  if (!invoice) {
    return (
      <PublicPortalMessage title="Invoice not found">
        <p className="text-center text-sm text-slate-500">This link does not match an invoice.</p>
      </PublicPortalMessage>
    );
  }

  const ownerCurrency = invoice.owner_currency || invoice.currency || 'ZAR';
  const publicViewUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/view/${token}` : '';

  const templateKey = resolveInvoiceTemplateKey(invoice.invoice_template) || DEFAULT_INVOICE_TEMPLATE;
  const issuerBrand = resolveIssuerBrand({
    document: invoice,
    company: invoice.company,
    profile: null,
  });
  const publicUser = {
    logo_url: issuerBrand.logo || '',
    company_name: issuerBrand.name || '',
    company_address: invoice.owner_company_address || '',
    email: invoice.owner_email || '',
    currency: ownerCurrency,
    invoice_template: templateKey,
    invoice_header: '',
  };

  const dueAmount = paymentDue?.amountDue ?? invoice.total_amount;
  const dueCurrency = paymentDue?.currency || ownerCurrency;
  const dueDateLabel = formatPortalDate(invoice.delivery_date);
  const pdfHref = `${createPageUrl('InvoicePDF')}?token=${encodeURIComponent(token)}&download=true`;

  return (
    <>
      <InvoiceMetaTags invoice={invoice} client={client} baseUrl={publicViewUrl} />
      <PublicDocumentPortal
        companyName={issuerBrand.name || invoice.owner_company_name || 'Invoice'}
        documentLabel="Invoice"
        documentNumber={invoice.invoice_number}
        summary={invoice.project_title || invoice.project_description || ''}
        amountLabel={paymentDue?.label || 'Due'}
        amount={formatCurrency(dueAmount, dueCurrency)}
        meta={dueDateLabel ? `Due ${dueDateLabel}` : ''}
        actions={
          <>
            <Button variant="outline" className="gap-2 border-slate-200 bg-white" asChild>
              <a href={pdfHref} target="_blank" rel="noopener noreferrer">
                <Download className="h-4 w-4" />
                <span className="sm:hidden">PDF</span>
                <span className="hidden sm:inline">Download PDF</span>
              </a>
            </Button>
            <DocumentPaymentActionBar
              invoice={invoice}
              client={client}
              shareToken={token}
              bankingDetail={bankingDetail}
              publicMode
              variant="inline"
              onAmountChange={handlePaymentAmount}
              onDownloadReceipt={() => window.open(pdfHref, '_blank', 'noopener,noreferrer')}
            />
          </>
        }
      >
        {searchParams.get('pay') === 'return' && searchParams.get('intent') ? (
          <div className="mb-4">
            <PaymentReturnDone
              publicMode
              invoice={invoice}
              intentId={searchParams.get('intent')}
              resultParam={searchParams.get('result')}
              shareToken={token}
              onStatus={(status) => {
                if (status?.snapshot?.history) setPaymentHistory(status.snapshot.history);
              }}
              onDownload={() => window.open(pdfHref, '_blank', 'noopener,noreferrer')}
              onRetry={async () => {
                try {
                  const result = await startDocumentPayment({ invoiceId: invoice.id, shareToken: token, retry: true });
                  if (result?.redirect_url) window.location.assign(result.redirect_url);
                } catch (err) {
                  if (err?.code === "PROVIDER_NOT_CONFIGURED") {
                    setEftNotice(eftPaymentRows(err.eft || bankingDetail, invoice.invoice_number));
                  }
                }
              }}
              onDismiss={() => {
                const next = new URLSearchParams(searchParams);
                ['pay', 'intent', 'result'].forEach((key) => next.delete(key));
                setSearchParams(next, { replace: true });
              }}
            />
          </div>
        ) : null}
        <EftPaymentNotice open={Boolean(eftNotice)} onOpenChange={(next) => (next ? null : setEftNotice(null))} rows={eftNotice || []} />
        <PublicDocumentSheet>
          <div className="overflow-x-auto p-3 sm:p-6">
            <InvoicePreview
              embedded
              invoiceData={{ ...invoice, issuerBrand }}
              client={client}
              clients={[]}
              user={publicUser}
              bankingDetail={bankingDetail}
              previewOnly={false}
              showBack={false}
              loading={false}
            />
          </div>
        </PublicDocumentSheet>
        <div className="mt-4">
          <InvoicePaymentHistory history={paymentHistory} currency={ownerCurrency} />
        </div>
      </PublicDocumentPortal>
    </>
  );
}
