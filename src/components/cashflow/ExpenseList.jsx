import React, { useState, useCallback, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Edit, Trash2, Receipt, CheckCircle, XCircle, Clock } from "lucide-react";
import { formatCurrency } from "../CurrencySelector";
import { format, parseISO } from "date-fns";
import ConfirmationDialog from "../shared/ConfirmationDialog";
import { Expense } from "@/api/entities";
import { useAuth } from "@/contexts/AuthContext";

const ROW_HEIGHT = 56;
const VIRTUAL_TABLE_MAX_HEIGHT = 480;

const categoryColors = {
    office: "bg-primary/15 text-primary",
    travel: "bg-purple-100 text-purple-700",
    utilities: "bg-yellow-100 text-yellow-700",
    supplies: "bg-green-100 text-green-700",
    salary: "bg-red-100 text-red-700",
    marketing: "bg-pink-100 text-pink-700",
    software: "bg-primary/15 text-primary",
    other: "bg-muted text-muted-foreground"
};

const statusConfig = {
    pending: { color: "bg-yellow-100 text-yellow-800", icon: Clock },
    approved: { color: "bg-green-100 text-green-800", icon: CheckCircle },
    rejected: { color: "bg-red-100 text-red-800", icon: XCircle },
    not_required: { color: "bg-muted text-muted-foreground", icon: null }
};

const ExpenseRow = React.memo(function ExpenseRow({
    expense,
    currency,
    onEdit,
    setDeleteExpenseId,
    handleApproval,
    isAdmin,
    style,
}) {
    const status = expense.approval_status || (expense.is_claimable ? "pending" : "not_required");
    const StatusIcon = statusConfig[status]?.icon;
    return (
        <TableRow className="border-border absolute inset-x-0 w-full" style={style}>
            <TableCell>{expense.date ? format(parseISO(expense.date), "MMM d, yyyy") : "N/A"}</TableCell>
            <TableCell>
                <Badge className={categoryColors[expense.category] || categoryColors.other}>
                    {expense.category}
                </Badge>
            </TableCell>
            <TableCell className="font-medium max-w-[200px] truncate" title={expense.description}>
                {expense.description}
                {expense.is_mileage && <span className="ml-2 text-xs text-muted-foreground">(Mileage)</span>}
            </TableCell>
            <TableCell>{expense.vendor || "-"}</TableCell>
            <TableCell className="font-semibold">{formatCurrency(expense.amount, currency)}</TableCell>
            <TableCell>
                {expense.is_claimable ? (
                    <Badge variant="outline" className={`${statusConfig[status]?.color} border-0 flex w-fit items-center gap-1`}>
                        {StatusIcon && <StatusIcon className="w-3 h-3" />}
                        {status.replace("_", " ")}
                    </Badge>
                ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                )}
            </TableCell>
            <TableCell className="text-right">
                <div className="flex gap-1 justify-end items-center">
                    {isAdmin && status === "pending" && expense.is_claimable && (
                        <>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => handleApproval(expense, "approved")} title="Approve">
                                <CheckCircle className="w-4 h-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleApproval(expense, "rejected")} title="Reject">
                                <XCircle className="w-4 h-4" />
                            </Button>
                            <div className="w-px h-4 bg-border mx-1" />
                        </>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => onEdit(expense)}>
                        <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteExpenseId(expense.id)}>
                        <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                </div>
            </TableCell>
        </TableRow>
    );
});

const VirtualizedExpenseTableBody = React.memo(function VirtualizedExpenseTableBody({
    expenses,
    parentRef,
    currency,
    onEdit,
    setDeleteExpenseId,
    handleApproval,
    isAdmin,
}) {
    const rowVirtualizer = useVirtualizer({
        count: expenses.length,
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
                    <TableCell colSpan={7} className="!p-0 !border-0 !h-0" style={{ height: `${totalSize}px`, lineHeight: 0, overflow: "hidden" }} />
                </TableRow>
            )}
            {virtualRows.map((virtualRow) => {
                const expense = expenses[virtualRow.index];
                return (
                    <ExpenseRow
                        key={expense.id}
                        expense={expense}
                        currency={currency}
                        onEdit={onEdit}
                        setDeleteExpenseId={setDeleteExpenseId}
                        handleApproval={handleApproval}
                        isAdmin={isAdmin}
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

function ExpenseList({ expenses, isLoading, onEdit, onDelete, currency = "ZAR", onActionSuccess }) {
    const [deleteExpenseId, setDeleteExpenseId] = useState(null);
    const tableScrollRef = useRef(null);
    const { profile: currentUser } = useAuth();

    const handleDelete = useCallback(async () => {
        if (deleteExpenseId) {
            await onDelete(deleteExpenseId);
            setDeleteExpenseId(null);
        }
    }, [deleteExpenseId, onDelete]);

    const handleApproval = useCallback(async (expense, status) => {
        try {
            await Expense.update(expense.id, {
                approval_status: status,
                approved_by: currentUser?.email,
                approved_at: new Date().toISOString()
            });
            if (onActionSuccess) onActionSuccess();
        } catch (error) {
            console.error("Error updating approval status:", error);
        }
    }, [currentUser?.email, onActionSuccess]);

    const isAdmin = currentUser?.role === 'admin';

    return (
        <>
            <Card className="gap-0 overflow-hidden p-0">
                <CardHeader className="px-4 pt-4">
                    <CardTitle>Recent Expenses</CardTitle>
                </CardHeader>
                <CardContent className="p-0 sm:px-6 sm:pb-6 sm:pt-0">
                    {/* Desktop View: virtualized table for large lists */}
                    <div className="hidden md:block overflow-x-auto mobile-scroll-x min-w-0">
                        {isLoading ? (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Category</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead>Vendor</TableHead>
                                        <TableHead>Amount</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {Array(5).fill(0).map((_, i) => (
                                        <TableRow key={i}>
                                            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                                            <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                                            <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                                            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                                            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                                            <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                                            <TableCell><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        ) : expenses.length === 0 ? (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Category</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead>Vendor</TableHead>
                                        <TableHead>Amount</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-12">
                                            <Receipt className="mx-auto h-12 w-12 text-muted-foreground" />
                                            <h3 className="mt-2 text-sm font-medium text-foreground">No expenses recorded</h3>
                                            <p className="mt-1 text-sm text-muted-foreground">Start tracking your business expenses.</p>
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        ) : (
                            <div
                                ref={tableScrollRef}
                                className="overflow-auto overflow-x-auto"
                                style={{ maxHeight: VIRTUAL_TABLE_MAX_HEIGHT }}
                            >
                                <Table className="min-w-[640px] table-fixed">
                                    <TableHeader>
                                        <TableRow className="bg-card sticky top-0 z-10 border-border">
                                            <TableHead>Date</TableHead>
                                            <TableHead>Category</TableHead>
                                            <TableHead>Description</TableHead>
                                            <TableHead>Vendor</TableHead>
                                            <TableHead>Amount</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody style={{ position: "relative" }}>
                                        <VirtualizedExpenseTableBody
                                            expenses={expenses}
                                            parentRef={tableScrollRef}
                                            currency={currency}
                                            onEdit={onEdit}
                                            setDeleteExpenseId={setDeleteExpenseId}
                                            handleApproval={handleApproval}
                                            isAdmin={isAdmin}
                                        />
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </div>

                    {/* Mobile View */}
                    <div className="md:hidden space-y-4 p-4">
                        {isLoading ? (
                            Array(3).fill(0).map((_, i) => (
                                <Card key={i}><CardContent><Skeleton className="h-24 w-full" /></CardContent></Card>
                            ))
                        ) : expenses.length === 0 ? (
                            <div className="text-center py-12">
                                <Receipt className="mx-auto h-12 w-12 text-muted-foreground" />
                                <h3 className="mt-2 text-sm font-medium text-foreground">No expenses recorded</h3>
                            </div>
                        ) : (
                            expenses.map(expense => {
                                const status = expense.approval_status || (expense.is_claimable ? 'pending' : 'not_required');
                                return (
                                    <Card key={expense.id}>
                                        <CardContent>
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex-1 mr-2">
                                                    <p className="font-semibold text-foreground line-clamp-1">{expense.description}</p>
                                                    <p className="text-sm text-muted-foreground">{expense.vendor || 'No vendor'}</p>
                                                </div>
                                                <div className="flex flex-col items-end gap-1">
                                                    <Badge className={categoryColors[expense.category] || categoryColors.other}>
                                                        {expense.category}
                                                    </Badge>
                                                    {expense.is_claimable && (
                                                        <Badge variant="outline" className={`${statusConfig[status]?.color} border-0 text-[10px]`}>
                                                            {status}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex justify-between items-center pt-2 border-t mt-2">
                                                <div>
                                                    <p className="text-lg font-bold text-foreground">
                                                        {formatCurrency(expense.amount, currency)}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {expense.date ? format(parseISO(expense.date), 'MMM d, yyyy') : 'N/A'}
                                                    </p>
                                                </div>
                                                <div className="flex gap-1">
                                                    {isAdmin && status === 'pending' && expense.is_claimable && (
                                                        <>
                                                            <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => handleApproval(expense, 'approved')}>
                                                                <CheckCircle className="w-4 h-4" />
                                                            </Button>
                                                            <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" onClick={() => handleApproval(expense, 'rejected')}>
                                                                <XCircle className="w-4 h-4" />
                                                            </Button>
                                                        </>
                                                    )}
                                                    <Button variant="ghost" size="icon" onClick={() => onEdit(expense)}>
                                                        <Edit className="w-4 h-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" onClick={() => setDeleteExpenseId(expense.id)}>
                                                        <Trash2 className="w-4 h-4 text-red-600" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })
                        )}
                    </div>
                </CardContent>
            </Card>

            <ConfirmationDialog
                isOpen={!!deleteExpenseId}
                onClose={() => setDeleteExpenseId(null)}
                onConfirm={handleDelete}
                title="Delete Expense"
                description="Are you sure you want to delete this expense? This action cannot be undone."
                confirmText="Delete"
            />
        </>
    );
}

export default React.memo(ExpenseList);