import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { RecurringInvoice, Client, BankingDetail, Service } from '@/api/entities';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Save } from 'lucide-react';
import ProjectDetails from '@/components/invoice/ProjectDetails'; // Re-using this component for item entry
import HelpTooltip from '@/components/shared/HelpTooltip';
import { formatISO, add } from 'date-fns';
import { createPageUrl } from '@/utils';

export default function CreateRecurringInvoice() {
    const navigate = useNavigate();
    const [clients, setClients] = useState([]);
    const [bankingDetails, setBankingDetails] = useState([]);
    const [services, setServices] = useState([]);
    
    const [profileName, setProfileName] = useState('');
    const [clientId, setClientId] = useState('');
    const [frequency, setFrequency] = useState('monthly');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    
    // The invoice data that will serve as the template
    const [invoiceTemplate, setInvoiceTemplate] = useState({
        project_title: "",
        items: [],
        tax_rate: 0,
        banking_detail_id: "",
        notes: ""
    });

    useEffect(() => {
        const loadInitialData = async () => {
            try {
                const [clientsData, bankingData, servicesData] = await Promise.all([
                    Client.list("-created_date"),
                    BankingDetail.list("-created_date"),
                    Service.list("-created_date")
                ]);
                setClients(clientsData);
                setBankingDetails(bankingData);
                setServices(servicesData);
            } catch (error) {
                console.error("Error loading data:", error);
            }
        };
        loadInitialData();
    }, []);

    const handleCreateProfile = async () => {
        if (!profileName || !clientId || !frequency || !startDate) {
            alert("Please fill all required fields.");
            return;
        }

        try {
            // Remove fields from template that will be calculated on generation
            const { subtotal, tax_amount, total_amount, ...template } = invoiceTemplate;

            const payload = {
                profile_name: profileName,
                client_id: clientId,
                invoice_template: template,
                frequency,
                start_date: startDate,
                end_date: endDate || null,
                next_generation_date: startDate, // First generation is on the start date
                status: 'active',
            };

            await RecurringInvoice.create(payload);
            navigate(createPageUrl('RecurringInvoices'));

        } catch (error) {
            console.error("Error creating recurring profile:", error);
            alert("Failed to create profile. See console for details.");
        }
    };

    return (
        <div className="min-h-screen bg-slate-100 p-4 sm:p-6">
            <div className="max-w-4xl mx-auto">
                <div className="flex items-center gap-4 mb-8">
                    <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-semibold text-gray-900">Create Recurring Invoice Profile</h1>
                        <p className="text-gray-600">Set up an automated invoice schedule for a client.</p>
                    </div>
                </div>

                <div className="space-y-8">
                    <Card>
                        <CardHeader>
                            <CardTitle>Schedule Settings</CardTitle>
                        </CardHeader>
                        <CardContent className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="profile_name">Profile Name*</Label>
                                <Input id="profile_name" value={profileName} onChange={e => setProfileName(e.target.value)} placeholder="e.g., Monthly Retainer" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="client">Client*</Label>
                                <Select value={clientId} onValueChange={setClientId}>
                                    <SelectTrigger><SelectValue placeholder="Select a client" /></SelectTrigger>
                                    <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="frequency" className="flex items-center">
                                    Frequency*
                                    <HelpTooltip content="How often should this invoice be generated automatically?" />
                                </Label>
                                <Select value={frequency} onValueChange={setFrequency}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="weekly">Weekly</SelectItem>
                                        <SelectItem value="monthly">Monthly</SelectItem>
                                        <SelectItem value="yearly">Yearly</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="start_date" className="flex items-center">
                                    Start Date*
                                    <HelpTooltip content="The date when the first invoice will be generated." />
                                </Label>
                                <Input id="start_date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="end_date" className="flex items-center">
                                    End Date (Optional)
                                    <HelpTooltip content="Automatically stop generating invoices after this date." />
                                </Label>
                                <Input id="end_date" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                            </div>
                        </CardContent>
                    </Card>

                    {/* We are reusing the ProjectDetails component to handle the line items, tax, etc. */}
                    <ProjectDetails
                        invoiceData={invoiceTemplate}
                        setInvoiceData={setInvoiceTemplate}
                        clients={clients}
                        bankingDetails={bankingDetails}
                        services={services}
                        onNext={() => {}} // We don't need the 'Next' button functionality here
                    />

                    <div className="flex justify-end">
                        <Button onClick={handleCreateProfile} size="lg">
                            <Save className="w-4 h-4 mr-2"/>
                            Create Recurring Profile
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}