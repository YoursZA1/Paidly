import PropTypes from "prop-types";

import { useState, useEffect } from "react";
import { ChevronsUpDown, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useAuth } from "@/components/auth/AuthContext";
import { mapCatalogToLineItem } from "@/services/CatalogSyncService";
import { Service } from "@/api/entities";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import ServiceForm from "@/components/services/ServiceForm";

/** Get rate from catalog item (same order as Quote / services table: default_rate, rate, price) */
function getCatalogRate(catalogItem) {
  if (!catalogItem) return 0;
  return Number(
    catalogItem.default_rate ?? catalogItem.rate ?? catalogItem.price ?? catalogItem.default_price ?? 0
  ) || 0;
}

export default function InvoiceDetails({
  invoiceData,
  setInvoiceData,
  clients,
  products,
  services,
  setServices,
  onNext,
  showNextButton = true
}) {
  const { user } = useAuth();
  const [itemHistory, setItemHistory] = useState([]);
  const [expandedItems, setExpandedItems] = useState([]);
  const [isAddingService, setIsAddingService] = useState(false);
  const [currentServiceItemIndex, setCurrentServiceItemIndex] = useState(null);

  // Auto-calculate subtotal, tax, and total from line items (same as Quote)
  useEffect(() => {
    const subtotal = (invoiceData.items || []).reduce(
      (sum, item) => sum + (Number(item.total) || Number(item.total_price) || 0),
      0
    );
    const taxRate = Number(invoiceData.tax_rate) || 0;
    const taxAmount = subtotal * (taxRate / 100);
    const totalAmount = subtotal + taxAmount;
    if (
      subtotal !== invoiceData.subtotal ||
      taxAmount !== invoiceData.tax_amount ||
      totalAmount !== invoiceData.total_amount
    ) {
      setInvoiceData(prev => ({
        ...prev,
        subtotal,
        tax_amount: taxAmount,
        total_amount: totalAmount
      }));
    }
  }, [invoiceData.items, invoiceData.tax_rate, invoiceData.subtotal, invoiceData.tax_amount, invoiceData.total_amount, setInvoiceData]);

  const handleServiceSelect = (index, catalogItem) => {
    const items = [...(invoiceData.items || [])];
    const currentItem = items[index];
    const qty = Number(currentItem?.quantity) || 1;
    const mapped = mapCatalogToLineItem(catalogItem, qty, {
      existingTaxRate: 0,
      userId: user?.id || null
    });
    const rate = mapped?.success
      ? Number(mapped.lineItem.unit_price) || 0
      : getCatalogRate(catalogItem);
    const total = mapped?.success
      ? Number(mapped.lineItem.total_price) || 0
      : qty * rate;
    items[index] = {
      ...currentItem,
      name: catalogItem.name,
      service_name: catalogItem.name,
      description: catalogItem.description || currentItem.description || "",
      quantity: mapped?.success ? (mapped.lineItem.quantity ?? qty) : qty,
      rate,
      total,
      unit_price: rate,
      total_price: total
    };
    setInvoiceData(prev => ({ ...prev, items }));
    if (catalogItem.description && !expandedItems.includes(index)) {
      setExpandedItems(prev => [...prev, index]);
    }
  };

  const handleSaveNewService = async (serviceData) => {
    try {
      const newService = await Service.create(serviceData);
      const updatedServices = await Service.list("-created_date");
      if (setServices) setServices(updatedServices || []);
      if (currentServiceItemIndex !== null) {
        handleServiceSelect(currentServiceItemIndex, newService);
      }
      setIsAddingService(false);
      setCurrentServiceItemIndex(null);
    } catch (err) {
      console.error("Error creating new service/product:", err);
      alert("Failed to create item. Please try again.");
    }
  };

  return (
    <>
    <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
      <CardHeader className="border-b border-slate-100 pb-6">
        <CardTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
          Invoice Details
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1">Enter invoice details.</p>
      </CardHeader>
      <CardContent className="p-4 sm:p-8">
        <div className="space-y-6">
          {/* Client and Project Info */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700">Select Client *</Label>
              <Select value={invoiceData.client_id} onValueChange={v => setInvoiceData(prev => ({...prev, client_id: v}))}>
                <SelectTrigger className="h-12 rounded-xl border-slate-200">
                  <SelectValue placeholder="Choose a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map(client => (
                    <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700">Project Title *</Label>
              <Input
                value={invoiceData.project_title}
                onChange={e => setInvoiceData(prev => ({...prev, project_title: e.target.value}))}
                placeholder="Enter project title"
                className="h-12 rounded-xl border-slate-200"
              />
            </div>
          </div>

          {/* Items Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <Label className="text-lg font-semibold text-slate-900">Product Details</Label>
                <p className="text-sm text-muted-foreground">Enter product details.</p>
              </div>
              <div className="flex gap-2">
                <Button type="button" className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-lg"
                  onClick={() => {
                    setItemHistory(h => [...h, invoiceData.items]);
                    setInvoiceData(prev => ({
                      ...prev,
                      items: [...(prev.items || []), { name: '', service_name: '', quantity: 1, rate: 0, unit_price: 0, total: 0, total_price: 0, description: '' }]
                    }));
                  }}
                >
                  Add Item
                </Button>
                <Button type="button" variant="outline" className="border px-4 py-2 rounded-lg"
                  onClick={() => {
                    if (itemHistory.length > 0) {
                      setInvoiceData(prev => ({...prev, items: itemHistory[itemHistory.length - 1]}));
                      setItemHistory(h => h.slice(0, -1));
                    }
                  }}
                  disabled={itemHistory.length === 0}
                >Undo</Button>
              </div>
            </div>
            {/* Quick Add removed as requested */}
            {/* Items list */}
            {(invoiceData.items && invoiceData.items.length > 0) ? (
              <>
                {invoiceData.items.map((item, idx) => {
                  // Find all products/services
                  const allCatalog = [...products, ...services];
                  return (
                    <div key={idx} className="bg-slate-50 p-4 sm:p-6 rounded-xl space-y-4">
                      <div className="flex justify-between items-center">
                        <h4 className="font-semibold text-slate-900">Item #{idx + 1}</h4>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setInvoiceData(prev => ({
                            ...prev,
                            items: prev.items.filter((_, i) => i !== idx)
                          }))}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2 md:col-span-2">
                          <Label className="text-sm font-semibold text-slate-700">Product/Service *</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                role="combobox"
                                className="w-full justify-between h-10 rounded-lg font-normal"
                              >
                                {item.name
                                  ? allCatalog.find((s) => s.name.toLowerCase() === item.name.toLowerCase())?.name
                                  : "Select a product or service..."}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                              <Command>
                                <CommandInput placeholder="Search..." />
                                <CommandEmpty>No match found.</CommandEmpty>
                                <CommandList>
                                  <CommandGroup>
                                    {allCatalog.map((catalogItem) => (
                                      <CommandItem
                                        key={catalogItem.id}
                                        value={catalogItem.name}
                                        onSelect={() => {
                                          const qty = Number(invoiceData.items?.[idx]?.quantity) || 1;
                                          const mapped = mapCatalogToLineItem(catalogItem, qty, {
                                            existingTaxRate: 0,
                                            userId: user?.id || null
                                          });
                                          const rate = mapped?.success
                                            ? Number(mapped.lineItem.unit_price) || 0
                                            : getCatalogRate(catalogItem);
                                          const total = mapped?.success
                                            ? Number(mapped.lineItem.total_price) || 0
                                            : qty * rate;
                                          setInvoiceData(prev => {
                                            const items = [...prev.items];
                                            const prevItem = items[idx];
                                            items[idx] = {
                                              ...prevItem,
                                              name: catalogItem.name,
                                              service_name: catalogItem.name,
                                              description: catalogItem.description || prevItem.description || "",
                                              quantity: mapped?.success ? (mapped.lineItem.quantity ?? qty) : qty,
                                              rate,
                                              total,
                                              unit_price: rate,
                                              total_price: total
                                            };
                                            return { ...prev, items };
                                          });
                                          if (catalogItem.description && !expandedItems.includes(idx)) {
                                            setExpandedItems((prev) => [...prev, idx]);
                                          }
                                        }}
                                      >
                                        {catalogItem.name}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                  {setServices && (
                                    <CommandGroup>
                                      <CommandItem
                                        onSelect={() => {
                                          setCurrentServiceItemIndex(idx);
                                          setIsAddingService(true);
                                        }}
                                        className="cursor-pointer"
                                      >
                                        <Plus className="mr-2 h-4 w-4" />
                                        <span>Add new product/service</span>
                                      </CommandItem>
                                    </CommandGroup>
                                  )}
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </div>

                        {/* Show Details Toggle */}
                        {!expandedItems.includes(idx) && (
                          <div className="md:col-span-2">
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => setExpandedItems([...expandedItems, idx])}
                              className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                            >
                              + Add Description
                            </Button>
                          </div>
                        )}

                        {/* Description - Optional */}
                        {expandedItems.includes(idx) && (
                          <div className="space-y-2 md:col-span-2">
                            <Label className="text-sm font-semibold text-slate-700">Description (Optional)</Label>
                            <Input
                              value={item.description || ''}
                              onChange={e => {
                                const value = e.target.value;
                                setInvoiceData(prev => {
                                  const items = [...prev.items];
                                  items[idx].description = value;
                                  return { ...prev, items };
                                });
                              }}
                              placeholder="Brief description of product/service"
                              className="h-10 rounded-lg"
                            />
                          </div>
                        )}

                        <div className="space-y-2">
                          <Label className="text-sm font-semibold text-slate-700">Quantity *</Label>
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={e => {
                              const value = Number(e.target.value);
                              setInvoiceData(prev => {
                                const items = [...prev.items];
                                const r = items[idx].rate ?? items[idx].unit_price ?? 0;
                                const t = value * r;
                                items[idx] = { ...items[idx], quantity: value, total: t, total_price: t, unit_price: r };
                                return { ...prev, items };
                              });
                            }}
                            className="h-10 rounded-lg"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm font-semibold text-slate-700">Rate *</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.rate ?? item.unit_price ?? 0}
                            onChange={e => {
                              const value = Number(e.target.value);
                              setInvoiceData(prev => {
                                const items = [...prev.items];
                                const q = items[idx].quantity ?? 1;
                                const t = value * q;
                                items[idx] = { ...items[idx], rate: value, unit_price: value, total: t, total_price: t };
                                return { ...prev, items };
                              });
                            }}
                            className="h-10 rounded-lg"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <div className="text-right">
                          <p className="text-sm text-slate-600">Total</p>
                          <p className="text-xl font-bold text-slate-900">${item.total || 0}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            ) : (
              <div className="text-center py-8 bg-slate-50 rounded-xl">
                <p className="text-slate-600">No items added yet. Add an item to get started.</p>
              </div>
            )}
          </div>

          {/* Tax and Totals */}
          <div className="bg-indigo-50 p-4 sm:p-6 rounded-xl space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700">Tax Rate (%)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={invoiceData.tax_rate || 0}
                  onChange={e => setInvoiceData(prev => ({...prev, tax_rate: e.target.value}))}
                  placeholder="0"
                  className="h-10 rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700">Due Date *</Label>
                <Input
                  type="date"
                  value={invoiceData.delivery_date}
                  onChange={e => setInvoiceData(prev => ({...prev, delivery_date: e.target.value}))}
                  className="h-10 rounded-lg"
                />
              </div>
            </div>
            <div className="border-t border-slate-200 pt-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-600">Subtotal:</span>
                  <span className="font-semibold">${invoiceData.subtotal || 0}</span>
                </div>
                {(invoiceData.tax_rate || 0) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Tax ({invoiceData.tax_rate}%):</span>
                    <span className="font-semibold">${invoiceData.tax_amount || 0}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold border-t border-slate-200 pt-2">
                  <span>Total:</span>
                  <span>${invoiceData.total_amount || 0}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Additional Fields */}
          <div className="grid md:grid-cols-1 gap-6">
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700">Project Description</Label>
              <Textarea
                value={invoiceData.project_description}
                onChange={e => setInvoiceData(prev => ({...prev, project_description: e.target.value}))}
                placeholder="Describe the project in detail..."
                className="min-h-24 rounded-xl border-slate-200"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700">Additional Notes</Label>
              <Textarea
                value={invoiceData.notes}
                onChange={e => setInvoiceData(prev => ({...prev, notes: e.target.value}))}
                placeholder="Any additional notes..."
                className="min-h-24 rounded-xl border-slate-200"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700">Terms & Conditions</Label>
              <Textarea
                value={invoiceData.terms_conditions}
                onChange={e => setInvoiceData(prev => ({...prev, terms_conditions: e.target.value}))}
                placeholder="Enter terms and conditions..."
                className="min-h-24 rounded-xl border-slate-200"
              />
            </div>
          </div>

          {showNextButton && (
            <div className="flex justify-end">
              <Button
                onClick={onNext}
                disabled={
                  !invoiceData.client_id ||
                  !invoiceData.project_title ||
                  !(invoiceData.items && invoiceData.items.length > 0) ||
                  !invoiceData.items.every(item => item.name && item.quantity > 0 && item.rate >= 0)
                }
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue to Preview
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>

    <Dialog open={isAddingService} onOpenChange={setIsAddingService}>
      <DialogContent className="max-w-2xl max-h-[calc(100vh-2rem)] sm:max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0 rounded-xl">
        <div className="flex-1 min-h-0 overflow-y-auto p-6 pt-12 pb-6">
          <ServiceForm
            onSave={handleSaveNewService}
            onCancel={() => {
              setIsAddingService(false);
              setCurrentServiceItemIndex(null);
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

InvoiceDetails.propTypes = {
  invoiceData: PropTypes.object.isRequired,
  setInvoiceData: PropTypes.func.isRequired,
  clients: PropTypes.array.isRequired,
  products: PropTypes.array.isRequired,
  services: PropTypes.array.isRequired,
  setServices: PropTypes.func,
  onNext: PropTypes.func,
  showNextButton: PropTypes.bool
};
