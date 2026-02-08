import React, { useState, useEffect } from "react";
import { Quote, Client, User } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, FileText, LayoutGrid, List, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { motion } from "framer-motion";
import QuoteList from "../components/quote/QuoteList";
import QuoteGrid from "../components/quote/QuoteGrid";

export default function QuotesPage() {
    const [quotes, setQuotes] = useState([]);
    const [clients, setClients] = useState([]);
    const [user, setUser] = useState(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [sortBy, setSortBy] = useState('date_newest');
    const [isLoading, setIsLoading] = useState(true);
    const [viewMode, setViewMode] = useState('list');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [quotesData, clientsData, userData] = await Promise.all([
                Quote.list("-created_date"),
                Client.list(),
                User.me()
            ]);
            setQuotes(quotesData);
            setClients(clientsData);
            setUser(userData);
        } catch (error) {
            console.error("Error loading data:", error);
        }
        setIsLoading(false);
    };

    const getClientName = (clientId) => {
        const client = clients.find(c => c.id === clientId);
        return client ? client.name : "N/A";
    };

    const userCurrency = user?.currency || 'ZAR';

    const filteredQuotes = quotes.filter(quote =>
        quote.project_title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        quote.quote_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        getClientName(quote.client_id).toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Apply sorting
    const sortedQuotes = [...filteredQuotes].sort((a, b) => {
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

    // Pagination logic
    const totalPages = Math.ceil(sortedQuotes.length / itemsPerPage);
    const paginatedQuotes = sortedQuotes.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    // Reset to page 1 when search/sort changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, sortBy]);

    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
            <div className="max-w-7xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4"
                >
                    <div>
                        <h1 className="text-2xl font-semibold text-gray-900 mb-2">
                            All Quotes
                        </h1>
                        <p className="text-gray-600">
                            Create, manage, and track your project quotations.
                        </p>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                        <div className="flex bg-white p-1 rounded-lg border shadow-sm h-10">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setViewMode('grid')}
                                className={`h-8 w-8 rounded-md ${viewMode === 'grid' ? 'bg-slate-100 text-blue-600' : 'text-slate-400'}`}
                            >
                                <LayoutGrid className="w-4 h-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setViewMode('list')}
                                className={`h-8 w-8 rounded-md ${viewMode === 'list' ? 'bg-slate-100 text-blue-600' : 'text-slate-400'}`}
                            >
                                <List className="w-4 h-4" />
                            </Button>
                        </div>
                        <Link to={createPageUrl("QuoteTemplates")} className="flex-1 sm:flex-none">
                            <Button variant="outline" className="w-full sm:w-auto">
                                <FileText className="w-4 h-4 mr-2" />
                                Templates
                            </Button>
                        </Link>
                        <Link to={createPageUrl("CreateQuote")} className="flex-1 sm:flex-none">
                            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 w-full sm:w-auto">
                                <Plus className="w-4 h-4 mr-2" />
                                Create New Quote
                            </Button>
                        </Link>
                    </div>
                </motion.div>

                <Card className="bg-white border border-gray-200">
                    <CardHeader>
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <CardTitle>Quote List</CardTitle>
                            <div className="flex gap-3 w-full sm:w-auto">
                                <div className="relative flex-1 sm:max-w-xs">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <Input
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        placeholder="Search by quote number, client, or project..."
                                        className="pl-10 h-10 rounded-xl w-full"
                                    />
                                </div>
                                <Select value={sortBy} onValueChange={setSortBy}>
                                    <SelectTrigger className="w-[180px] h-10">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="date_newest">Newest First</SelectItem>
                                        <SelectItem value="date_oldest">Oldest First</SelectItem>
                                        <SelectItem value="amount_highest">Highest Amount</SelectItem>
                                        <SelectItem value="amount_lowest">Lowest Amount</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-6">
                        {isLoading ? (
                            viewMode === 'list' ? (
                                <QuoteList isLoading={true} />
                            ) : (
                                <QuoteGrid isLoading={true} />
                            )
                        ) : sortedQuotes.length === 0 ? (
                            <div className="text-center py-12">
                                <FileText className="mx-auto h-12 w-12 text-gray-400" />
                                <h3 className="mt-2 text-sm font-medium text-gray-900">No quotes found</h3>
                                <p className="mt-1 text-sm text-gray-500">Create your first quote to see it here.</p>
                                <div className="mt-6">
                                    <Link to={createPageUrl("CreateQuote")}>
                                        <Button>
                                            <Plus className="-ml-1 mr-2 h-5 w-5" />
                                            New Quote
                                        </Button>
                                    </Link>
                                </div>
                            </div>
                        ) : (
                            <>
                                {viewMode === 'list' ? (
                                    <QuoteList 
                                        quotes={paginatedQuotes} 
                                        clients={clients} 
                                        userCurrency={userCurrency}
                                        onActionSuccess={loadData}
                                    />
                                ) : (
                                    <QuoteGrid 
                                        quotes={paginatedQuotes} 
                                        clients={clients} 
                                        userCurrency={userCurrency}
                                        onActionSuccess={loadData}
                                    />
                                )}
                                
                                {/* Pagination Controls */}
                                {totalPages > 1 && (
                                    <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-t pt-4">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm text-slate-600">Show</span>
                                            <Select value={itemsPerPage.toString()} onValueChange={(v) => { setItemsPerPage(Number(v)); setCurrentPage(1); }}>
                                                <SelectTrigger className="w-[70px] h-9">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="10">10</SelectItem>
                                                    <SelectItem value="25">25</SelectItem>
                                                    <SelectItem value="50">50</SelectItem>
                                                    <SelectItem value="100">100</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <span className="text-sm text-slate-600">
                                                of {sortedQuotes.length} quotes
                                            </span>
                                        </div>
                                        
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                                disabled={currentPage === 1}
                                            >
                                                <ChevronLeft className="w-4 h-4 mr-1" />
                                                Previous
                                            </Button>
                                            
                                            <div className="flex items-center gap-1">
                                                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                                    let pageNum;
                                                    if (totalPages <= 5) {
                                                        pageNum = i + 1;
                                                    } else if (currentPage <= 3) {
                                                        pageNum = i + 1;
                                                    } else if (currentPage >= totalPages - 2) {
                                                        pageNum = totalPages - 4 + i;
                                                    } else {
                                                        pageNum = currentPage - 2 + i;
                                                    }
                                                    return (
                                                        <Button
                                                            key={i}
                                                            variant={currentPage === pageNum ? "default" : "outline"}
                                                            size="sm"
                                                            onClick={() => setCurrentPage(pageNum)}
                                                            className="w-9 h-9"
                                                        >
                                                            {pageNum}
                                                        </Button>
                                                    );
                                                })}
                                            </div>
                                            
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                                disabled={currentPage === totalPages}
                                            >
                                                Next
                                                <ChevronRight className="w-4 h-4 ml-1" />
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}