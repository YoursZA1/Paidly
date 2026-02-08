import React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

const statusStyles = {
    active: "bg-emerald-100 text-emerald-700",
    paused: "bg-amber-100 text-amber-700",
    ended: "bg-slate-100 text-slate-700",
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
        return <p className="text-gray-500 text-center py-10">No recurring invoice profiles found.</p>;
    }

    return (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
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
                            <TableRow key={profile.id} className="hover:bg-slate-50">
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