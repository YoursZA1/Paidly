import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { X, Save, User, Lock, ChevronDown } from "lucide-react";
import { motion } from "framer-motion";
import { industries } from "./IndustryBadge";
import { cn } from "@/lib/utils";

function emptyClientState(client) {
    return {
        name: client?.name || "",
        email: client?.email || "",
        phone: client?.phone || "",
        address: client?.address || "",
        contact_person: client?.contact_person || "",
        website: client?.website || "",
        tax_id: client?.tax_id || "",
        fax: client?.fax || "",
        alternate_email: client?.alternate_email || "",
        notes: client?.notes || "",
        internal_notes: client?.internal_notes || "",
        industry: client?.industry || "",
        payment_terms: client?.payment_terms || "net_30",
        payment_terms_days: client?.payment_terms_days || 30,
        follow_up_enabled: client?.follow_up_enabled !== false,
    };
}

function SectionCollapsible({ title, defaultOpen, children }) {
    return (
        <Collapsible
            defaultOpen={defaultOpen}
            className="overflow-hidden rounded-xl border border-border/50 bg-card/25"
        >
            <CollapsibleTrigger
                type="button"
                className="group flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/30"
            >
                <span>{title}</span>
                <ChevronDown className="h-4 w-4 shrink-0 opacity-60 transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="border-t border-border/40 px-4 pb-4 pt-3">{children}</CollapsibleContent>
        </Collapsible>
    );
}

export default function ClientForm({ client = null, onSave, onCancel, layout = "dialog" }) {
    const [formData, setFormData] = useState(() => emptyClientState(client));
    const isPage = layout === "page";

    useEffect(() => {
        setFormData(emptyClientState(client));
    }, [client?.id]);

    const handleInputChange = (field, value) => {
        setFormData((prev) => ({
            ...prev,
            [field]: value,
        }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    const isValid = formData.name.trim() && formData.email.trim();

    const paymentTermsBlock = (
        <div
            className={cn(
                "space-y-4 rounded-xl p-4",
                isPage ? "border border-border/60 bg-muted/20" : "border border-primary/20 bg-primary/10"
            )}
        >
            <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold uppercase text-foreground">Default payment terms</h3>
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                    Auto-applies to invoices
                </Badge>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                    <Label htmlFor="payment_terms" className="text-sm font-semibold text-foreground">
                        Payment terms
                    </Label>
                    <Select
                        value={formData.payment_terms}
                        onValueChange={(value) => {
                            handleInputChange("payment_terms", value);
                            if (value === "due_on_receipt") handleInputChange("payment_terms_days", 0);
                            else if (value === "net_15") handleInputChange("payment_terms_days", 15);
                            else if (value === "net_30") handleInputChange("payment_terms_days", 30);
                            else if (value === "net_45") handleInputChange("payment_terms_days", 45);
                            else if (value === "net_60") handleInputChange("payment_terms_days", 60);
                            else if (value === "net_90") handleInputChange("payment_terms_days", 90);
                        }}
                    >
                        <SelectTrigger id="payment_terms" className="h-12 rounded-xl">
                            <SelectValue placeholder="Select payment terms" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="due_on_receipt">Due on Receipt</SelectItem>
                            <SelectItem value="net_15">Net 15 Days</SelectItem>
                            <SelectItem value="net_30">Net 30 Days</SelectItem>
                            <SelectItem value="net_45">Net 45 Days</SelectItem>
                            <SelectItem value="net_60">Net 60 Days</SelectItem>
                            <SelectItem value="net_90">Net 90 Days</SelectItem>
                            <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {formData.payment_terms === "custom" && (
                    <div className="space-y-2">
                        <Label htmlFor="payment_terms_days" className="text-sm font-semibold text-foreground">
                            Custom days
                        </Label>
                        <Input
                            id="payment_terms_days"
                            type="number"
                            min="0"
                            value={formData.payment_terms_days}
                            onChange={(e) => handleInputChange("payment_terms_days", parseInt(e.target.value, 10) || 0)}
                            placeholder="Number of days"
                            className="h-12 rounded-xl border-border focus:border-primary focus:ring-primary/20"
                        />
                    </div>
                )}
            </div>

            <p className="text-xs text-muted-foreground">These terms apply to new invoices for this client.</p>
        </div>
    );

    const contactGrid = (
        <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-semibold text-foreground">
                    Client name *
                </Label>
                <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleInputChange("name", e.target.value)}
                    placeholder="Enter client name"
                    className="h-12 rounded-xl border-border focus:border-primary focus:ring-primary/20"
                    data-testid="client-name"
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-semibold text-foreground">
                    Email *
                </Label>
                <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange("email", e.target.value)}
                    placeholder="client@example.com"
                    className="h-12 rounded-xl border-border focus:border-primary focus:ring-primary/20"
                    data-testid="client-email"
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="phone" className="text-sm font-semibold text-foreground">
                    Phone
                </Label>
                <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => handleInputChange("phone", e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="h-12 rounded-xl border-border focus:border-primary focus:ring-primary/20"
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="contact_person" className="text-sm font-semibold text-foreground">
                    Contact person
                </Label>
                <Input
                    id="contact_person"
                    value={formData.contact_person}
                    onChange={(e) => handleInputChange("contact_person", e.target.value)}
                    placeholder="Primary contact name"
                    className="h-12 rounded-xl border-border focus:border-primary focus:ring-primary/20"
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="website" className="text-sm font-semibold text-foreground">
                    Website
                </Label>
                <Input
                    id="website"
                    type="url"
                    value={formData.website}
                    onChange={(e) => handleInputChange("website", e.target.value)}
                    placeholder="https://example.com"
                    className="h-12 rounded-xl border-border focus:border-primary focus:ring-primary/20"
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="tax_id" className="text-sm font-semibold text-foreground">
                    Tax ID / VAT
                </Label>
                <Input
                    id="tax_id"
                    value={formData.tax_id}
                    onChange={(e) => handleInputChange("tax_id", e.target.value)}
                    placeholder="Tax ID or VAT number"
                    className="h-12 rounded-xl border-border focus:border-primary focus:ring-primary/20"
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="alternate_email" className="text-sm font-semibold text-foreground">
                    Alternate email
                </Label>
                <Input
                    id="alternate_email"
                    type="email"
                    value={formData.alternate_email}
                    onChange={(e) => handleInputChange("alternate_email", e.target.value)}
                    placeholder="alternate@example.com"
                    className="h-12 rounded-xl border-border focus:border-primary focus:ring-primary/20"
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="fax" className="text-sm font-semibold text-foreground">
                    Fax
                </Label>
                <Input
                    id="fax"
                    value={formData.fax}
                    onChange={(e) => handleInputChange("fax", e.target.value)}
                    placeholder="+1 (555) 000-0001"
                    className="h-12 rounded-xl border-border focus:border-primary focus:ring-primary/20"
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="industry" className="text-sm font-semibold text-foreground">
                    Industry
                </Label>
                <Select value={formData.industry} onValueChange={(value) => handleInputChange("industry", value)}>
                    <SelectTrigger id="industry" className="h-12 rounded-xl">
                        <SelectValue placeholder="Select industry" />
                    </SelectTrigger>
                    <SelectContent>
                        {industries.map((ind) => (
                            <SelectItem key={ind.value} value={ind.value}>
                                {ind.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>
    );

    const notesGrid = (
        <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
                <Label htmlFor="notes" className="text-sm font-semibold text-foreground">
                    Client notes
                </Label>
                <p className="text-xs text-muted-foreground">Visible to the client (portal / emails)</p>
                <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => handleInputChange("notes", e.target.value)}
                    placeholder="Public notes about this client..."
                    className="min-h-32 resize-none rounded-xl border-border focus:border-primary focus:ring-primary/20"
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="internal_notes" className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Lock className="h-4 w-4" />
                    Internal notes
                </Label>
                <p className="text-xs text-muted-foreground">Private — your team only</p>
                <Textarea
                    id="internal_notes"
                    value={formData.internal_notes}
                    onChange={(e) => handleInputChange("internal_notes", e.target.value)}
                    placeholder="Internal notes, reminders, special requirements..."
                    className="min-h-32 resize-none rounded-xl border-amber-200 bg-amber-50/30 focus:border-amber-500 focus:ring-amber-500/20"
                />
            </div>
        </div>
    );

    const followUpRow = (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 bg-muted/40 p-4">
            <div>
                <Label htmlFor="follow_up_enabled" className="text-sm font-semibold text-foreground">
                    Automated follow-up reminders
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">Send reminders for overdue invoices</p>
            </div>
            <Switch
                id="follow_up_enabled"
                checked={formData.follow_up_enabled}
                onCheckedChange={(checked) => handleInputChange("follow_up_enabled", checked)}
            />
        </div>
    );

    const addressBlock = (
        <div className="space-y-2">
            <Label htmlFor="address" className="text-sm font-semibold text-foreground">
                Address
            </Label>
            <Textarea
                id="address"
                value={formData.address}
                onChange={(e) => handleInputChange("address", e.target.value)}
                placeholder="Business address"
                className="min-h-24 resize-none rounded-xl border-border focus:border-primary focus:ring-primary/20"
            />
        </div>
    );

    const footerButtons = (
        <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onCancel} className="rounded-xl px-6" data-testid="client-cancel">
                Cancel
            </Button>
            <Button
                type="submit"
                disabled={!isValid}
                className="rounded-xl bg-primary px-6 text-primary-foreground shadow-md hover:bg-primary/90 disabled:opacity-50"
                data-testid="client-save"
            >
                <Save className="mr-2 h-4 w-4" />
                {client ? "Update client" : "Save client"}
            </Button>
        </div>
    );

    if (isPage) {
        return (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="mb-0">
                <form id="client-editor-form" onSubmit={handleSubmit} className="space-y-3">
                    <SectionCollapsible title="Contact" defaultOpen>
                        {contactGrid}
                    </SectionCollapsible>
                    <SectionCollapsible title="Address" defaultOpen={false}>
                        {addressBlock}
                    </SectionCollapsible>
                    <SectionCollapsible title="Invoicing defaults" defaultOpen={false}>
                        {paymentTermsBlock}
                    </SectionCollapsible>
                    <SectionCollapsible title="Notes" defaultOpen={false}>
                        {notesGrid}
                    </SectionCollapsible>
                    <SectionCollapsible title="Preferences" defaultOpen={false}>
                        {followUpRow}
                    </SectionCollapsible>
                </form>
            </motion.div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="mb-8"
        >
            <Card className="border-0 bg-card/95 shadow-xl backdrop-blur-sm dark:border dark:border-border">
                <CardHeader className="border-b border-border pb-6">
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2 text-xl font-bold text-foreground">
                            <User className="h-5 w-5" />
                            {client ? "Edit client" : "Add new client"}
                        </CardTitle>
                        <Button variant="ghost" size="icon" onClick={onCancel} className="hover:bg-muted">
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </CardHeader>

                <CardContent className="p-8">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {contactGrid}
                        {paymentTermsBlock}
                        {addressBlock}
                        {notesGrid}
                        {followUpRow}
                        {footerButtons}
                    </form>
                </CardContent>
            </Card>
        </motion.div>
    );
}

ClientForm.propTypes = {
    client: PropTypes.shape({
        id: PropTypes.string,
        name: PropTypes.string,
        email: PropTypes.string,
        phone: PropTypes.string,
        address: PropTypes.string,
        contact_person: PropTypes.string,
        website: PropTypes.string,
        tax_id: PropTypes.string,
        fax: PropTypes.string,
        alternate_email: PropTypes.string,
        notes: PropTypes.string,
        internal_notes: PropTypes.string,
        industry: PropTypes.string,
        payment_terms: PropTypes.string,
        payment_terms_days: PropTypes.number,
        follow_up_enabled: PropTypes.bool,
    }),
    onSave: PropTypes.func.isRequired,
    onCancel: PropTypes.func.isRequired,
    layout: PropTypes.oneOf(["dialog", "page"]),
};
