import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  FileSpreadsheet, Download, Upload, CheckCircle, AlertCircle, 
  ArrowRight, Info
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { 
  importFromExcel, 
  generatePaidlyTemplate,
  validateUsersData,
  validateInvoiceData,
  validateClientData,
  validateServiceData,
  validateInvoiceItemsData,
  validatePaymentsData,
  validateLogsData,
  exportAllData
} from "@/utils/excelUtils";
import { Invoice, Client, Service } from "@/api/entities";
import { userService } from "@/services/ExcelUserService";

function ExcelDataCapture() {
  const { toast } = useToast();
  const [importing, setImporting] = useState(false);
  const [validationResults, setValidationResults] = useState(null);
  const [importedSheets, setImportedSheets] = useState(null);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setImporting(true);
    setValidationResults(null);
    setImportedSheets(null);

    try {
      const result = await importFromExcel(file);
      
      if (result.success) {
        setImportedSheets(result.sheets);
        
        // Validate all sheets
        const validation = {};
        
        if (result.sheets.Users) {
          validation.Users = validateUsersData(result.sheets.Users);
        }
        
        if (result.sheets.Invoices) {
          validation.Invoices = validateInvoiceData(result.sheets.Invoices, result.sheets.Users || [], result.sheets.Clients || []);
        }
        
        if (result.sheets.InvoiceItems) {
          validation.InvoiceItems = validateInvoiceItemsData(result.sheets.InvoiceItems, result.sheets.Invoices || []);
        }
        
        if (result.sheets.Payments) {
          validation.Payments = validatePaymentsData(result.sheets.Payments, result.sheets.Invoices || []);
        }
        
        if (result.sheets.Logs) {
          validation.Logs = validateLogsData(result.sheets.Logs, result.sheets.Users || []);
        }
        
        if (result.sheets.Clients) {
          validation.Clients = validateClientData(result.sheets.Clients, result.sheets.Users || []);
        }
        
        if (result.sheets.Services) {
          validation.Services = validateServiceData(result.sheets.Services);
        }
        
        setValidationResults(validation);
        
        const totalErrors = Object.values(validation).reduce((sum, v) => sum + v.errors.length, 0);
        const allValid = Object.values(validation).every(v => v.isValid);
        
        toast({
          title: allValid ? "✓ File Validated" : "⚠ Validation Issues",
          description: `Found ${result.totalSheets} sheets. ${allValid ? 'All data valid!' : `${totalErrors} errors found.`}`,
          variant: allValid ? "success" : "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "✗ Upload Failed",
        description: error.message || "Failed to read Excel file",
        variant: "destructive"
      });
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  };

  const handleImportData = async () => {
    if (!importedSheets || !validationResults) return;

    const allValid = Object.values(validationResults).every(v => v.isValid);
    if (!allValid) {
      toast({
        title: "Cannot Import",
        description: "Please fix all validation errors first",
        variant: "destructive"
      });
      return;
    }

    setImporting(true);
    try {
      let userCount = 0;
      let invoiceCount = 0;
      let clientCount = 0;
      let serviceCount = 0;

      // Import Users
      if (importedSheets.Users) {
        for (const row of importedSheets.Users) {
          try {
            userService.createUser({
              id: row.id,
              email: row.email,
              full_name: row.full_name,
              role: row.role,
              status: row.status,
              plan: row.plan,
              created_at: row.created_at,
              last_login: row.last_login
            });
            userCount++;
          } catch (error) {
            console.error('Error importing user:', error);
          }
        }
      }

      // Import Clients
      if (importedSheets.Clients) {
        for (const row of importedSheets.Clients) {
          try {
            await Client.create({
              name: row['Client Name'],
              email: row['Email'] || '',
              phone: row['Phone'] || '',
              address: row['Address'] || '',
              tax_number: row['Tax Number'] || '',
              contact_person: row['Contact Person'] || '',
              notes: row['Notes'] || ''
            });
            clientCount++;
          } catch (error) {
            console.error('Error importing client:', error);
          }
        }
      }

      // Import Services
      if (importedSheets.Services) {
        for (const row of importedSheets.Services) {
          try {
            await Service.create({
              name: row['Service Name'],
              description: row['Description'] || '',
              default_price: row['Default Price'] || 0,
              unit: row['Unit'] || 'hour',
              tax_rate: row['Tax Rate (%)'] || 0,
              category: row['Category'] || 'General'
            });
            serviceCount++;
          } catch (error) {
            console.error('Error importing service:', error);
          }
        }
      }

      // Import Invoices
      if (importedSheets.Invoices) {
        for (const row of importedSheets.Invoices) {
          try {
            await Invoice.create({
              invoice_number: row['Invoice Number'],
              project_title: row['Project Title'],
              project_description: row['Project Description'] || '',
              invoice_date: row['Invoice Date'],
              delivery_date: row['Due Date'],
              subtotal: row['Subtotal'] || (row['Quantity'] * row['Unit Price']),
              tax_rate: row['Tax Rate (%)'] || 0,
              tax_amount: row['Tax Amount'] || 0,
              total_amount: row['Total Amount'] || row['Subtotal'],
              status: row['Status']?.toLowerCase() || 'draft',
              notes: row['Notes'] || '',
              items: [{
                description: row['Item Description'] || row['Project Title'],
                quantity: row['Quantity'] || 1,
                price: row['Unit Price'] || 0
              }]
            });
            invoiceCount++;
          } catch (error) {
            console.error('Error importing invoice:', error);
          }
        }
      }
      
      toast({
        title: "✓ Import Complete",
        description: `Imported ${userCount} users, ${invoiceCount} invoices, ${clientCount} clients, ${serviceCount} services`,
        variant: "success"
      });

      setImportedSheets(null);
      setValidationResults(null);
    } catch (error) {
      toast({
        title: "✗ Import Failed",
        description: error.message || "Failed to import data",
        variant: "destructive"
      });
    } finally {
      setImporting(false);
    }
  };

  const handleExport = async () => {
    try {
      const users = userService.getAllUsers() || [];
      const invoices = await Invoice.list('-created_date') || [];
      const clients = await Client.list('-created_date') || [];
      const services = await Service.list('-created_date') || [];

      const result = await exportAllData(users, invoices, clients, services);

      if (result.success) {
        toast({
          title: "✓ Export Complete",
          description: `All data exported to ${result.filename}`,
          variant: "success"
        });
      }
    } catch (error) {
      toast({
        title: "✗ Export Failed",
        description: error.message || "Failed to export data",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <FileSpreadsheet className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-bold text-slate-900">Excel Data Capture</h1>
          </div>
          <p className="text-slate-600">Single file (paidly_data.xlsx) with multiple sheets - one sheet per table. No mixed data!</p>
        </div>

        <Tabs defaultValue="import" className="w-full">
          <TabsList className="grid w-full grid-cols-2 gap-2 mb-6">
            <TabsTrigger value="import" className="flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Import Data
            </TabsTrigger>
            <TabsTrigger value="export" className="flex items-center gap-2">
              <Download className="w-4 h-4" />
              Export Data
            </TabsTrigger>
          </TabsList>

          {/* Import Tab */}
          <TabsContent value="import">
            <Card className="border-0 shadow-sm mb-6">
              <CardHeader className="border-b">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-primary" />
                  <CardTitle>Upload paidly_data.xlsx</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <p className="text-sm text-slate-600 mb-4">
                  Upload a single Excel file containing multiple sheets: Users, Invoices, Clients, and Services.
                  Each sheet represents a separate database table.
                </p>
                <div className="space-y-3">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => generatePaidlyTemplate()}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download Template (paidly_data.xlsx)
                  </Button>
                  <div className="relative">
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={(e) => handleFileUpload(e)}
                      className="hidden"
                      id="data-upload"
                      disabled={importing}
                    />
                    <label htmlFor="data-upload">
                      <Button className="w-full" asChild disabled={importing}>
                        <span>
                          <Upload className="w-4 h-4 mr-2" />
                          {importing ? 'Processing...' : 'Upload File'}
                        </span>
                      </Button>
                    </label>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Validation Results */}
            {validationResults && (
              <Card className="border-0 shadow-sm mb-6">
                <CardHeader className="border-b">
                  <CardTitle>Validation Results</CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="space-y-4">
                    {Object.entries(validationResults).map(([sheetName, validation]) => (
                      <div key={sheetName} className="border-l-4 border-slate-300 pl-4">
                        <h3 className="font-semibold text-lg mb-2">{sheetName} Sheet</h3>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">Total Rows:</span>
                          <Badge>{validation.totalRows}</Badge>
                        </div>

                        {validation.isValid ? (
                          <Alert className="bg-green-50 border-green-200">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <AlertTitle className="text-green-900">Ready to Import</AlertTitle>
                            <AlertDescription className="text-green-800">
                              All {validation.totalRows} rows validated successfully.
                            </AlertDescription>
                          </Alert>
                        ) : (
                          <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Validation Errors Found</AlertTitle>
                            <AlertDescription>
                              Please fix the following errors:
                              <ul className="mt-2 ml-4 list-disc space-y-1">
                                {validation.errors.slice(0, 5).map((error, index) => (
                                  <li key={index} className="text-sm">{error}</li>
                                ))}
                                {validation.errors.length > 5 && (
                                  <li className="text-sm font-medium">
                                    ...and {validation.errors.length - 5} more errors
                                  </li>
                                )}
                              </ul>
                            </AlertDescription>
                          </Alert>
                        )}

                        {validation.warnings && validation.warnings.length > 0 && (
                          <Alert className="mt-2">
                            <Info className="h-4 w-4" />
                            <AlertTitle>Warnings</AlertTitle>
                            <AlertDescription>
                              <ul className="mt-2 ml-4 list-disc space-y-1">
                                {validation.warnings.slice(0, 3).map((warning, index) => (
                                  <li key={index} className="text-sm">{warning}</li>
                                ))}
                              </ul>
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    ))}

                    {Object.values(validationResults).every(v => v.isValid) && (
                      <Button
                        className="w-full"
                        onClick={handleImportData}
                        disabled={importing}
                      >
                        <ArrowRight className="w-4 h-4 mr-2" />
                        {importing ? 'Importing...' : 'Import All Data'}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Instructions */}
            <Card className="border-slate-200 bg-primary/10 shadow-sm">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Info className="w-5 h-5 text-primary" />
                  <CardTitle className="text-foreground">File Structure Rules</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="text-sm text-primary">
                <div className="space-y-3">
                  <div>
                    <p className="font-semibold mb-1">📁 File: paidly_data.xlsx</p>
                    <p>One file contains all your data across multiple sheets</p>
                  </div>
                  <div>
                    <p className="font-semibold mb-1">📊 Each Sheet = One Table</p>
                    <ul className="ml-4 list-disc space-y-1">
                      <li>Users - User accounts (id, email, full_name, role, status, plan, created_at, last_login)</li>
                      <li>Clients - Client info (id, user_id, client_name, email, phone, company, billing_address, created_at)</li>
                      <li>Invoices - Invoice records (id, invoice_number, user_id, client_id, status, subtotal, tax, discount, total, currency, issue_date, due_date, created_at)</li>
                      <li>InvoiceItems - Line items (id, invoice_id, description, quantity, rate, line_total)</li>
                      <li>Payments - Payment records (id, invoice_id, amount, payment_method, payment_date, notes)</li>
                      <li className="font-bold text-foreground">Logs - Audit trail (id, user_id, action, entity, entity_id, description, created_at) ⚠️ VERY IMPORTANT</li>
                      <li>Services - Service catalog</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-semibold mb-1">⚠️ Important Rules:</p>
                    <ul className="ml-4 list-disc space-y-1">
                      <li>All IDs must be UUIDs (generate once, never change)</li>
                      <li>No duplicate emails in Users sheet</li>
                      <li>No duplicate invoice numbers</li>
                      <li>Client user_id must exist in Users sheet</li>
                      <li>Invoice user_id must exist in Users sheet</li>
                      <li>Invoice client_id must exist in Clients sheet</li>
                      <li>InvoiceItems invoice_id must exist in Invoices sheet</li>
                      <li>Payments invoice_id must exist in Invoices sheet</li>
                      <li className="font-bold">Logs user_id must exist in Users sheet (for audit trail)</li>
                      <li className="font-bold">Logs action format: UPPERCASE_WITH_UNDERSCORES (e.g., INVOICE_CREATED)</li>
                      <li>Invoice status must be: draft | sent | paid | overdue | cancelled</li>
                      <li>Do NOT mix data in one sheet</li>
                      <li>Keep column headers exactly as in template</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-semibold mb-1">✅ Built-in Excel Validations:</p>
                    <ul className="ml-4 list-disc space-y-1">
                      <li className="text-green-700">Dropdown lists for status, role, and plan fields</li>
                      <li className="text-green-700">Date-only validation for all date fields</li>
                      <li className="text-green-700">Number-only validation for amounts and quantities</li>
                      <li className="text-green-700">No free text where enums are expected</li>
                      <li className="text-green-700">Excel will prevent invalid data entry automatically!</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Export Tab */}
          <TabsContent value="export">
            <Card className="border-0 shadow-sm mb-6">
              <CardHeader className="border-b">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-green-600" />
                  <CardTitle>Export All Data</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <p className="text-sm text-slate-600 mb-4">
                  Export all your data (Users, Clients, Invoices, InvoiceItems, Payments, Logs, Services) to a single Excel file with multiple sheets.
                </p>
                <Button
                  className="w-full"
                  onClick={() => handleExport()}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export to paidly_data.xlsx
                </Button>
              </CardContent>
            </Card>

            {/* Export Info */}
            <Card className="border-slate-200 bg-green-50 shadow-sm mt-6">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <CardTitle className="text-green-900">Export Benefits</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="text-sm text-green-800">
                <ul className="ml-4 list-disc space-y-1">
                  <li>Complete backup of all your data in one file</li>
                  <li>Multiple sheets (Users, Clients, Invoices, InvoiceItems, Payments, Logs, Services) - organized and clean</li>
                  <li>Full audit trail with Logs sheet for compliance and tracking</li>
                  <li>Analyze data using Excel&apos;s powerful features</li>
                  <li>Share data with accountants or team members</li>
                  <li>Migrate data to other systems easily</li>
                  <li>Generate custom reports and charts</li>
                </ul>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default ExcelDataCapture;
