import React, { useState, useEffect } from "react";
import { Payroll, User } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Receipt, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { motion } from "framer-motion";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format, parseISO, isValid } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import PayslipActions from "../components/payslips/PayslipActions";
import { formatCurrency } from "../components/CurrencySelector";

const statusStyles = {
    draft: "bg-slate-100 text-slate-700 border-slate-200",
    sent: "bg-blue-100 text-blue-700 border-blue-200",
    paid: "bg-emerald-100 text-emerald-700 border-emerald-200"
};

const safeFormatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    const date = parseISO(dateStr);
    return isValid(date) ? format(date, 'MMM d, yyyy') : 'N/A';
};

export default function PayslipsPage() {
    const [payslips, setPayslips] = useState([]);
    const [user, setUser] = useState(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [payslipsData, userData] = await Promise.all([
                Payroll.list("-created_date"),
                User.me()
            ]);
            setPayslips(payslipsData);
            setUser(userData);
        } catch (error) {
            console.error("Error loading data:", error);
        }
        setIsLoading(false);
    };

    const userCurrency = user?.currency || 'ZAR';

    const filteredPayslips = payslips.filter(payslip =>
        payslip.employee_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        payslip.payslip_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        payslip.position?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Pagination logic
    const totalPages = Math.ceil(filteredPayslips.length / itemsPerPage);
    const paginatedPayslips = filteredPayslips.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    // Reset to page 1 when search changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

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
                            Payslips
                        </h1>
                        <p className="text-gray-600">
                            Manage and distribute employee payslips
                        </p>
                    </div>
                    <Link to={createPageUrl("CreatePayslip")}>
                        <Button className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 w-full sm:w-auto">
                            <Plus className="w-4 h-4 mr-2" />
                            Create New Payslip
                        </Button>
                    </Link>
                </motion.div>

                <Card className="bg-white border border-gray-200">
                    <CardHeader>
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <CardTitle>Payslip List</CardTitle>
                            <div className="relative w-full sm:max-w-xs">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <Input
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Search payslips..."
                                    className="pl-10 h-10 rounded-xl w-full"
                                />
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0 sm:p-6 sm:pt-0">
                        {/* Desktop Table View */}
                        <div className="overflow-x-auto hidden md:block">
                            <Table className="min-w-[800px]">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Payslip #</TableHead>
                                        <TableHead>Employee Name</TableHead>
                                        <TableHead>Position</TableHead>
                                        <TableHead>Pay Period</TableHead>
                                        <TableHead>Net Pay</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        Array(5).fill(0).map((_, i) => (
                                            <TableRow key={i}>
                                                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                                                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                                                <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                                                <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                                                <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                                                <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                                                <TableCell><div className="flex justify-end"><Skeleton className="h-8 w-8 rounded-md" /></div></TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        paginatedPayslips.map(payslip => (
                                            <TableRow key={payslip.id}>
                                                <TableCell className="font-medium">{payslip.payslip_number}</TableCell>
                                                <TableCell>{payslip.employee_name}</TableCell>
                                                <TableCell>{payslip.position || 'N/A'}</TableCell>
                                                <TableCell>
                                                    {payslip.pay_period_start && payslip.pay_period_end 
                                                        ? `${safeFormatDate(payslip.pay_period_start)} - ${safeFormatDate(payslip.pay_period_end)}`
                                                        : 'N/A'}
                                                </TableCell>
                                                <TableCell>{formatCurrency(payslip.net_pay, userCurrency)}</TableCell>
                                                <TableCell>
                                                    <Badge variant="secondary" className={`${statusStyles[payslip.status || 'draft']} border`}>
                                                        {(payslip.status || 'draft')}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <PayslipActions 
                                                        payslip={payslip}
                                                        onActionSuccess={loadData}
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                        {/* Mobile Card View */}
                        <div className="md:hidden space-y-4 p-4">
                            {isLoading ? (
                                Array(3).fill(0).map((_, i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-24 w-full" /></CardContent></Card>)
                            ) : filteredPayslips.length === 0 ? (
                                <div className="text-center py-12">
                                    <Receipt className="mx-auto h-12 w-12 text-gray-400" />
                                    <h3 className="mt-2 text-sm font-medium text-gray-900">No payslips found</h3>
                                    <p className="mt-1 text-sm text-gray-500">Create your first payslip to see it here.</p>
                                    <div className="mt-6">
                                        <Link to={createPageUrl("CreatePayslip")}>
                                            <Button>
                                                <Plus className="-ml-1 mr-2 h-5 w-5" />
                                                New Payslip
                                            </Button>
                                        </Link>
                                    </div>
                                </div>
                            ) : (
                                paginatedPayslips.map(payslip => (
                                    <Card key={payslip.id} className="bg-white border border-slate-200">
                                        <CardContent className="p-4">
                                            <div className="flex justify-between items-start">
                                                <div className="flex-1 space-y-1">
                                                    <p className="font-semibold text-slate-800">{payslip.employee_name}</p>
                                                    <p className="text-sm text-slate-600">{payslip.payslip_number}</p>
                                                    <p className="text-sm text-slate-500">{payslip.position || 'N/A'}</p>
                                                </div>
                                                <PayslipActions 
                                                    payslip={payslip}
                                                    onActionSuccess={loadData}
                                                />
                                            </div>
                                            <div className="flex justify-between items-end mt-2 pt-2 border-t border-slate-100">
                                                <div>
                                                    <p className="text-sm font-bold text-slate-800">{formatCurrency(payslip.net_pay, userCurrency)}</p>
                                                    <p className="text-xs text-slate-500">
                                                        {payslip.pay_period_start && payslip.pay_period_end
                                                            ? `${safeFormatDate(payslip.pay_period_start)} - ${safeFormatDate(payslip.pay_period_end)}`
                                                            : 'N/A'}
                                                    </p>
                                                </div>
                                                <Badge variant="secondary" className={`${statusStyles[payslip.status || 'draft']} border text-xs`}>
                                                    {(payslip.status || 'draft')}
                                                </Badge>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))
                            )}
                        </div>
                        
                        {/* Pagination Controls */}
                        {totalPages > 1 && (
                            <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-t pt-4 px-4">
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
                                        of {filteredPayslips.length} payslips
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
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}