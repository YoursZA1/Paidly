import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { formatCurrency } from "../CurrencySelector";
import QuoteActions from "./QuoteActions";
import QuoteStatusTracker from "./QuoteStatusTracker";

const statusStyles = {
    draft: "bg-muted text-muted-foreground border-border",
    sent: "bg-blue-100 text-blue-700 border-blue-200",
    viewed: "bg-purple-100 text-purple-700 border-purple-200",
    accepted: "bg-emerald-100 text-emerald-700 border-emerald-200",
    rejected: "bg-rose-100 text-rose-700 border-rose-200",
    expired: "bg-orange-100 text-orange-700 border-orange-200"
};

export default function QuoteGrid({ quotes, clients, isLoading, userCurrency, onActionSuccess }) {
    const getClientName = (clientId) => {
        const client = clients.find(c => c.id === clientId);
        return client ? client.name : "N/A";
    };

    if (isLoading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array(6).fill(0).map((_, i) => (
                    <Card key={i}>
                        <CardContent className="p-6">
                            <Skeleton className="h-24 w-full" />
                        </CardContent>
                    </Card>
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {quotes.map(quote => (
                <Card key={quote.id} className="bg-card border border-border hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex-1 space-y-1">
                                <p className="font-semibold text-foreground truncate" title={getClientName(quote.client_id)}>
                                    {getClientName(quote.client_id)}
                                </p>
                                <div className="flex items-center gap-2">
                                    <p className="text-sm text-muted-foreground">{quote.quote_number}</p>
                                    <Badge variant="secondary" className={`${statusStyles[quote.status || 'draft']} border text-[10px] px-1.5 py-0 h-5`}>
                                        {(quote.status || 'draft').replace('_', ' ')}
                                    </Badge>
                                </div>
                            </div>
                            <QuoteActions 
                                quote={quote}
                                client={clients.find(c => c.id === quote.client_id)}
                                onActionSuccess={onActionSuccess}
                            />
                        </div>
                        
                        <p className="text-sm text-muted-foreground mb-4 line-clamp-2 min-h-[40px]">
                            {quote.project_title || "No project title"}
                        </p>

                        <div className="flex flex-col gap-4 pt-4 border-t border-border">
                            <QuoteStatusTracker status={quote.status} />
                            <div className="flex justify-between items-end">
                                <div>
                                    <p className="text-sm font-bold text-foreground text-lg">
                                        {formatCurrency(quote.total_amount, userCurrency)}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Valid until: {quote.valid_until ? format(new Date(quote.valid_until), "MMM d, yyyy") : 'N/A'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}