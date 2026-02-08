import React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit, Eye, ExternalLink, MoreHorizontal, User, Phone, Mail, MapPin, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import ClientSegmentBadge from "./ClientSegmentBadge";
import { formatCurrency } from "../CurrencySelector";

export default function ClientList({ clients, onEdit, onDelete, currency }) {
    return (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
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
                    {clients.map((client) => (
                        <TableRow key={client.id} className="group hover:bg-slate-50">
                            <TableCell className="font-medium">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center">
                                        <User className="w-4 h-4 text-slate-500" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-slate-900 font-semibold">{client.name}</span>
                                        {client.industry && (
                                            <span className="text-xs text-slate-500">{client.industry}</span>
                                        )}
                                    </div>
                                </div>
                            </TableCell>
                            <TableCell>
                                <div className="flex flex-col gap-1 text-sm">
                                    {client.email && (
                                        <div className="flex items-center gap-2 text-slate-600">
                                            <Mail className="w-3 h-3" />
                                            {client.email}
                                        </div>
                                    )}
                                    {client.phone && (
                                        <div className="flex items-center gap-2 text-slate-500 text-xs">
                                            <Phone className="w-3 h-3" />
                                            {client.phone}
                                        </div>
                                    )}
                                </div>
                            </TableCell>
                            <TableCell>
                                <ClientSegmentBadge segment={client.segment || 'new'} />
                            </TableCell>
                            <TableCell>
                                <span className="font-bold text-slate-700">
                                    {formatCurrency(client.total_spent, currency)}
                                </span>
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-slate-500 text-sm">
                                {new Date(client.created_date).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => onEdit(client)}
                                        className="h-8 w-8 text-slate-400 hover:text-blue-600"
                                    >
                                        <Edit className="w-4 h-4" />
                                    </Button>
                                    <Link to={createPageUrl("ClientDetail") + `?id=${client.id}`}>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-blue-600">
                                            <Eye className="w-4 h-4" />
                                        </Button>
                                    </Link>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => onDelete?.(client)}
                                        className="h-8 w-8 text-red-500 hover:text-red-600"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}