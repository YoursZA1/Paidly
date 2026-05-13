import React, { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Edit, Eye, User, Phone, Mail, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import ClientSegmentBadge from "./ClientSegmentBadge";
import { formatCurrency } from "../CurrencySelector";

const ROW_HEIGHT = 56;
const VIRTUAL_TABLE_MAX_HEIGHT = 480;

const ClientRow = React.memo(function ClientRow({ client, currency, onEdit, onDelete, style }) {
    return (
        <TableRow className="group hover:bg-muted/50 border-border absolute inset-x-0 w-full transition-colors" style={style}>
            <TableCell className="font-medium">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center">
                        <User className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span className="text-foreground font-semibold truncate">{client.name}</span>
                        {client.industry && (
                            <span className="text-xs text-muted-foreground truncate">{client.industry}</span>
                        )}
                    </div>
                </div>
            </TableCell>
            <TableCell>
                <div className="flex flex-col gap-1 text-sm max-w-[180px]">
                    {client.email && (
                        <div className="flex items-center gap-2 text-foreground/80 truncate">
                            <Mail className="w-3 h-3 shrink-0" />
                            <span className="truncate">{client.email}</span>
                        </div>
                    )}
                    {client.phone && (
                        <div className="flex items-center gap-2 text-muted-foreground text-xs">
                            <Phone className="w-3 h-3 shrink-0" />
                            {client.phone}
                        </div>
                    )}
                </div>
            </TableCell>
            <TableCell>
                <ClientSegmentBadge segment={client.segment || "new"} />
            </TableCell>
            <TableCell>
                <span className="font-bold text-foreground">
                    {formatCurrency(client.total_spent, currency)}
                </span>
            </TableCell>
            <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                {client.created_date ? new Date(client.created_date).toLocaleDateString() : "—"}
            </TableCell>
            <TableCell className="text-right">
                <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit(client)}
                        className="h-8 w-8 text-muted-foreground/60 hover:text-foreground"
                    >
                        <Edit className="w-4 h-4" />
                    </Button>
                    <Link to={createPageUrl("ClientDetail") + `?id=${client.id}`}>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground/60 hover:text-foreground">
                            <Eye className="w-4 h-4" />
                        </Button>
                    </Link>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete?.(client)}
                        className="h-8 w-8 text-muted-foreground/60 hover:text-destructive"
                    >
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </div>
            </TableCell>
        </TableRow>
    );
});

const VirtualizedClientTableBody = React.memo(function VirtualizedClientTableBody({ clients, parentRef, currency, onEdit, onDelete }) {
    const rowVirtualizer = useVirtualizer({
        count: clients.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => ROW_HEIGHT,
        overscan: 8,
    });
    const virtualRows = rowVirtualizer.getVirtualItems();
    const totalSize = rowVirtualizer.getTotalSize();

    return (
        <>
            {totalSize > 0 && (
                <TableRow className="border-0 [&>td]:p-0 [&>td]:border-0" style={{ height: `${totalSize}px` }} aria-hidden>
                    <TableCell colSpan={6} className="!p-0 !border-0 !h-0" style={{ height: `${totalSize}px`, lineHeight: 0, overflow: "hidden" }} />
                </TableRow>
            )}
            {virtualRows.map((virtualRow) => {
                const client = clients[virtualRow.index];
                return (
                    <ClientRow
                        key={client.id}
                        client={client}
                        currency={currency}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        style={{
                            height: `${virtualRow.size}px`,
                            transform: `translateY(${virtualRow.start}px)`,
                            top: 0,
                        }}
                    />
                );
            })}
        </>
    );
});

export default function ClientList({ clients, onEdit, onDelete, currency }) {
    const parentRef = useRef(null);

    if (clients.length === 0) {
        return (
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Client</TableHead>
                            <TableHead>Contact Info</TableHead>
                            <TableHead>Segment</TableHead>
                            <TableHead>Total Spent</TableHead>
                            <TableHead className="hidden md:table-cell">Added</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <TableRow>
                            <TableCell colSpan={6} className="text-center py-16">
                                <div className="flex flex-col items-center gap-2">
                                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                                        <User className="w-5 h-5 text-muted-foreground" />
                                    </div>
                                    <p className="text-sm font-medium text-foreground">No clients yet</p>
                                    <p className="text-xs text-muted-foreground">Add your first client to get started</p>
                                </div>
                            </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </div>
        );
    }

    return (
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <div
                ref={parentRef}
                className="overflow-auto overflow-x-auto"
                style={{ maxHeight: VIRTUAL_TABLE_MAX_HEIGHT }}
            >
                <Table className="min-w-[700px] table-fixed">
                    <TableHeader>
                        <TableRow className="bg-card sticky top-0 z-10 border-border">
                            <TableHead>Client</TableHead>
                            <TableHead>Contact Info</TableHead>
                            <TableHead>Segment</TableHead>
                            <TableHead>Total Spent</TableHead>
                            <TableHead className="hidden md:table-cell">Added</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody style={{ position: "relative" }}>
                        <VirtualizedClientTableBody
                            clients={clients}
                            parentRef={parentRef}
                            currency={currency}
                            onEdit={onEdit}
                            onDelete={onDelete}
                        />
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}