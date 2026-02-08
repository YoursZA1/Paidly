import React, { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function DocumentLayout({ user, title, documentNumber, date, children, downloadUrl, autoDownload = false }) {
    const printPDF = () => {
        window.print();
    };

    // Auto-download PDF on mount if autoDownload is true
    useEffect(() => {
        if (autoDownload) {
            // Small delay to ensure content is rendered
            const timer = setTimeout(() => {
                window.print();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [autoDownload]);

    return (
        <>
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    body { margin: 0; background-color: white; }
                    .print-container { box-shadow: none !important; margin: 0 !important; border: none !important; }
                }
                @page {
                    margin: 0.5in;
                    size: A4;
                }
            `}</style>

            <div className="min-h-screen bg-gray-100 py-4 sm:py-8 print:bg-white print:py-0">
                <div className="w-full max-w-4xl mx-auto px-2 sm:px-4">
                    <div className="no-print mb-4 flex justify-end gap-2">
                        <Button
                            onClick={() => window.history.back()}
                            variant="outline"
                            className="px-4 sm:px-6 py-2 rounded-lg text-sm"
                        >
                            Back
                        </Button>
                        {downloadUrl ? (
                             <a
                                href={downloadUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-indigo-600 text-white hover:bg-indigo-700 h-10 px-4 sm:px-6 py-2"
                            >
                                Download PDF
                            </a>
                        ) : (
                            <Button
                                onClick={printPDF}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 sm:px-6 py-2 rounded-lg text-sm"
                            >
                                Download PDF
                            </Button>
                        )}
                    </div>

                    <div className="print-container bg-white shadow-lg rounded-lg p-4 sm:p-8 print:shadow-none print:rounded-none overflow-x-auto">
                        {/* Header */}
                        <header className="border-b-2 border-gray-200 pb-4 sm:pb-6 mb-4 sm:mb-6">
                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                                <div>
                                    {user?.logo_url ? (
                                        <img src={user.logo_url} alt="Company Logo" className="h-12 sm:h-16 w-auto mb-2 sm:mb-4 object-contain" />
                                    ) : (
                                        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
                                            {user?.company_name || 'Your Company'}
                                        </h1>
                                    )}
                                    {user?.company_address && (
                                        <p className="text-gray-600 mt-2 whitespace-pre-line text-xs sm:text-sm">{user.company_address}</p>
                                    )}
                                </div>
                                <div className="text-left sm:text-right">
                                    <h2 className="text-2xl sm:text-3xl font-bold text-indigo-600 mb-2">{title}</h2>
                                    {documentNumber && <p className="text-gray-600 text-sm"><strong>#:</strong> {documentNumber}</p>}
                                    {date && <p className="text-gray-600 text-sm"><strong>Date:</strong> {date}</p>}
                                </div>
                            </div>
                        </header>

                        {/* Content */}
                        <main>
                            {children}
                        </main>
                    </div>
                </div>
            </div>
        </>
    );
}