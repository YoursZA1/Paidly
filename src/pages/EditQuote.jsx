import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Quote, Client, User } from '@/api/entities';
import { snapshotDocumentBrandForPersist } from '@/utils/documentBrandColors';
import { useServicesCatalogQuery } from '@/hooks/useServicesCatalogQuery';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Save } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { createViewDocumentUrl } from '@/utils';
import { motion } from 'framer-motion';
import QuoteDetails from '../components/quote/QuoteDetails';

export default function EditQuote() {
    const [quoteData, setQuoteData] = useState(null);
    const [clients, setClients] = useState([]);
    const { data: services = [], refetch: refetchCatalog } = useServicesCatalogQuery();
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const location = useLocation();
    const navigate = useNavigate();
    const quoteId = new URLSearchParams(location.search).get('id');

    useEffect(() => {
        if (quoteId) {
            loadInitialData(quoteId);
        } else {
            setError("Quote ID not found");
            setIsLoading(false);
        }
    }, [quoteId]);

    const loadInitialData = async (id) => {
        setIsLoading(true);
        try {
            const [quote, clientsData] = await Promise.all([
                Quote.get(id),
                Client.list("-created_date"),
            ]);

            if (!quote) throw new Error("Quote not found");
            
            setQuoteData(quote);
            setClients(clientsData);
        } catch (err) {
            console.error("Error loading data:", err);
            setError(err.message || "Failed to load data");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveChanges = async () => {
        if (!quoteData) return;
        try {
            const me = await User.me().catch(() => null);
            const brandPatch = me ? snapshotDocumentBrandForPersist(me) : {};
            await Quote.update(quoteId, { ...quoteData, ...brandPatch });
            navigate(createViewDocumentUrl("quote", quoteId));
        } catch (error) {
            console.error("Error saving quote:", error);
            setError("Failed to save changes.");
        }
    };
    
    if (isLoading) {
        return <div className="p-8"><Skeleton className="h-96 w-full" /></div>;
    }
    
    if (error) {
        return <div className="p-8 text-red-500">Error: {error}</div>;
    }

    return (
        <div className="min-h-screen bg-slate-100 p-4 sm:p-6">
            <div className="max-w-4xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="flex items-center gap-4 mb-8"
                >
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => navigate(createViewDocumentUrl("quote", quoteId))}
                        className="rounded-lg border-gray-200 hover:bg-gray-50"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <div>
                        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Edit Quote</h1>
                        <p className="text-sm sm:text-base text-gray-600 mt-1">
                            Editing quote #{quoteData.quote_number}
                        </p>
                    </div>
                </motion.div>

                <QuoteDetails
                    quoteData={quoteData}
                    setQuoteData={setQuoteData}
                    clients={clients}
                    services={services}
                    onNext={handleSaveChanges}
                    isEditing={true}
                    onRefreshCatalog={refetchCatalog}
                />
            </div>
        </div>
    );
}