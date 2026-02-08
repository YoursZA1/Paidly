import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

const statusStyles = {
    active: "bg-emerald-100 text-emerald-700",
    paused: "bg-amber-100 text-amber-700",
    ended: "bg-slate-100 text-slate-700",
};

export default function RecurringGrid({ profiles, clients, isLoading }) {
    const getClientName = (clientId) => {
        return clients.find(c => c.id === clientId)?.name || "N/A";
    };

    if (isLoading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-48 w-full" />)}
            </div>
        );
    }

    if (profiles.length === 0) {
        return <p className="text-gray-500 col-span-full text-center py-10">No recurring invoice profiles found.</p>;
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {profiles.map(profile => (
                <Card key={profile.id} className="flex flex-col">
                    <CardHeader>
                        <div className="flex justify-between items-start">
                            <CardTitle className="text-lg">{profile.profile_name}</CardTitle>
                            <Badge className={statusStyles[profile.status]}>
                                {profile.status}
                            </Badge>
                        </div>
                        <p className="text-sm text-gray-500">{getClientName(profile.client_id)}</p>
                    </CardHeader>
                    <CardContent className="flex-grow space-y-2">
                        <p className="text-sm">
                            <strong>Frequency:</strong> <span className="capitalize">{profile.frequency}</span>
                        </p>
                        <p className="text-sm">
                            <strong>Next Invoice:</strong> {format(new Date(profile.next_generation_date), 'MMMM d, yyyy')}
                        </p>
                        {profile.end_date && (
                            <p className="text-sm">
                                <strong>Ends On:</strong> {format(new Date(profile.end_date), 'MMMM d, yyyy')}
                            </p>
                        )}
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}