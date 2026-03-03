import React, { useState, useEffect } from "react";
import { Vendor, User } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Plus, Search, Pencil, Trash2, Building2, Phone, Mail } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export default function VendorsPage() {
    const navigate = useNavigate();
    const [vendors, setVendors] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingVendor, setEditingVendor] = useState(null);
    const [formData, setFormData] = useState({});

    useEffect(() => {
        loadVendors();
    }, []);

    const loadVendors = async () => {
        setIsLoading(true);
        try {
            const data = await Vendor.list("-name");
            setVendors(data);
        } catch (error) {
            console.error("Error loading vendors:", error);
        }
        setIsLoading(false);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        try {
            if (editingVendor) {
                await Vendor.update(editingVendor.id, formData);
            } else {
                await Vendor.create(formData);
            }
            loadVendors();
            setShowForm(false);
            setEditingVendor(null);
            setFormData({});
        } catch (error) {
            console.error("Error saving vendor:", error);
        }
    };

    const handleDelete = async (id) => {
        if (confirm("Are you sure you want to delete this vendor?")) {
            try {
                await Vendor.delete(id);
                loadVendors();
            } catch (error) {
                console.error("Error deleting vendor:", error);
            }
        }
    };

    const openEdit = (vendor) => {
        setEditingVendor(vendor);
        setFormData(vendor);
        setShowForm(true);
    };

    const openCreate = () => {
        setEditingVendor(null);
        setFormData({
            name: "",
            default_category: "",
            email: "",
            phone: "",
            address: "",
            tax_number: "",
            notes: ""
        });
        setShowForm(true);
    };

    const filteredVendors = vendors.filter(v => 
        v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (v.email && v.email.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const categories = [
        "office", "travel", "utilities", "supplies", "salary", 
        "marketing", "software", "consulting", "legal", 
        "maintenance", "vehicle", "meals", "other"
    ];

    return (
        <div className="min-h-screen bg-background p-4 sm:p-6">
            <div className="max-w-7xl mx-auto">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
                    <div className="flex items-center gap-4">
                        <Button 
                            variant="outline" 
                            size="icon"
                            onClick={() => navigate(createPageUrl("CashFlow"))}
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </Button>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-semibold text-foreground font-display">Vendors</h1>
                            <p className="text-gray-600">Manage your suppliers and service providers</p>
                        </div>
                    </div>
                    <Button onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-700">
                        <Plus className="w-4 h-4 mr-2" />
                        Add Vendor
                    </Button>
                </div>

                <Card>
                    <CardHeader>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <Input
                                placeholder="Search vendors..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="text-center py-8">Loading...</div>
                        ) : filteredVendors.length === 0 ? (
                            <Card className="border-dashed border-border">
                                <CardContent className="py-12 text-center">
                                    <div className="w-14 h-14 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
                                        <Building2 className="w-7 h-7 text-muted-foreground" />
                                    </div>
                                    <h3 className="text-base font-semibold text-foreground mb-2 font-display">
                                        {searchTerm ? "No vendors found" : "No vendors yet"}
                                    </h3>
                                    <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
                                        {searchTerm ? "Try a different search." : "Track suppliers and expenses. Add a vendor to get started."}
                                    </p>
                                    {!searchTerm && (
                                        <Button onClick={openCreate} className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground">
                                            <Plus className="w-4 h-4 mr-2" />
                                            Add vendor
                                        </Button>
                                    )}
                                </CardContent>
                            </Card>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {filteredVendors.map(vendor => (
                                    <div key={vendor.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow bg-white">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
                                                    {vendor.name.charAt(0).toUpperCase()}
                                                </div>
                                                <h3 className="font-semibold">{vendor.name}</h3>
                                            </div>
                                            <div className="flex gap-1">
                                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(vendor)}>
                                                    <Pencil className="w-4 h-4 text-gray-500" />
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(vendor.id)}>
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </div>
                                        
                                        <div className="space-y-2 text-sm text-gray-600 mt-3">
                                            {vendor.default_category && (
                                                <div className="inline-block px-2 py-1 bg-gray-100 rounded text-xs font-medium text-gray-700 mb-2">
                                                    {vendor.default_category}
                                                </div>
                                            )}
                                            {vendor.email && (
                                                <div className="flex items-center gap-2">
                                                    <Mail className="w-3 h-3" />
                                                    {vendor.email}
                                                </div>
                                            )}
                                            {vendor.phone && (
                                                <div className="flex items-center gap-2">
                                                    <Phone className="w-3 h-3" />
                                                    {vendor.phone}
                                                </div>
                                            )}
                                            {vendor.tax_number && (
                                                <div className="text-xs text-gray-500 mt-2">
                                                    Tax ID: {vendor.tax_number}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Dialog open={showForm} onOpenChange={setShowForm}>
                    <DialogContent className="sm:max-w-[500px]">
                        <DialogHeader>
                            <DialogTitle>{editingVendor ? "Edit Vendor" : "Add Vendor"}</DialogTitle>
                            <DialogDescription>
                                Enter the vendor details below.
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleSave} className="space-y-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="name">Vendor Name *</Label>
                                <Input
                                    id="name"
                                    value={formData.name || ""}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="category">Default Category</Label>
                                    <Select 
                                        value={formData.default_category || "other"} 
                                        onValueChange={(val) => setFormData({ ...formData, default_category: val })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {categories.map(c => (
                                                <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="tax_number">Tax ID / VAT</Label>
                                    <Input
                                        id="tax_number"
                                        value={formData.tax_number || ""}
                                        onChange={(e) => setFormData({ ...formData, tax_number: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="email">Email</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        value={formData.email || ""}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="phone">Phone</Label>
                                    <Input
                                        id="phone"
                                        value={formData.phone || ""}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="address">Address</Label>
                                <Input
                                    id="address"
                                    value={formData.address || ""}
                                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="notes">Notes</Label>
                                <Textarea
                                    id="notes"
                                    value={formData.notes || ""}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                />
                            </div>
                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                                <Button type="submit">Save Vendor</Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
}