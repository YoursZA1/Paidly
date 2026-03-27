
import React, { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Invoice } from '@/api/entities';
import { createPageUrl } from '@/utils';
import { getPublicApiBase } from '@/api/backendClient';
import { formatCurrency } from '../components/CurrencySelector';
import { DocumentPageSkeleton } from '../components/shared/PageSkeleton';
import { AlertCircle, Download, CreditCard, Mail } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getAutoStatusUpdate } from '@/utils/invoiceStatus';
import PayfastService from '@/services/PayfastService';
import InvoicePreview from '@/components/invoice/InvoicePreview';
import { normalizeInvoiceTemplateKey, DEFAULT_INVOICE_TEMPLATE } from '@/utils/invoiceTemplateData';
import { parseDocumentBrandHex } from '@/utils/documentBrandColors';

export default function PublicInvoice() {
    const location = useLocation();
    const [invoice, setInvoice] = useState(null);
    const [client, setClient] = useState(null);
    const [bankingDetail, setBankingDetail] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [emailVerification, setEmailVerification] = useState('');
    const [needsEmailVerification, setNeedsEmailVerification] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);
    const [verificationError, setVerificationError] = useState('');
    const [isPaying, setIsPaying] = useState(false);
    const [payError, setPayError] = useState('');

    useEffect(() => {
        const fetchInvoiceData = async () => {
            setIsLoading(true);
            try {
                const params = new URLSearchParams(location.search);
                const token = params.get('token');

                if (!token) {
                    setError("Invalid invoice link. No token provided.");
                    return;
                }

                const apiBase = getPublicApiBase();
                const res = await fetch(
                    `${apiBase}/api/public-invoice?token=${encodeURIComponent(token)}`
                );
                if (res.status === 404) {
                    setError("Invoice not found or link has expired.");
                    return;
                }
                if (!res.ok) {
                    const j = await res.json().catch(() => ({}));
                    setError(j?.error || "Could not load the invoice. Please check the link and try again.");
                    return;
                }

                const payload = await res.json();
                const currentInvoice = payload.invoice;
                if (!currentInvoice) {
                    setError("Invoice not found or link has expired.");
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
                    setClient({ name: "Client", email: "", address: "", phone: "" });
                }

                setBankingDetail(payload.bankingDetail || null);
                
                const autoUpdate = getAutoStatusUpdate(currentInvoice, { markViewed: true });
                if (autoUpdate) {
                    try {
                        await Invoice.update(currentInvoice.id, autoUpdate);
                        setInvoice(prev => ({ ...prev, ...autoUpdate }));
                    } catch (e) {
                        console.error("Could not update invoice status:", e);
                    }
                }

            } catch (e) {
                console.error("Error fetching public invoice:", e);
                setError("Could not load the invoice. Please check the link and try again.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchInvoiceData();
    }, [location]);

    const handleEmailVerification = async () => {
        if (!emailVerification.trim()) {
            setVerificationError('Please enter your email address');
            return;
        }

        setIsVerifying(true);
        setVerificationError('');

        try {
            // Check if the entered email matches the sent_to_email
            if (invoice && emailVerification.toLowerCase().trim() === invoice.sent_to_email.toLowerCase().trim()) {
                // Store verification in session
                sessionStorage.setItem(`invoice_${invoice.id}_verified_email`, invoice.sent_to_email);
                setNeedsEmailVerification(false);
                
                // Reload to fetch full data (client, banking details, update status)
                // Using window.location.reload() will trigger the useEffect again, but this time
                // the sessionStorage will have the verified email, so the verification step will be skipped.
                window.location.reload(); 
            } else {
                setVerificationError('The email address does not match our records. Please enter the email address this invoice was sent to.');
            }
        } catch (error) {
            setVerificationError('Verification failed. Please try again.');
        } finally {
            setIsVerifying(false);
        }
    };

    if (isLoading) {
        return <DocumentPageSkeleton title="Loading invoice…" />;
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-background text-center p-4">
                <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
                <h1 className="text-xl font-bold text-foreground">Oops! Something went wrong.</h1>
                <p className="text-muted-foreground mt-2">{error}</p>
            </div>
        );
    }

    if (needsEmailVerification) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
                <div className="bg-card rounded-lg shadow-xl border border-border p-8 max-w-md w-full">
                    <div className="text-center mb-6">
                        <Mail className="w-12 h-12 text-primary mx-auto mb-4" />
                        <h1 className="text-2xl font-bold text-foreground mb-2">Email Verification Required</h1>
                        <p className="text-muted-foreground">
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
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter') {
                                        handleEmailVerification();
                                    }
                                }}
                                className="w-full"
                            />
                            {verificationError && (
                                <p className="text-red-500 text-sm mt-2">{verificationError}</p>
                            )}
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
            <div className="flex items-center justify-center min-h-screen bg-background">
                <p className="text-muted-foreground">Invoice not found.</p>
            </div>
        );
    }
    
    const canPayOnline = bankingDetail && bankingDetail.payment_gateway_url;
    const ownerCurrency = invoice.owner_currency || invoice.currency || 'ZAR';
    const templateKey =
      normalizeInvoiceTemplateKey(invoice.invoice_template) || DEFAULT_INVOICE_TEMPLATE;
    const publicUser = {
        logo_url:
            invoice.owner_logo_url ||
            invoice.company?.logo_url ||
            invoice.company?.company_logo_url ||
            '',
        company_name: invoice.owner_company_name || invoice.company?.name || '',
        company_address: invoice.owner_company_address || '',
        email: invoice.owner_email || '',
        currency: ownerCurrency,
        invoice_template: templateKey,
        invoice_header: '',
        document_brand_primary: parseDocumentBrandHex(invoice.document_brand_primary),
        document_brand_secondary: parseDocumentBrandHex(invoice.document_brand_secondary),
    };

    const handlePayFast = async () => {
        if (!invoice) return;
        setIsPaying(true);
        setPayError('');
        try {
            const amount = invoice.total_amount || 0;
            const clientName = client?.name || '';
            const clientEmail = client?.email || invoice.sent_to_email || '';
            const returnPath = location.pathname + location.search;

            await PayfastService.startOneTimePayment({
                invoiceId: invoice.id,
                amount,
                currency: ownerCurrency || 'ZAR',
                clientName,
                clientEmail,
                returnPath,
                cancelPath: returnPath,
            });
        } catch (err) {
            console.error('Failed to start PayFast payment:', err);
            setPayError(err?.message || 'Could not start PayFast payment. Please try again.');
            setIsPaying(false);
        }
    };

    return (
        <div className="min-h-screen bg-background p-4 sm:p-8">
            <div className="max-w-4xl mx-auto">
                {/* Action Buttons */}
                <div className="mb-6 flex flex-col sm:flex-row gap-2 justify-end">
                    {canPayOnline && (
                         <a href={bankingDetail.payment_gateway_url} target="_blank" rel="noopener noreferrer" className="flex-grow sm:flex-grow-0">
                            <button className="w-full bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg shadow-sm flex items-center justify-center gap-2">
                                <CreditCard className="w-5 h-5"/>
                                Pay Now ({formatCurrency(invoice.total_amount, ownerCurrency)})
                            </button>
                        </a>
                    )}
                    {ownerCurrency === 'ZAR' && (
                        <button
                            type="button"
                            onClick={handlePayFast}
                            disabled={isPaying}
                            className="flex-grow sm:flex-grow-0 w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-70 text-white px-6 py-3 rounded-lg shadow-sm flex items-center justify-center gap-2"
                        >
                            <CreditCard className="w-5 h-5" />
                            {isPaying ? 'Redirecting to PayFast…' : `Pay with PayFast (${formatCurrency(invoice.total_amount, ownerCurrency)})`}
                        </button>
                    )}
                    <a href={createPageUrl(`InvoicePDF?id=${invoice.id}`)} target="_blank" rel="noopener noreferrer" className="flex-grow sm:flex-grow-0">
                        <button className="w-full bg-primary hover:bg-primary/90 text-white px-6 py-3 rounded-lg shadow-sm flex items-center justify-center gap-2">
                            <Download className="w-5 h-5" />
                            Download as PDF
                        </button>
                    </a>
                </div>

                {payError && (
                    <div className="mb-4 text-sm text-red-600">
                        {payError}
                    </div>
                )}

                <div className="bg-card border border-border shadow-xl rounded-lg p-4 sm:p-6 overflow-x-auto">
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
