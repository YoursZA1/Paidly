import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Search, Filter, X, CalendarIcon, ChevronDown } from "lucide-react";
import { format, subDays } from "date-fns";
import { cn } from "@/lib/utils";
import { industries } from "../clients/IndustryBadge";

const STORAGE_KEY = 'client_filters';

const segmentOptions = [
    { value: 'all', label: 'All Segments' },
    { value: 'vip', label: 'VIP' },
    { value: 'regular', label: 'Regular' },
    { value: 'new', label: 'New' },
    { value: 'at_risk', label: 'At Risk' }
];

const activityOptions = [
    { value: 'all', label: 'Any Activity' },
    { value: '7', label: 'Last 7 days' },
    { value: '30', label: 'Last 30 days' },
    { value: '90', label: 'Last 90 days' },
    { value: 'inactive', label: 'Inactive (90+ days)' }
];

const spendingRanges = [
    { value: 'all', label: 'Any Spending' },
    { value: '0-5000', label: 'Under 5,000' },
    { value: '5000-20000', label: '5,000 - 20,000' },
    { value: '20000-50000', label: '20,000 - 50,000' },
    { value: '50000+', label: 'Over 50,000' }
];

export default function ClientFilters({ onFilterChange }) {
    const [showFilters, setShowFilters] = useState(false);
    const [filters, setFilters] = useState(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved ? JSON.parse(saved) : {
            search: '',
            segment: 'all',
            industry: 'all',
            activity: 'all',
            spending: 'all',
            sortBy: 'name_asc'
        };
    });

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
        onFilterChange(filters);
    }, [filters]);

    const updateFilter = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const clearFilters = () => {
        const cleared = {
            search: '',
            segment: 'all',
            industry: 'all',
            activity: 'all',
            spending: 'all',
            sortBy: 'name_asc'
        };
        setFilters(cleared);
    };

    const activeFilterCount = [
        filters.segment !== 'all',
        filters.industry !== 'all',
        filters.activity !== 'all',
        filters.spending !== 'all'
    ].filter(Boolean).length;

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
                {/* Search */}
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                        value={filters.search}
                        onChange={(e) => updateFilter('search', e.target.value)}
                        placeholder="Search by client name, email, or contact person..."
                        className="pl-10 h-10 rounded-xl"
                    />
                </div>

                {/* Sort By */}
                <Select value={filters.sortBy} onValueChange={(v) => updateFilter('sortBy', v)}>
                    <SelectTrigger className="w-[180px] h-10">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="name_asc">Name (A-Z)</SelectItem>
                        <SelectItem value="name_desc">Name (Z-A)</SelectItem>
                        <SelectItem value="spending_highest">Highest Spending</SelectItem>
                        <SelectItem value="spending_lowest">Lowest Spending</SelectItem>
                        <SelectItem value="recent">Recently Added</SelectItem>
                    </SelectContent>
                </Select>

                {/* Filter Toggle Button */}
                <Button
                    variant="outline"
                    onClick={() => setShowFilters(!showFilters)}
                    className="gap-2 h-10"
                >
                    <Filter className="w-4 h-4" />
                    Filters
                    {activeFilterCount > 0 && (
                        <Badge className="bg-primary text-white ml-1">{activeFilterCount}</Badge>
                    )}
                    <ChevronDown className={cn("w-4 h-4 transition-transform", showFilters && "rotate-180")} />
                </Button>

                {activeFilterCount > 0 && (
                    <Button variant="ghost" onClick={clearFilters} className="gap-2 h-10 text-slate-600">
                        <X className="w-4 h-4" />
                        Clear
                    </Button>
                )}
            </div>

            {/* Filter Options */}
            {showFilters && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 bg-slate-50 rounded-xl border">
                    {/* Segment Filter */}
                    <div className="space-y-1">
                        <Label htmlFor="client-filter-segment" className="text-xs font-medium text-slate-600">Segment</Label>
                        <Select value={filters.segment} onValueChange={(v) => updateFilter('segment', v)}>
                            <SelectTrigger id="client-filter-segment" className="h-9">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {segmentOptions.map(opt => (
                                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Industry Filter */}
                    <div className="space-y-1">
                        <Label htmlFor="client-filter-industry" className="text-xs font-medium text-slate-600">Industry</Label>
                        <Select value={filters.industry} onValueChange={(v) => updateFilter('industry', v)}>
                            <SelectTrigger id="client-filter-industry" className="h-9">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Industries</SelectItem>
                                {industries.map(ind => (
                                    <SelectItem key={ind.value} value={ind.value}>{ind.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Last Activity Filter */}
                    <div className="space-y-1">
                        <Label htmlFor="client-filter-activity" className="text-xs font-medium text-slate-600">Last Activity</Label>
                        <Select value={filters.activity} onValueChange={(v) => updateFilter('activity', v)}>
                            <SelectTrigger id="client-filter-activity" className="h-9">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {activityOptions.map(opt => (
                                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Spending Range */}
                    <div className="space-y-1">
                        <Label htmlFor="client-filter-spending" className="text-xs font-medium text-slate-600">Total Spending</Label>
                        <Select value={filters.spending} onValueChange={(v) => updateFilter('spending', v)}>
                            <SelectTrigger id="client-filter-spending" className="h-9">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {spendingRanges.map(opt => (
                                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            )}
        </div>
    );
}

export function applyClientFilters(clients, filters) {
    let filtered = clients.filter(client => {
        // Search filter
        if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            const matchesSearch = 
                client.name?.toLowerCase().includes(searchLower) ||
                client.email?.toLowerCase().includes(searchLower) ||
                client.contact_person?.toLowerCase().includes(searchLower);
            if (!matchesSearch) return false;
        }

        // Segment filter
        if (filters.segment !== 'all') {
            const clientSegment = client.segment || 'new';
            if (clientSegment !== filters.segment) return false;
        }

        // Industry filter
        if (filters.industry !== 'all' && client.industry !== filters.industry) {
            return false;
        }

        // Activity filter
        if (filters.activity !== 'all') {
            const lastDate = client.last_invoice_date ? new Date(client.last_invoice_date) : null;
            const now = new Date();
            
            if (filters.activity === 'inactive') {
                if (lastDate && (now - lastDate) / (1000 * 60 * 60 * 24) < 90) return false;
            } else {
                const days = parseInt(filters.activity);
                if (!lastDate) return false;
                if ((now - lastDate) / (1000 * 60 * 60 * 24) > days) return false;
            }
        }

        // Spending range filter
        if (filters.spending !== 'all') {
            const spent = client.total_spent || 0;
            if (filters.spending.includes('+')) {
                const min = parseInt(filters.spending);
                if (spent < min) return false;
            } else {
                const [min, max] = filters.spending.split('-').map(v => parseInt(v));
                if (spent < min || spent > max) return false;
            }
        }

        return true;
    });

    // Apply sorting
    const sortBy = filters.sortBy || 'name_asc';
    
    filtered.sort((a, b) => {
        switch (sortBy) {
            case 'name_asc':
                return (a.name || '').localeCompare(b.name || '');
            case 'name_desc':
                return (b.name || '').localeCompare(a.name || '');
            case 'spending_highest':
                return (b.total_spent || 0) - (a.total_spent || 0);
            case 'spending_lowest':
                return (a.total_spent || 0) - (b.total_spent || 0);
            case 'recent':
                return new Date(b.created_date || 0) - new Date(a.created_date || 0);
            default:
                return (a.name || '').localeCompare(b.name || '');
        }
    });

    return filtered;
}