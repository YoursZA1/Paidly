import React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { RefreshCw } from "lucide-react";
import { format } from "date-fns";

const statusStyles = {
    active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    paused: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    ended: "bg-muted text-muted-foreground",
};

export default function RecurringList({ profiles, clients, isLoading }) {
    const getClientName = (clientId) => {
        return clients.find(c => c.id === clientId)?.name || "N/A";
    };

    if (isLoading) {
        return (
            <div className="rounded-md border overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Profile Name</TableHead>
                            <TableHead>Client</TableHead>
                            <TableHead>Frequency</TableHead>
                            <TableHead>Next Invoice</TableHead>
                            <TableHead>Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {Array(3).fill(0).map((_, i) => (
                            <TableRow key={i}>
                                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                                <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                                <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        );
    }

    if (profiles.length === 0) {
        return (
            <EmptyState
                icon={<RefreshCw className="w-6 h-6 text-muted-foreground" />}
                title="No recurring profiles yet"
                description="Set up recurring billing to automate repeat invoices."
            />
        );
    }

    return (
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Profile Name</TableHead>
                            <TableHead>Client</TableHead>
                            <TableHead>Frequency</TableHead>
                            <TableHead>Next Invoice</TableHead>
                            <TableHead>Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {profiles.map(profile => (
                            <TableRow key={profile.id} className="hover:bg-muted/50">
                                <TableCell className="font-medium">{profile.profile_name}</TableCell>
                                <TableCell>{getClientName(profile.client_id)}</TableCell>
                                <TableCell className="capitalize">{profile.frequency}</TableCell>
                                <TableCell>{format(new Date(profile.next_generation_date), 'MMM d, yyyy')}</TableCell>
                                <TableCell>
                                    <Badge className={statusStyles[profile.status]}>
                                        {profile.status}
                                    </Badge>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}