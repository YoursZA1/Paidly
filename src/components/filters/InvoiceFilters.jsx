import React, { useState, useEffect, useRef } from "react";
import { usePersistedListFilters } from "@/hooks/usePersistedListFilters";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Search, Filter, X, CalendarIcon, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const DEFAULT_FILTERS = {
    search: '',
    status: 'all',
    amountRange: 'all',
    clientId: 'all',
    dateFrom: null,
    dateTo: null,
    sortBy: 'date_newest'
};

const statusOptions = [
    { value: 'all', label: 'All Statuses' },
    { value: 'draft', label: 'Draft' },
    { value: 'sent', label: 'Sent' },
    { value: 'viewed', label: 'Viewed' },
    { value: 'partial_paid', label: 'Partial Paid' },
    { value: 'paid', label: 'Paid' },
    { value: 'overdue', label: 'Overdue' },
    { value: 'cancelled', label: 'Cancelled' }
];

const amountRanges = [
    { value: 'all', label: 'Any Amount' },
    { value: '0-1000', label: 'Under 1,000' },
    { value: '1000-5000', label: '1,000 - 5,000' },
    { value: '5000-10000', label: '5,000 - 10,000' },
    { value: '10000-50000', label: '10,000 - 50,000' },
    { value: '50000+', label: 'Over 50,000' }
];

export default function InvoiceFilters({ onFilterChange, clients = [] }) {
    const [showFilters, setShowFilters] = useState(false);
    const { filters, updateFilter, clearFilters } = usePersistedListFilters(
        "invoices",
        DEFAULT_FILTERS
    );

    const onFilterChangeRef = useRef(onFilterChange);
    onFilterChangeRef.current = onFilterChange;

    useEffect(() => {
        onFilterChangeRef.current(filters);
    }, [filters]);

    const activeFilterCount = [
        filters.status !== 'all',
        filters.amountRange !== 'all',
        filters.clientId !== 'all',
        filters.dateFrom,
        filters.dateTo
    ].filter(Boolean).length;

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
                {/* Search */}
                <div className="relative flex-1 w-full min-w-0">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <Input
                        value={filters.search}
                        onChange={(e) => updateFilter('search', e.target.value)}
                        placeholder="Search by invoice number, client name, or project..."
                        className="pl-10 h-10 rounded-xl w-full"
                    />
                </div>

                <div className="flex flex-col sm:flex-row gap-3 flex-1 sm:flex-initial min-w-0">
                    {/* Sort By — full width on mobile for easy tap */}
                    <Select value={filters.sortBy} onValueChange={(v) => updateFilter('sortBy', v)}>
                        <SelectTrigger className="w-full sm:w-[180px] h-10 rounded-xl">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="date_newest">Newest First</SelectItem>
                            <SelectItem value="date_oldest">Oldest First</SelectItem>
                            <SelectItem value="amount_highest">Highest Amount</SelectItem>
                            <SelectItem value="amount_lowest">Lowest Amount</SelectItem>
                        </SelectContent>
                    </Select>

                    {/* Filter Toggle + Clear — full width on mobile */}
                    <div className="flex gap-2 flex-wrap">
                        <Button
                            variant="outline"
                            onClick={() => setShowFilters(!showFilters)}
                            className="gap-2 h-10 flex-1 sm:flex-initial min-w-0 rounded-xl"
                        >
                            <Filter className="w-4 h-4 shrink-0" />
                            Filters
                            {activeFilterCount > 0 && (
                                <Badge className="bg-primary text-white ml-1 shrink-0">{activeFilterCount}</Badge>
                            )}
                            <ChevronDown className={cn("w-4 h-4 shrink-0 transition-transform", showFilters && "rotate-180")} />
                        </Button>
                        {activeFilterCount > 0 && (
                            <Button variant="ghost" onClick={clearFilters} className="gap-2 h-10 text-slate-600 shrink-0 rounded-xl">
                                <X className="w-4 h-4" />
                                Clear
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {/* Filter Options */}
            {showFilters && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 bg-muted/30 rounded-xl border border-border">
                    {/* Status Filter */}
                    <div className="space-y-1">
                        <Label htmlFor="invoice-filter-status" className="text-xs font-medium text-slate-600">Status</Label>
                        <Select value={filters.status} onValueChange={(v) => updateFilter('status', v)}>
                            <SelectTrigger id="invoice-filter-status" className="h-9">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {statusOptions.map(opt => (
                                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Amount Range Filter */}
                    <div className="space-y-1">
                        <Label htmlFor="invoice-filter-amount" className="text-xs font-medium text-slate-600">Amount Range</Label>
                        <Select value={filters.amountRange} onValueChange={(v) => updateFilter('amountRange', v)}>
                            <SelectTrigger id="invoice-filter-amount" className="h-9">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {amountRanges.map(opt => (
                                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Client Filter */}
                    <div className="space-y-1">
                        <Label htmlFor="invoice-filter-client" className="text-xs font-medium text-slate-600">Client</Label>
                        <Select value={filters.clientId} onValueChange={(v) => updateFilter('clientId', v)}>
                            <SelectTrigger id="invoice-filter-client" className="h-9">
                                <SelectValue placeholder="All Clients" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Clients</SelectItem>
                                {clients.map(client => (
                                    <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Date Range */}
                    <fieldset className="space-y-1 border-0 p-0 m-0 min-w-0">
                        <legend className="text-xs font-medium text-slate-600">Date Range</legend>
                        <div className="flex gap-2">
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button type="button" variant="outline" size="sm" className="h-9 flex-1 justify-start text-left font-normal" aria-label="Filter from date">
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {filters.dateFrom ? format(new Date(filters.dateFrom), 'MMM d') : 'From'}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar
                                        mode="single"
                                        selected={filters.dateFrom ? new Date(filters.dateFrom) : undefined}
                                        onSelect={(date) => updateFilter('dateFrom', date?.toISOString())}
                                    />
                                </PopoverContent>
                            </Popover>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button type="button" variant="outline" size="sm" className="h-9 flex-1 justify-start text-left font-normal" aria-label="Filter to date">
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {filters.dateTo ? format(new Date(filters.dateTo), 'MMM d') : 'To'}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar
                                        mode="single"
                                        selected={filters.dateTo ? new Date(filters.dateTo) : undefined}
                                        onSelect={(date) => updateFilter('dateTo', date?.toISOString())}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                    </fieldset>
                </div>
            )}
        </div>
    );
}

export function applyInvoiceFilters(invoices, filters, clientMap = new Map()) {
    let filtered = invoices.filter(invoice => {
        // Search filter
        if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            const clientName = String(clientMap.get(invoice.client_id)?.name || "N/A");
            const matchesSearch = 
                invoice.project_title?.toLowerCase().includes(searchLower) ||
                invoice.invoice_number?.toLowerCase().includes(searchLower) ||
                clientName.toLowerCase().includes(searchLower);
            if (!matchesSearch) return false;
        }

        // Status filter
        if (filters.status !== 'all' && invoice.status !== filters.status) {
            return false;
        }

        // Client filter
        if (filters.clientId !== 'all' && invoice.client_id !== filters.clientId) {
            return false;
        }

        // Amount range filter
        if (filters.amountRange !== 'all') {
            const amount = invoice.total_amount || 0;
            const [min, max] = filters.amountRange.split('-').map(v => v === '+' ? Infinity : parseInt(v));
            if (filters.amountRange.includes('+')) {
                if (amount < parseInt(filters.amountRange)) return false;
            } else {
                if (amount < min || amount > max) return false;
            }
        }

        // Date range filter
        if (filters.dateFrom) {
            const invoiceDate = new Date(invoice.created_date);
            if (invoiceDate < new Date(filters.dateFrom)) return false;
        }
        if (filters.dateTo) {
            const invoiceDate = new Date(invoice.created_date);
            if (invoiceDate > new Date(filters.dateTo)) return false;
        }

        return true;
    });

    // Apply sorting
    const sortBy = filters.sortBy || 'date_newest';
    
    filtered.sort((a, b) => {
        switch (sortBy) {
            case 'date_newest':
                return new Date(b.created_date) - new Date(a.created_date);
            case 'date_oldest':
                return new Date(a.created_date) - new Date(b.created_date);
            case 'amount_highest':
                return (b.total_amount || 0) - (a.total_amount || 0);
            case 'amount_lowest':
                return (a.total_amount || 0) - (b.total_amount || 0);
            default:
                return new Date(b.created_date) - new Date(a.created_date);
        }
    });

    return filtered;
}