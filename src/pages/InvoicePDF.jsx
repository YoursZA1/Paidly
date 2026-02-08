import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Invoice, Client, User, BankingDetail } from '@/api/entities';
import { format, isValid, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';

// Import templates
import ClassicTemplate from '../components/invoice/templates/ClassicTemplate';
import ModernTemplate from '../components/invoice/templates/ModernTemplate';
import MinimalTemplate from '../components/invoice/templates/MinimalTemplate';
import BoldTemplate from '../components/invoice/templates/BoldTemplate';

const TEMPLATES = {
    classic: ClassicTemplate,
    modern: ModernTemplate,
    minimal: MinimalTemplate,
    bold: BoldTemplate
};

export default function InvoicePDF() {
    const location = useLocation();
    const urlParams = new URLSearchParams(location.search);
    const invoiceId = urlParams.get('id');
    const autoDownload = urlParams.get('download') === 'true';
    const [invoice, setInvoice] = useState(null);
    const [client, setClient] = useState(null);
    const [user, setUser] = useState(null);
    const [bankingDetail, setBankingDetail] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (invoiceId) {
            loadInvoiceData();
        }
    }, [invoiceId]);

    useEffect(() => {
        if (autoDownload && !isLoading && invoice) {
            const timer = setTimeout(() => {
                window.print();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [autoDownload, isLoading, invoice]);

    const loadInvoiceData = async () => {
        try {
            const invoiceRecord = await Invoice.get(invoiceId);
            if (!invoiceRecord) {
                setIsLoading(false);
                return;
            }
            
            const [clientData, userData, bankingData] = await Promise.all([
                Client.get(invoiceRecord.client_id),
                User.me(),
                invoiceRecord.banking_detail_id 
                    ? BankingDetail.get(invoiceRecord.banking_detail_id).catch(() => null)
                    : Promise.resolve(null)
            ]);
            
            setInvoice(invoiceRecord);
            setClient(clientData || null);
            setUser(userData);
            setBankingDetail(bankingData || null);
        } catch (error) {
            console.error('Error loading invoice data:', error);
        }
        setIsLoading(false);
    };

    const safeFormatDate = (dateStr) => {
        if (!dateStr) return 'N/A';
        const date = parseISO(dateStr);
        return isValid(date) ? format(date, 'MMMM d, yyyy') : 'N/A';
    };

    if (isLoading) {
        return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
    }

    if (!invoice || !client || !user) {
        return <div className="flex items-center justify-center min-h-screen">Document not found.</div>;
    }
    
    const userCurrency = user?.currency || 'ZAR';
    const templateKey = user?.invoice_template || 'classic';
    const TemplateComponent = TEMPLATES[templateKey] || TEMPLATES.classic;

    return (
        <>
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    body { margin: 0; background-color: white; }
                    .print-container { box-shadow: none !important; margin: 0 !important; border: none !important; }
                    .pdf-page { padding: 0 !important; }
                }
                @page {
                    margin: 0.5in;
                    size: A4;
                }
                @media screen {
                    .pdf-page { max-width: 8.27in; margin: 0 auto; }
                    .pdf-content table { width: 100%; border-collapse: collapse; }
                    .pdf-content th,
                    .pdf-content td { word-break: break-word; }
                }
                @media (max-width: 640px) {
                    .pdf-wrapper { padding: 12px !important; }
                    .pdf-page { padding: 16px !important; border-radius: 12px !important; }
                    .pdf-content { font-size: 12px; }
                    .pdf-content h1 { font-size: 20px; }
                    .pdf-content h2 { font-size: 18px; }
                    .pdf-content h3 { font-size: 14px; }
                    .pdf-content table { font-size: 12px; }
                }
            `}</style>

            <div className="min-h-screen bg-gray-100 py-4 sm:py-8 print:bg-white print:py-0">
                <div className="pdf-wrapper w-full max-w-4xl mx-auto px-2 sm:px-4">
                    <div className="no-print mb-4 flex justify-end gap-2">
                        <Button
                            onClick={() => window.history.back()}
                            variant="outline"
                            className="px-4 sm:px-6 py-2 rounded-lg text-sm"
                        >
                            Back
                        </Button>
                        <Button
                            onClick={() => window.print()}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 sm:px-6 py-2 rounded-lg text-sm"
                        >
                            Download PDF
                        </Button>
                    </div>

                    <div className="print-container pdf-page bg-white shadow-lg rounded-lg p-4 sm:p-8 print:shadow-none print:rounded-none overflow-x-auto">
                        <div className="pdf-content">
                            <TemplateComponent
                                invoice={invoice}
                                client={client}
                                user={user}
                                bankingDetail={bankingDetail}
                                userCurrency={userCurrency}
                                safeFormatDate={safeFormatDate}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}