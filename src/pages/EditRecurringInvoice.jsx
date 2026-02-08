import { useState, useEffect } from "react";
import { RecurringInvoice, Client, BankingDetail, Service } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { motion } from "framer-motion";
import { useToast } from "@/components/ui/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

import ProjectDetails from "../components/invoice/ProjectDetails";
import RecurringInvoicePreview from "../components/recurring/RecurringInvoicePreview";
import DraftRecurringInvoiceInfo from "../components/recurring/DraftRecurringInvoiceInfo";

export default function EditRecurringInvoice() {
    const navigate = useNavigate();
    const location = useLocation();
    const { toast } = useToast();

    const [templateData, setTemplateData] = useState(null);
    const [invoiceData, setInvoiceData] = useState({
        client_id: "",
        line_items: [{ description: "", quantity: 1, unit_price: 0, amount: 0 }],
        banking_detail_id: "",
        tax_rate: 0,
        currency: "ZAR",
        notes: "",
        frequency: "monthly",
        start_date: new Date().toISOString().split('T')[0],
        end_date: null,
    });

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [clients, setClients] = useState([]);
    const [bankingDetails, setBankingDetails] = useState([]);
    const [services, setServices] = useState([]);
    const [currentStep, setCurrentStep] = useState("details");
    const [originalStatus, setOriginalStatus] = useState("draft");

    useEffect(() => {
        loadInitialData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadInitialData = async () => {
        setIsLoading(true);
        try {
            const queryParams = new URLSearchParams(location.search);
            const templateId = queryParams.get("id");

            if (!templateId) {
                toast({
                    title: "Error",
                    description: "No template ID provided",
                    variant: "destructive",
                });
                navigate(createPageUrl("recurring-invoices"));
                return;
            }

            const [template, clientsData, bankingDetailsData, servicesData] = await Promise.all([
                RecurringInvoice.get(templateId),
                Client.list(),
                BankingDetail.list(),
                Service.list(),
            ]);

            if (!template) {
                toast({
                    title: "Error",
                    description: "Template not found",
                    variant: "destructive",
                });
                navigate(createPageUrl("recurring-invoices"));
                return;
            }

            setTemplateData(template);
            setOriginalStatus(template.status);
            setClients(clientsData || []);
            setBankingDetails(bankingDetailsData || []);
            setServices(servicesData || []);

            // Map template data to invoice form
            setInvoiceData({
                client_id: template.client_id || "",
                line_items: template.line_items || [{ description: "", quantity: 1, unit_price: 0, amount: 0 }],
                banking_detail_id: template.banking_detail_id || "",
                tax_rate: template.tax_rate || 0,
                currency: template.currency || "ZAR",
                notes: template.notes || "",
                frequency: template.frequency || "monthly",
                start_date: template.start_date || new Date().toISOString().split('T')[0],
                end_date: template.end_date || null,
            });
        } catch (error) {
            console.error("Error loading template:", error);
            toast({
                title: "Error",
                description: "Failed to load template",
                variant: "destructive",
            });
        }
        setIsLoading(false);
    };

    const handleUpdateTemplate = async (saveAsDraft) => {
        if (!templateData?.id) return;

        setIsSaving(true);
        try {
            const updateData = {
                ...invoiceData,
                status: saveAsDraft ? "draft" : "active",
                last_modified_date: new Date().toISOString(),
            };

            // Only set activation_date when converting draft to active
            if (originalStatus === "draft" && !saveAsDraft) {
                updateData.activation_date = new Date().toISOString();
            }

            await RecurringInvoice.update(templateData.id, updateData);

            const action = saveAsDraft ? "saved as draft" : "activated";
            toast({
                title: "Success",
                description: `✓ Template ${action} successfully`,
            });

            // Refresh and navigate back
            setTimeout(() => {
                navigate(createPageUrl("recurring-invoices"));
            }, 1500);
        } catch (error) {
            console.error("Error updating template:", error);
            toast({
                title: "Error",
                description: "Failed to update template",
                variant: "destructive",
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleStepChange = (step) => {
        setCurrentStep(step);
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
                <div className="max-w-5xl mx-auto space-y-6">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-96 w-full" />
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
            <div className="max-w-5xl mx-auto space-y-6">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex items-center justify-between"
                >
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
                            Edit Recurring Template
                        </h1>
                        <p className="text-sm sm:text-base text-gray-600">Update details for this recurring invoice template.</p>
                    </div>
                    <Button
                        variant="outline"
                        onClick={() => navigate(createPageUrl("recurring-invoices"))}
                        className="gap-2"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back
                    </Button>
                </motion.div>

                {/* Draft Warning Banner */}
                {templateData?.status === "draft" && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                    >
                        <Alert className="border-blue-200 bg-blue-50">
                            <AlertCircle className="h-4 w-4 text-blue-600" />
                            <AlertTitle className="text-blue-900">Draft Template</AlertTitle>
                            <AlertDescription className="text-blue-800">
                                This template is still a draft and won&apos;t generate invoices automatically.
                                You can continue editing and activate it when ready.
                            </AlertDescription>
                        </Alert>
                    </motion.div>
                )}

                {/* Template Info Card */}
                {templateData && (
                    <DraftRecurringInvoiceInfo template={templateData} />
                )}

                {/* Form Steps */}
                {currentStep === "details" && (
                    <motion.div
                        key="details"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                    >
                        <ProjectDetails
                            invoiceData={invoiceData}
                            setInvoiceData={setInvoiceData}
                            clients={clients}
                            bankingDetails={bankingDetails}
                            services={services}
                            isRecurring={true}
                        />
                        <div className="flex justify-end mt-6">
                            <Button
                                onClick={() => handleStepChange("preview")}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl"
                            >
                                Continue to Preview →
                            </Button>
                        </div>
                    </motion.div>
                )}

                {/* Preview Step */}
                {currentStep === "preview" && (
                    <motion.div
                        key="preview"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                    >
                        <RecurringInvoicePreview
                            invoiceData={invoiceData}
                            clients={clients}
                            bankingDetails={bankingDetails}
                            onPrevious={() => handleStepChange("details")}
                            onCreate={handleUpdateTemplate}
                            isEditing={true}
                            isLoading={isSaving}
                        />
                    </motion.div>
                )}
            </div>
        </div>
    );
}
