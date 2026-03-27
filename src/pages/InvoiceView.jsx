import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Invoice } from '@/api/entities';
import { getPublicApiBase } from '@/api/backendClient';
import { createPageUrl } from '@/utils';
import { formatCurrency } from '@/utils/currencyCalculations';
import { Loader2, AlertCircle, Download, CreditCard, Mail } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getAutoStatusUpdate } from '@/utils/invoiceStatus';
import InvoiceMetaTags from '@/components/invoice/InvoiceMetaTags';
import InvoicePreview from '@/components/invoice/InvoicePreview';
import { normalizeInvoiceTemplateKey, DEFAULT_INVOICE_TEMPLATE } from '@/utils/invoiceTemplateData';

/**
 * Public read-only invoice view at /view/:token.
 * No login required. Uses public_share_token for lookup.
 * Renders InvoiceMetaTags for WhatsApp/OG previews.
 */
export default function InvoiceView() {
  const { token } = useParams();
  const [searchParams] = useSearchParams();
  const trackingTokenRecorded = useRef(false);
  const [invoice, setInvoice] = useState(null);
  const [client, setClient] = useState(null);
  const [bankingDetail, setBankingDetail] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [emailVerification, setEmailVerification] = useState('');
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState('');

  useEffect(() => {
    const fetchInvoiceData = async () => {
      setIsLoading(true);
      try {
        if (!token) {
          setError('Invalid invoice link. No token provided.');
          return;
        }

        const apiBase = getPublicApiBase();
        const res = await fetch(
          `${apiBase}/api/public-invoice?token=${encodeURIComponent(token)}`
        );
        if (res.status === 404) {
          setError('Invoice not found or link has expired.');
          return;
        }
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setError(j?.error || 'Could not load the invoice. Please check the link and try again.');
          return;
        }

        const payload = await res.json();
        const currentInvoice = payload.invoice;
        if (!currentInvoice) {
          setError('Invoice not found or link has expired.');
          return;
        }

        if (currentInvoice.sent_to_email) {
          const verifiedEmail = sessionStorage.getItem(`invoice_${currentInvoice.id}_verified_email`);
          if (verifiedEmail !== currentInvoice.sent_to_email) {
            setNeedsEmailVerification(true);
            setInvoice(currentInvoice);
            return;
          }
        }

        setInvoice(currentInvoice);

        if (payload.client) {
          setClient(payload.client);
        } else {
          setClient({ name: 'Client', email: '', address: '', phone: '' });
        }

        setBankingDetail(payload.bankingDetail || null);

        const autoUpdate = getAutoStatusUpdate(currentInvoice, { markViewed: true });
        if (autoUpdate) {
          try {
            await Invoice.update(currentInvoice.id, autoUpdate);
            setInvoice((prev) => ({ ...prev, ...autoUpdate }));
          } catch (e) {
            console.error('Could not update invoice status:', e);
          }
        }

        const tokenParam = searchParams.get('token') || searchParams.get('tracking');
        if (tokenParam && !trackingTokenRecorded.current) {
          trackingTokenRecorded.current = true;
          fetch(`${apiBase}/api/track-open`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: tokenParam }),
          }).catch((e) => console.warn('Track open:', e));
        }
      } catch (e) {
        console.error('Error fetching public invoice:', e);
        setError('Could not load the invoice. Please check the link and try again.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchInvoiceData();
  }, [token, searchParams]);

  const handleEmailVerification = async () => {
    if (!emailVerification.trim()) {
      setVerificationError('Please enter your email address');
      return;
    }
    setIsVerifying(true);
    setVerificationError('');
    try {
      if (invoice && emailVerification.toLowerCase().trim() === invoice.sent_to_email.toLowerCase().trim()) {
        sessionStorage.setItem(`invoice_${invoice.id}_verified_email`, invoice.sent_to_email);
        setNeedsEmailVerification(false);
        window.location.reload();
      } else {
        setVerificationError(
          'The email address does not match our records. Please enter the email address this invoice was sent to.'
        );
      }
    } catch {
      setVerificationError('Verification failed. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
        <p className="ml-2 text-slate-600">Loading Invoice...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 text-center p-4">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <h1 className="text-xl font-bold text-slate-800">Oops! Something went wrong.</h1>
        <p className="text-slate-600 mt-2">{error}</p>
      </div>
    );
  }

  if (needsEmailVerification) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <Mail className="w-12 h-12 text-primary mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-slate-800 mb-2">Email Verification Required</h1>
            <p className="text-slate-600">
              To view this invoice, please enter the email address it was sent to.
            </p>
          </div>
          <div className="space-y-4">
            <div>
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
              {verificationError && <p className="text-red-500 text-sm mt-2">{verificationError}</p>}
            </div>
            <Button
              onClick={handleEmailVerification}
              disabled={isVerifying || !emailVerification.trim()}
              className="w-full bg-primary hover:bg-primary/90"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verify & View Invoice'
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <p className="text-slate-600">Invoice not found.</p>
      </div>
    );
  }

  const canPayOnline = bankingDetail && bankingDetail.payment_gateway_url;
  const ownerCurrency = invoice.owner_currency || invoice.currency || 'ZAR';
  const publicViewUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/view/${token}` : '';

  const templateKey = normalizeInvoiceTemplateKey(invoice.invoice_template) || DEFAULT_INVOICE_TEMPLATE;
  const publicUser = {
    logo_url: invoice.owner_logo_url || invoice.company?.logo_url || '',
    company_name: invoice.owner_company_name || invoice.company?.name || '',
    company_address: invoice.owner_company_address || '',
    email: invoice.owner_email || '',
    currency: ownerCurrency,
    invoice_template: templateKey,
    invoice_header: '',
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 sm:p-8">
      <InvoiceMetaTags
        invoice={invoice}
        client={client}
        baseUrl={publicViewUrl}
      />
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 flex flex-col sm:flex-row gap-2 justify-end">
          {canPayOnline && (
            <a
              href={bankingDetail.payment_gateway_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-grow sm:flex-grow-0"
            >
              <button
                type="button"
                className="w-full bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg shadow-sm flex items-center justify-center gap-2"
              >
                <CreditCard className="w-5 h-5" />
                Pay Now ({formatCurrency(invoice.total_amount, ownerCurrency)})
              </button>
            </a>
          )}
          <a
            href={createPageUrl(`InvoicePDF?id=${invoice.id}`)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-grow sm:flex-grow-0"
          >
            <button
              type="button"
              className="w-full bg-primary hover:bg-primary/90 text-white px-6 py-3 rounded-lg shadow-sm flex items-center justify-center gap-2"
            >
              <Download className="w-5 h-5" />
              Download as PDF
            </button>
          </a>
        </div>

        <div className="bg-white shadow-xl rounded-lg p-4 sm:p-6 overflow-x-auto">
          <InvoicePreview
            embedded
            invoiceData={invoice}
            client={client}
            clients={[]}
            user={publicUser}
            bankingDetail={bankingDetail}
            previewOnly={false}
            showBack={false}
            loading={false}
          />
        </div>
      </div>
    </div>
  );
}
