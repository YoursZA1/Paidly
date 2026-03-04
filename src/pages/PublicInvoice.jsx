
import React, { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Invoice, Client, BankingDetail } from '@/api/entities';
import { createPageUrl } from '@/utils';
import { formatCurrency } from '../components/CurrencySelector';
import { format } from 'date-fns';
import { Loader2, AlertCircle, Download, CreditCard, Mail } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getAutoStatusUpdate } from '@/utils/invoiceStatus';

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

    useEffect(() => {
        const fetchInvoiceData = async () => {
            setIsLoading(true);
            try {
                const params = new URLSearchParams(location.search);
                const token = params.get('token');

                if (!token) {
                    setError("Invalid invoice link. No token provided.");
                    setIsLoading(false);
                    return;
                }

                // Filter invoices by the public share token
                const invoices = await Invoice.filter({ public_share_token: token });
                
                if (invoices.length === 0) {
                    setError("Invoice not found or link has expired.");
                    setIsLoading(false);
                    return;
                }
                
                const currentInvoice = invoices[0];
                
                // Check if email verification is required
                if (currentInvoice.sent_to_email) {
                    const verifiedEmail = sessionStorage.getItem(`invoice_${currentInvoice.id}_verified_email`);
                    if (verifiedEmail !== currentInvoice.sent_to_email) {
                        setNeedsEmailVerification(true);
                        setInvoice(currentInvoice); // Set invoice so we have access to sent_to_email for verification
                        setIsLoading(false); // Stop loading to show verification UI
                        return;
                    }
                }
                
                setInvoice(currentInvoice);

                // Fetch related data
                try {
                    const clientData = await Client.get(currentInvoice.client_id);
                    setClient(clientData);
                } catch (e) {
                    console.error("Could not load client data:", e);
                    setClient({ name: "Client", email: "", address: "", phone: "" });
                }

                // Fetch banking details if available
                if (currentInvoice.banking_detail_id) {
                    try {
                        const bankingData = await BankingDetail.get(currentInvoice.banking_detail_id);
                        setBankingDetail(bankingData);
                    } catch (e) {
                        console.error("Could not load banking details:", e);
                    }
                }
                
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
            <div className="flex items-center justify-center min-h-screen bg-slate-50">
                <p className="text-slate-600">Invoice not found.</p>
            </div>
        );
    }
    
    const canPayOnline = bankingDetail && bankingDetail.payment_gateway_url;
    const ownerCurrency = invoice.owner_currency || 'ZAR';

    return (
        <div className="min-h-screen bg-slate-100 p-4 sm:p-8">
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
                    <a href={createPageUrl(`InvoicePDF?id=${invoice.id}`)} target="_blank" rel="noopener noreferrer" className="flex-grow sm:flex-grow-0">
                        <button className="w-full bg-primary hover:bg-primary/90 text-white px-6 py-3 rounded-lg shadow-sm flex items-center justify-center gap-2">
                            <Download className="w-5 h-5" />
                            Download as PDF
                        </button>
                    </a>
                </div>

                <div className="bg-white shadow-xl rounded-lg p-6 sm:p-10">
                    {/* Header */}
                    <header className="border-b-2 border-slate-200 pb-6 mb-6">
                        <div className="flex flex-col sm:flex-row justify-between items-start">
                            <div className="mb-6 sm:mb-0">
                                {invoice.owner_logo_url ? (
                                    <img src={invoice.owner_logo_url} alt="Company Logo" className="h-16 w-auto mb-4 object-contain" />
                                ) : (
                                    <h1 className="text-2xl font-bold text-slate-900 mb-2">
                                        {invoice.owner_company_name || 'Your Company'}
                                    </h1>
                                )}
                                {invoice.owner_company_address && (
                                    <p className="text-slate-600 mt-2 whitespace-pre-line text-sm max-w-xs">{invoice.owner_company_address}</p>
                                )}
                            </div>
                            <div className="text-left sm:text-right w-full sm:w-auto">
                                <h2 className="text-3xl font-bold text-primary mb-2">INVOICE</h2>
                                <p className="text-slate-500 text-sm"># {invoice.invoice_number}</p>
                                <p className="text-slate-500 text-sm mt-1">
                                    Issued: {format(new Date(invoice.created_date), 'MMMM d, yyyy')}
                                </p>
                            </div>
                        </div>
                    </header>

                    {/* Client Info */}
                    <section className="mb-8">
                        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Bill To</h3>
                        <p className="font-bold text-slate-800">{client?.name || 'Client'}</p>
                        <p className="text-slate-600">{client?.email || ''}</p>
                        {client?.address && <p className="text-slate-600">{client.address}</p>}
                        {client?.phone && <p className="text-slate-600">{client.phone}</p>}
                    </section>

                    {/* Items Table */}
                    <section className="mb-8">
                         <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-slate-50 text-slate-600 text-sm uppercase">
                                        <th className="p-3 font-semibold">Service</th>
                                        <th className="p-3 font-semibold text-center">Qty</th>
                                        <th className="p-3 font-semibold text-right">Price</th>
                                        <th className="p-3 font-semibold text-right">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {Array.isArray(invoice.items) && invoice.items.length > 0 ? (
                                        invoice.items.map((item, index) => (
                                            <tr key={index} className="border-b border-slate-100">
                                                <td className="p-3">
                                                    <p className="font-medium text-slate-800">{item.service_name}</p>
                                                    {item.description && <p className="text-xs text-slate-500 mt-1">{item.description}</p>}
                                                </td>
                                                <td className="p-3 text-center">{item.quantity}</td>
                                                <td className="p-3 text-right">{formatCurrency(item.unit_price, ownerCurrency)}</td>
                                                <td className="p-3 text-right font-medium">{formatCurrency(item.total_price, ownerCurrency)}</td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan="4" className="p-3 text-center text-slate-500">No items found</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    {/* Totals */}
                    <section className="flex justify-end mb-8">
                        <div className="w-full max-w-sm">
                            <div className="flex justify-between py-2 border-b">
                                <span className="text-slate-600">Subtotal</span>
                                <span className="font-medium">{formatCurrency(invoice.subtotal, ownerCurrency)}</span>
                            </div>
                            <div className="flex justify-between py-2 border-b">
                                <span className="text-slate-600">Tax ({invoice.tax_rate}%)</span>
                                <span className="font-medium">{formatCurrency(invoice.tax_amount, ownerCurrency)}</span>
                            </div>
                            <div className="flex justify-between py-3 bg-slate-50 -mx-4 px-4 rounded-md">
                                <span className="text-xl font-bold text-slate-900">Total</span>
                                <span className="text-xl font-bold text-slate-900">{formatCurrency(invoice.total_amount, ownerCurrency)}</span>
                            </div>
                        </div>
                    </section>

                    {/* Notes & Footer */}
                    <footer className="pt-6 border-t-2 border-slate-200 text-sm text-slate-600">
                        {invoice.notes && (
                            <div>
                                <h4 className="font-semibold text-slate-800 mb-2">Notes</h4>
                                <p className="whitespace-pre-line">{invoice.notes}</p>
                            </div>
                        )}
                        <p className="mt-6 text-center text-xs text-slate-500">
                            Thank you for your business! If you have any questions, please contact {invoice.owner_email || 'us'}.
                        </p>
                    </footer>
                </div>
            </div>
        </div>
    );
}
