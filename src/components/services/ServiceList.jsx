import React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Edit, Archive, CheckCircle, Clock, Lock } from "lucide-react";
import { formatCurrency } from "../CurrencySelector";
import { ITEM_TYPES } from "@/components/invoice/itemTypeHelpers";
import { renderIcon } from "@/utils/renderIcon";

const serviceTypeLabels = {
    hourly: "Per Hour",
    fixed: "Fixed Price",
    per_item: "Per Item",
    daily: "Per Day",
    weekly: "Per Week",
    monthly: "Per Month"
};

export default function ServiceList({ 
    services, 
    onEdit, 
    selectedServices, 
    onSelectService, 
    userCurrency = 'USD' 
}) {
    return (
        <div className="bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700 shadow-sm overflow-hidden">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-12 pl-4">Select</TableHead>
                        <TableHead>Item Name</TableHead>
                        <TableHead>Item Type</TableHead>
                        <TableHead>Default Unit</TableHead>
                        <TableHead>Default Rate</TableHead>
                        <TableHead>Lock Status</TableHead>
                        <TableHead>Usage</TableHead>
                        <TableHead>Additional Info</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {services.map((service) => (
                        <TableRow key={service.id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 ${!service.is_active ? 'opacity-60 bg-slate-50 dark:bg-slate-800/80' : ''}`}>
                            <TableCell className="pl-4">
                                <Checkbox
                                    checked={selectedServices.includes(service.id)}
                                    onCheckedChange={(checked) => onSelectService(service.id, checked)}
                                />
                            </TableCell>
                            <TableCell className="font-medium">
                                <div className="flex flex-col">
                                    <span className="text-slate-900 dark:text-slate-100 font-semibold">{service.name}</span>
                                    {service.description && (
                                        <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[250px]">
                                            {service.description}
                                        </span>
                                    )}
                                </div>
                            </TableCell>
                            <TableCell>
                                {(() => {
                                    const itemType = ITEM_TYPES.find(t => t.value === (service.item_type || 'service'));
                                    return itemType ? (
                                        <Badge className="text-xs bg-primary/15 dark:bg-primary/25 text-primary border-primary/30">
                                            {renderIcon(itemType.icon, {style: {width: 16, height: 16}, className: "inline-block align-middle mr-1"})} {itemType.label}
                                        </Badge>
                                    ) : (
                                        <Badge variant="outline" className="text-xs">Service</Badge>
                                    );
                                })()}
                            </TableCell>
                            <TableCell>
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                    {service.default_unit || service.unit_of_measure || 'unit'}
                                </span>
                            </TableCell>
                            <TableCell>
                                <div className="font-medium text-slate-900 dark:text-slate-100">
                                    {formatCurrency(service.default_rate || service.unit_price, userCurrency)}
                                </div>
                            </TableCell>
                            <TableCell>
                                {service.price_locked ? (
                                    <Badge className="text-xs bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-700">
                                        <Lock className="w-3 h-3 mr-1" />
                                        Locked
                                    </Badge>
                                ) : (
                                    <Badge variant="outline" className="text-xs bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-400">
                                        Unlocked
                                    </Badge>
                                )}
                            </TableCell>
                            <TableCell>
                                {service.usage_count && service.usage_count > 0 ? (
                                    <Badge className="text-xs bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-700">
                                        <span className="mr-1">📊</span>{service.usage_count}x
                                    </Badge>
                                ) : (
                                    <span className="text-xs text-slate-500 dark:text-slate-400">Not used</span>
                                )}
                            </TableCell>
                            <TableCell>
                                <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                                    {service.item_type === 'product' && service.sku && (
                                        <div><span className="font-semibold">SKU:</span> {service.sku}</div>
                                    )}
                                    {service.item_type === 'service' && service.billing_unit && (
                                        <div><span className="font-semibold">Bill:</span> {service.billing_unit}</div>
                                    )}
                                    {service.item_type === 'labor' && service.role && (
                                        <div><span className="font-semibold">Role:</span> {service.role}</div>
                                    )}
                                    {service.item_type === 'material' && service.unit_type && (
                                        <div><span className="font-semibold">Unit:</span> {service.unit_type}</div>
                                    )}
                                    {service.item_type === 'expense' && service.cost_type && (
                                        <div><span className="font-semibold">Type:</span> {service.cost_type}</div>
                                    )}
                                    {service.tax_category && (
                                        <div className="pt-1 border-t border-slate-200 dark:border-slate-600"><span className="font-semibold">Tax:</span> {service.tax_category}</div>
                                    )}
                                </div>
                            </TableCell>
                            <TableCell>
                                {service.is_active ? (
                                    <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300">
                                        Active
                                    </Badge>
                                ) : (
                                    <Badge variant="outline" className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                                        Inactive
                                    </Badge>
                                )}
                            </TableCell>
                            <TableCell className="text-right">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => onEdit(service)}
                                    className="h-8 w-8 text-slate-400 dark:text-slate-500 hover:text-primary"
                                >
                                    <Edit className="w-4 h-4" />
                                </Button>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}