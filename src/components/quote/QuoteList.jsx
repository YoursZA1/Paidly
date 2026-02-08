import React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { formatCurrency } from "../CurrencySelector";
import QuoteActions from "./QuoteActions";
import QuoteStatusTracker from "./QuoteStatusTracker";

const statusStyles = {
    draft: "bg-slate-100 text-slate-700 border-slate-200",
    sent: "bg-blue-100 text-blue-700 border-blue-200",
    viewed: "bg-purple-100 text-purple-700 border-purple-200",
    accepted: "bg-emerald-100 text-emerald-700 border-emerald-200",
    rejected: "bg-rose-100 text-rose-700 border-rose-200",
    expired: "bg-orange-100 text-orange-700 border-orange-200"
};

export default function QuoteList({ quotes, clients, isLoading, userCurrency, onActionSuccess }) {
    const getClientName = (clientId) => {
        const client = clients.find(c => c.id === clientId);
        return client ? client.name : "N/A";
    };

    return (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <Table className="min-w-[800px]">
                    <TableHeader>
                        <TableRow>
                            <TableHead>Quote #</TableHead>
                            <TableHead>Client</TableHead>
                            <TableHead>Project Title</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Valid Until</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            Array(5).fill(0).map((_, i) => (
                                <TableRow key={i}><td colSpan="7"><Skeleton className="h-12 w-full" /></td></TableRow>
                            ))
                        ) : (
                            quotes.map(quote => (
                                <TableRow key={quote.id} className="hover:bg-slate-50">
                                    <TableCell className="font-medium">{quote.quote_number}</TableCell>
                                    <TableCell>{getClientName(quote.client_id)}</TableCell>
                                    <TableCell>{quote.project_title}</TableCell>
                                    <TableCell>{formatCurrency(quote.total_amount, userCurrency)}</TableCell>
                                    <TableCell>{quote.valid_until ? format(new Date(quote.valid_until), "MMM d, yyyy") : 'N/A'}</TableCell>
                                    <TableCell>
                                        <QuoteStatusTracker status={quote.status} />
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <QuoteActions 
                                            quote={quote}
                                            client={clients.find(c => c.id === quote.client_id)}
                                            onActionSuccess={onActionSuccess}
                                        />
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}