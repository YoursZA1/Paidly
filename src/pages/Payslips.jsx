import React, { useState, useEffect, useRef } from "react";
import { Payroll } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Receipt, ChevronLeft, ChevronRight, Download, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { motion } from "framer-motion";
import { useToast } from "@/components/ui/use-toast";
import { payslipsToCsv, parsePayslipCsv, csvRowToPayslipPayload } from "@/utils/payslipCsvMapping";
import PayslipList from "../components/payslips/PayslipList";
import { useAppStore } from "@/stores/useAppStore";

export default function PayslipsPage() {
    const payslipsFromStore = useAppStore((s) => s.payslips);
    const setPayslipsInStore = useAppStore((s) => s.setPayslips);
    const userProfile = useAppStore((s) => s.userProfile);
    const [searchTerm, setSearchTerm] = useState("");
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const payslipFileInputRef = useRef(null);
    const { toast } = useToast();

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        setIsRefreshing(true);
        try {
            const payslipsData = await Payroll.list("-created_date", { limit: 100, maxWaitMs: 4000 });
            setPayslipsInStore(Array.isArray(payslipsData) ? payslipsData : []);
        } catch (error) {
            console.error("Error loading data:", error);
            toast({ title: "Could not load payslips", description: error?.message, variant: "destructive" });
        }
        setIsRefreshing(false);
        setIsLoading(false);
    };

    const handleExportCsv = async () => {
        setIsExporting(true);
        try {
            const list = await Payroll.list("-created_date", { limit: 500, maxWaitMs: 8000 });
            if (!list?.length) {
                toast({ title: "No payslips to export", variant: "destructive" });
                return;
            }
            const csv = payslipsToCsv(list);
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "Payslip_export.csv";
            a.click();
            URL.revokeObjectURL(url);
            toast({ title: "Export complete", description: `${list.length} payslip(s) exported.`, variant: "default" });
        } catch (error) {
            toast({ title: "Export failed", description: error?.message || "Failed to export.", variant: "destructive" });
        }
        setIsExporting(false);
    };

    const handleImportCsv = (e) => {
        const file = e?.target?.files?.[0];
        if (!file) return;
        setIsImporting(true);
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const text = ev.target?.result ?? "";
                const { headers, rows } = parsePayslipCsv(text);
                if (!headers?.length || !rows?.length) {
                    toast({ title: "Import failed", description: "CSV is empty or invalid.", variant: "destructive" });
                    return;
                }
                let created = 0;
                for (const row of rows) {
                    const payload = csvRowToPayslipPayload(headers, row);
                    if (payload.employee_name) {
                        await Payroll.create(payload);
                        created++;
                    }
                }
                toast({ title: "Import complete", description: `${created} payslip(s) imported.`, variant: "default" });
                loadData();
            } catch (err) {
                toast({ title: "Import failed", description: err?.message || "Could not parse CSV.", variant: "destructive" });
            }
            setIsImporting(false);
            if (payslipFileInputRef.current) payslipFileInputRef.current.value = "";
        };
        reader.readAsText(file, "UTF-8");
    };

    const payslips = payslipsFromStore ?? [];
    useEffect(() => {
        setIsLoading(payslips.length === 0 && isRefreshing);
    }, [payslips.length, isRefreshing]);

    const userCurrency = userProfile?.currency || "ZAR";

    const filteredPayslips = payslips.filter(
        (payslip) =>
            payslip.employee_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            payslip.payslip_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            payslip.position?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalPages = Math.ceil(filteredPayslips.length / itemsPerPage);
    const paginatedPayslips = filteredPayslips.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    return (
        <div className="min-h-screen bg-background w-full min-w-0 mobile-page px-4 sm:px-6">
            <div className="max-w-7xl mx-auto w-full min-w-0">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="flex flex-col gap-3 sm:gap-4 mb-4 sm:mb-6 md:mb-8"
                >
                    <div className="flex flex-col gap-0.5 sm:gap-1 min-w-0">
                        <h1 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-semibold text-foreground font-display truncate">
                            Payslips
                        </h1>
                        <p className="text-xs sm:text-sm text-muted-foreground">
                            Manage and distribute employee payslips.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 sm:gap-2 items-center">
                        <input
                            type="file"
                            name="payslips_import_csv"
                            ref={payslipFileInputRef}
                            accept=".csv"
                            className="hidden"
                            onChange={handleImportCsv}
                        />
                        <Link to={createPageUrl("CreatePayslip")} className="order-first sm:order-none w-full sm:w-auto">
                            <Button className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2.5 h-11 sm:h-9 rounded-xl gap-2 touch-manipulation">
                                <Plus className="w-4 h-4 shrink-0" />
                                Create payslip
                            </Button>
                        </Link>
                        <Button variant="outline" size="sm" disabled={isImporting} onClick={() => payslipFileInputRef.current?.click()} className="rounded-xl h-10 sm:h-9">
                            <Upload className={`w-4 h-4 mr-2 ${isImporting ? "animate-pulse" : ""}`} />
                            {isImporting ? "Importing…" : "Import CSV"}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={isExporting}
                            onClick={handleExportCsv}
                            className="rounded-xl h-10 sm:h-9"
                        >
                            <Download className="w-4 h-4 mr-2" />
                            {isExporting ? "Exporting…" : "Export CSV"}
                        </Button>
                    </div>
                </motion.div>

                <Card className="rounded-xl overflow-hidden w-full min-w-0 mobile-card-wrap">
                    <CardHeader className="p-3 sm:p-4 md:p-6">
                        <div className="space-y-4">
                            <CardTitle className="text-base font-semibold text-foreground">Payslip list</CardTitle>
                            <div className="relative w-full max-w-md">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                                <Input
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Search by employee, number, or position…"
                                    className="pl-10 h-10 rounded-xl w-full border-border"
                                />
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-3 sm:p-4 md:p-6 overflow-hidden">
                        {isLoading ? (
                            <PayslipList payslips={[]} isLoading userCurrency={userCurrency} onActionSuccess={loadData} />
                        ) : filteredPayslips.length === 0 ? (
                            <div className="text-center py-12">
                                <div className="mx-auto w-14 h-14 bg-muted rounded-2xl flex items-center justify-center mb-4">
                                    <Receipt className="h-7 w-7 text-muted-foreground" />
                                </div>
                                <h3 className="mt-2 text-base font-semibold text-foreground font-display">No payslips yet</h3>
                                <p className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">
                                    {searchTerm
                                        ? "Try a different search."
                                        : "Create your first payslip to see it here."}
                                </p>
                                {!searchTerm && (
                                    <div className="mt-6">
                                        <Link to={createPageUrl("CreatePayslip")}>
                                            <Button className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
                                                <Plus className="-ml-1 mr-2 h-5 w-5" />
                                                Create your first payslip
                                            </Button>
                                        </Link>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <>
                                <PayslipList
                                    payslips={paginatedPayslips}
                                    isLoading={false}
                                    userCurrency={userCurrency}
                                    onActionSuccess={loadData}
                                />

                                {totalPages > 1 && (
                                    <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-border pt-4">
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <span>Show</span>
                                            <Select
                                                value={itemsPerPage.toString()}
                                                onValueChange={(v) => {
                                                    setItemsPerPage(Number(v));
                                                    setCurrentPage(1);
                                                }}
                                            >
                                                <SelectTrigger className="w-[70px] h-9 rounded-lg">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="rounded-xl">
                                                    <SelectItem value="10">10</SelectItem>
                                                    <SelectItem value="25">25</SelectItem>
                                                    <SelectItem value="50">50</SelectItem>
                                                    <SelectItem value="100">100</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <span>of {filteredPayslips.length} payslips</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="rounded-lg"
                                                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                                disabled={currentPage === 1}
                                            >
                                                <ChevronLeft className="w-4 h-4 mr-1" />
                                                Previous
                                            </Button>
                                            <div className="flex items-center gap-1">
                                                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                                    let pageNum;
                                                    if (totalPages <= 5) pageNum = i + 1;
                                                    else if (currentPage <= 3) pageNum = i + 1;
                                                    else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                                                    else pageNum = currentPage - 2 + i;
                                                    return (
                                                        <Button
                                                            key={i}
                                                            variant={currentPage === pageNum ? "default" : "outline"}
                                                            size="sm"
                                                            onClick={() => setCurrentPage(pageNum)}
                                                            className="w-9 h-9 rounded-lg"
                                                        >
                                                            {pageNum}
                                                        </Button>
                                                    );
                                                })}
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="rounded-lg"
                                                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
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
