import { importFromExcelUrl } from "@/utils/excelUtils";
import { Client, Invoice, Service } from "@/api/entities";
import { userService } from "@/services/ExcelUserService";

const CONNECTED_FLAG = "paidly_excel_db_connected";

const clearEntity = async (entity) => {
  try {
    entity.data = {};
    entity.saveToStorage();
    entity.notifySubscribers();
  } catch {
    // ignore
  }
};

const importUsers = (rows, { overwrite }) => {
  return userService.importUsersFromExcel(rows, { overwrite });
};

const importClients = async (rows) => {
  let count = 0;
  for (const row of rows) {
    try {
      await Client.create({
        name: row["Client Name"] || row.name || "",
        email: row["Email"] || row.email || "",
        phone: row["Phone"] || row.phone || "",
        address: row["Address"] || row.address || "",
        tax_number: row["Tax Number"] || row.tax_number || "",
        contact_person: row["Contact Person"] || row.contact_person || "",
        notes: row["Notes"] || row.notes || ""
      });
      count += 1;
    } catch {
      // ignore individual row errors
    }
  }
  return count;
};

const importServices = async (rows) => {
  let count = 0;
  for (const row of rows) {
    try {
      await Service.create({
        name: row["Service Name"] || row.name || "",
        description: row["Description"] || row.description || "",
        default_price: row["Default Price"] || row.default_price || 0,
        unit: row["Unit"] || row.unit || "hour",
        tax_rate: row["Tax Rate (%)"] || row.tax_rate || 0,
        category: row["Category"] || row.category || "General"
      });
      count += 1;
    } catch {
      // ignore individual row errors
    }
  }
  return count;
};

const importInvoices = async (rows) => {
  let count = 0;
  for (const row of rows) {
    try {
      await Invoice.create({
        invoice_number: row["Invoice Number"] || row.invoice_number || "",
        project_title: row["Project Title"] || row.project_title || "",
        project_description: row["Project Description"] || row.project_description || "",
        invoice_date: row["Invoice Date"] || row.invoice_date || "",
        delivery_date: row["Due Date"] || row.delivery_date || "",
        subtotal: row["Subtotal"] || row.subtotal || (row["Quantity"] * row["Unit Price"]) || 0,
        tax_rate: row["Tax Rate (%)"] || row.tax_rate || 0,
        tax_amount: row["Tax Amount"] || row.tax_amount || 0,
        total_amount: row["Total Amount"] || row.total_amount || row["Subtotal"] || 0,
        status: (row["Status"] || row.status || "draft").toString().toLowerCase(),
        notes: row["Notes"] || row.notes || "",
        items: [
          {
            description: row["Item Description"] || row.project_title || "",
            quantity: row["Quantity"] || 1,
            price: row["Unit Price"] || 0
          }
        ]
      });
      count += 1;
    } catch {
      // ignore individual row errors
    }
  }
  return count;
};

export const connectExcelDatabase = async ({
  url = "/paidly_data.xlsx",
  overwrite = false
} = {}) => {
  if (!overwrite && localStorage.getItem(CONNECTED_FLAG) === "true") {
    return { success: true, skipped: true };
  }

  const result = await importFromExcelUrl(url);
  if (!result.success) {
    return result;
  }

  const { sheets } = result;

  if (overwrite) {
    await clearEntity(Client);
    await clearEntity(Service);
    await clearEntity(Invoice);
  }

  const userCount = sheets.Users ? importUsers(sheets.Users, { overwrite }) : 0;
  const clientCount = sheets.Clients ? await importClients(sheets.Clients) : 0;
  const serviceCount = sheets.Services ? await importServices(sheets.Services) : 0;
  const invoiceCount = sheets.Invoices ? await importInvoices(sheets.Invoices) : 0;

  localStorage.setItem(CONNECTED_FLAG, "true");

  return {
    success: true,
    userCount,
    clientCount,
    serviceCount,
    invoiceCount
  };
};

export default connectExcelDatabase;
