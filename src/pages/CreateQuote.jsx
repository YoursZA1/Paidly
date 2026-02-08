import React, { useState, useEffect } from "react";
import { Quote, Client, Service, QuoteTemplate } from "@/api/entities";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import { createPageUrl } from "@/utils";
import { motion } from "framer-motion";

import QuoteDetails from "../components/quote/QuoteDetails";
import QuotePreview from "../components/quote/QuotePreview";

// Helper function to generate payment terms text for quotes
const getDefaultPaymentTermsText = (terms, days) => {
    if (!terms || terms === 'net_30') {
        return `Payment is due within 30 days of invoice date.\n\nLate payments may incur a 1.5% monthly service charge.\nAll payments should be made to the banking details provided.`;
    }
    
    if (terms === 'due_on_receipt') {
        return `Payment is due immediately upon acceptance of this quote.\n\nPlease remit payment to the banking details provided.\nThank you for your prompt payment.`;
    }
    
    const termDays = terms === 'custom' ? (days || 30) : parseInt(terms.split('_')[1] || 30);
    
    return `Payment is due within ${termDays} days of invoice date upon acceptance.\n\nLate payments may incur a 1.5% monthly service charge.\nAll payments should be made to the banking details provided.`;
};

export default function CreateQuote() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const [clients, setClients] = useState([]);
    const [services, setServices] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [selectedTemplate, setSelectedTemplate] = useState("");
    const defaultValidUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
    const [quoteData, setQuoteData] = useState({
        client_id: "",
        project_title: "",
        project_description: "",
        items: [],
        subtotal: 0,
        tax_rate: 0,
        tax_amount: 0,
        total_amount: 0,
        valid_until: defaultValidUntil,
        notes: "",
        terms_conditions: ""
    });

    useEffect(() => {
        loadData();
    }, []);

    // Auto-populate payment terms when client is selected
    useEffect(() => {
        if (quoteData.client_id && clients.length > 0) {
            const selectedClient = clients.find(c => c.id === quoteData.client_id);
            if (selectedClient && selectedClient.payment_terms && !quoteData.terms_conditions) {
                const termsText = getDefaultPaymentTermsText(
                    selectedClient.payment_terms,
                    selectedClient.payment_terms_days
                );
                setQuoteData(prev => ({
                    ...prev,
                    terms_conditions: termsText
                }));
            }
        }
    }, [quoteData.client_id, clients]);

    const loadData = async () => {
        try {
            const [clientsData, servicesData, templatesData] = await Promise.all([
                Client.list("-created_date"),
                Service.list("-created_date"),
                QuoteTemplate.list("-created_date")
            ]);
            setClients(clientsData);
            setServices(servicesData);
            setTemplates(templatesData);
        } catch (error) {
            console.error("Error loading data:", error);
        }
    };

    const handleTemplateSelect = (templateId) => {
        const template = templates.find(t => t.id === templateId);
        if (template) {
            setSelectedTemplate(templateId);
            setQuoteData(prev => ({
                ...prev,
                project_title: template.project_title || prev.project_title,
                project_description: template.project_description || prev.project_description,
                items: template.items || [],
                notes: template.notes || prev.notes,
                terms_conditions: template.terms_conditions || prev.terms_conditions,
                // Recalculate totals
                subtotal: (template.items || []).reduce((sum, item) => sum + item.total_price, 0),
                total_amount: (template.items || []).reduce((sum, item) => sum + item.total_price, 0) // Simplified, tax would need recalc
            }));
        }
    };

    const handleCreateQuote = async () => {
        try {
            const client = clients.find(c => c.id === quoteData.client_id);
            const getInitials = (name) => {
                if (!name) return "CL";
                const parts = name.trim().split(/\s+/);
                if (parts.length > 1) {
                    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
                }
                return name.substring(0, 2).toUpperCase();
            };
            
            const clientInitials = getInitials(client?.name);
            const now = new Date();
            const datePart = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
            const timePart = `${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`;
            const quoteNumber = `QUO-${datePart}-${clientInitials}-${timePart}`;

            await Quote.create({
                ...quoteData,
                quote_number: quoteNumber,
                status: 'draft'
            });

            // Show success notification
            toast({
                title: "✓ Quote Created",
                description: `Quote ${quoteNumber} has been created successfully.`,
                variant: "default"
            });

            // Navigate after a short delay to allow user to see the notification
            setTimeout(() => {
                navigate(createPageUrl("Quotes"));
            }, 1500);
        } catch (error) {
            console.error("Error creating quote:", error);
            toast({
                title: "✗ Error",
                description: "Failed to create quote. Please try again.",
                variant: "destructive"
            });
        }
    };

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
                        onClick={() => navigate(createPageUrl("Quotes"))}
                        className="rounded-lg border-gray-200 hover:bg-gray-50"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <div>
                        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Create New Quote</h1>
                        <p className="text-sm sm:text-base text-gray-600 mt-1">Professional quotation for your clients</p>
                    </div>
                </motion.div>

                {/* Step Content */}
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-6"
                >
                    {templates.length > 0 && (
                        <Card className="bg-slate-50 border-slate-200">
                            <CardContent className="p-4 flex items-center gap-4">
                                <Label className="whitespace-nowrap">Start from Template:</Label>
                                <Select value={selectedTemplate} onValueChange={handleTemplateSelect}>
                                    <SelectTrigger className="w-full sm:w-[300px] bg-white">
                                        <SelectValue placeholder="Select a template..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {templates.map(t => (
                                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </CardContent>
                        </Card>
                    )}

                    <QuoteDetails
                        quoteData={quoteData}
                        setQuoteData={setQuoteData}
                        clients={clients}
                        services={services}
                        showNextButton={false}
                    />

                    <QuotePreview
                        quoteData={quoteData}
                        clients={clients}
                        onCreate={handleCreateQuote}
                        showBack={false}
                    />
                </motion.div>
            </div>
        </div>
    );
}