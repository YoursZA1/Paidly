// Excel utility functions for data import/export
import * as XLSX from 'xlsx';

// Generate UUID
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Export data to Excel (single sheet)
export const exportToExcel = (data, filename = 'export.xlsx', sheetName = 'Sheet1') => {
  try {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    
    // Auto-size columns
    const max_width = data.reduce((w, r) => Math.max(w, JSON.stringify(r).length), 10);
    worksheet['!cols'] = [{ wch: max_width }];
    
    XLSX.writeFile(workbook, filename);
    return { success: true, message: 'File exported successfully' };
  } catch (error) {
    console.error('Error exporting to Excel:', error);
    return { success: false, message: error.message };
  }
};

// Export multiple sheets to one Excel file with data validation
export const exportMultipleSheets = (sheets, filename = 'invoicebreek_data.xlsx') => {
  try {
    const workbook = XLSX.utils.book_new();

    sheets.forEach(({ data, sheetName, validations }) => {
      const worksheet = XLSX.utils.json_to_sheet(data);
      
      // Auto-size columns
      const maxWidth = data.length > 0 ? Object.keys(data[0]).length : 10;
      worksheet['!cols'] = Array(maxWidth).fill({ wch: 20 });
      
      // Apply data validations if provided
      if (validations && validations.length > 0) {
        worksheet['!dataValidation'] = validations;
      }
      
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    });

    XLSX.writeFile(workbook, filename);
    return { success: true, filename };
  } catch (error) {
    console.error('Error exporting multiple sheets:', error);
    return { success: false, message: error.message };
  }
};

// Import data from Excel (supports multiple sheets)
export const importFromExcel = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Read all sheets
        const sheets = {};
        workbook.SheetNames.forEach(sheetName => {
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);
          sheets[sheetName] = jsonData;
        });

        resolve({
          success: true,
          sheets: sheets,
          sheetNames: workbook.SheetNames,
          totalSheets: workbook.SheetNames.length
        });
      } catch (error) {
        reject({
          success: false,
          message: 'Failed to parse Excel file: ' + error.message
        });
      }
    };
    
    reader.onerror = () => {
      reject({
        success: false,
        message: 'Failed to read file'
      });
    };
    
    reader.readAsArrayBuffer(file);
  });
};

// Import data from an ArrayBuffer (supports multiple sheets)
export const importFromExcelArrayBuffer = (arrayBuffer) => {
  try {
    const data = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(data, { type: 'array' });

    const sheets = {};
    workbook.SheetNames.forEach(sheetName => {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      sheets[sheetName] = jsonData;
    });

    return {
      success: true,
      sheets,
      sheetNames: workbook.SheetNames,
      totalSheets: workbook.SheetNames.length
    };
  } catch (error) {
    return {
      success: false,
      message: 'Failed to parse Excel file: ' + error.message
    };
  }
};

// Import data from an Excel file URL
export const importFromExcelUrl = async (url) => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return {
        success: false,
        message: `Failed to fetch Excel file (${response.status})`
      };
    }
    const arrayBuffer = await response.arrayBuffer();
    return importFromExcelArrayBuffer(arrayBuffer);
  } catch (error) {
    return {
      success: false,
      message: 'Failed to load Excel file: ' + error.message
    };
  }
};

// Generate complete InvoiceBreek data template (all sheets in one file)
export const generateInvoiceBreekTemplate = () => {
  const userTemplate = [
    {
      'id': generateUUID(),
      'email': 'admin@example.com',
      'full_name': 'Admin User',
      'role': 'admin',
      'status': 'active',
      'plan': 'enterprise',
      'created_at': new Date().toISOString(),
      'last_login': new Date().toISOString()
    },
    {
      'id': generateUUID(),
      'email': 'user@example.com',
      'full_name': 'Regular User',
      'role': 'user',
      'status': 'active',
      'plan': 'professional',
      'created_at': new Date().toISOString(),
      'last_login': new Date().toISOString()
    }
  ];

  const invoiceTemplate = [
    {
      'id': generateUUID(),
      'invoice_number': 'INV-001',
      'user_id': userTemplate[0].id, // References Users sheet
      'client_id': clientTemplate[0].id, // References Clients sheet
      'status': 'draft',
      'subtotal': 4000.00,
      'tax': 400.00,
      'discount': 0.00,
      'total': 4400.00,
      'currency': 'USD',
      'issue_date': '2026-02-01',
      'due_date': '2026-03-01',
      'created_at': new Date().toISOString()
    },
    {
      'id': generateUUID(),
      'invoice_number': 'INV-002',
      'user_id': userTemplate[1].id, // References Users sheet
      'client_id': clientTemplate[1].id, // References Clients sheet
      'status': 'sent',
      'subtotal': 2500.00,
      'tax': 250.00,
      'discount': 100.00,
      'total': 2650.00,
      'currency': 'USD',
      'issue_date': '2026-02-02',
      'due_date': '2026-03-02',
      'created_at': new Date().toISOString()
    }
  ];

  const clientTemplate = [
    {
      'id': generateUUID(),
      'user_id': userTemplate[0].id, // References Users sheet
      'client_name': 'Acme Corporation',
      'email': 'contact@acme.com',
      'phone': '+1234567890',
      'company': 'Acme Corp',
      'billing_address': '123 Business St, City, State 12345',
      'created_at': new Date().toISOString()
    },
    {
      'id': generateUUID(),
      'user_id': userTemplate[1].id, // References Users sheet
      'client_name': 'Beta Industries',
      'email': 'info@betaindustries.com',
      'phone': '+9876543210',
      'company': 'Beta Industries Inc.',
      'billing_address': '456 Commerce Ave, Business City, BC 67890',
      'created_at': new Date().toISOString()
    }
  ];

  const serviceTemplate = [
    {
      'Service Name': 'Web Development',
      'Description': 'Full-stack web development services',
      'Default Price': 100,
      'Unit': 'hour',
      'Tax Rate (%)': 10,
      'Category': 'Development'
    }
  ];

  const invoiceItemsTemplate = [
    {
      'id': generateUUID(),
      'invoice_id': invoiceTemplate[0].id, // References Invoices sheet
      'description': 'Frontend Development - React Components',
      'quantity': 20,
      'rate': 100.00,
      'line_total': 2000.00
    },
    {
      'id': generateUUID(),
      'invoice_id': invoiceTemplate[0].id, // References Invoices sheet
      'description': 'Backend Development - API Integration',
      'quantity': 20,
      'rate': 100.00,
      'line_total': 2000.00
    },
    {
      'id': generateUUID(),
      'invoice_id': invoiceTemplate[1].id, // References Invoices sheet
      'description': 'UI/UX Design Services',
      'quantity': 25,
      'rate': 100.00,
      'line_total': 2500.00
    }
  ];

  const paymentsTemplate = [
    {
      'id': generateUUID(),
      'invoice_id': invoiceTemplate[0].id, // References Invoices sheet
      'amount': 4400.00,
      'payment_method': 'Bank Transfer',
      'payment_date': '2026-02-15',
      'notes': 'Full payment received'
    },
    {
      'id': generateUUID(),
      'invoice_id': invoiceTemplate[1].id, // References Invoices sheet
      'amount': 1325.00,
      'payment_method': 'Credit Card',
      'payment_date': '2026-02-10',
      'notes': 'Partial payment - 50% deposit'
    }
  ];

  const logsTemplate = [
    {
      'id': generateUUID(),
      'user_id': userTemplate[0].id, // References Users sheet
      'action': 'INVOICE_CREATED',
      'entity': 'Invoice',
      'entity_id': invoiceTemplate[0].id,
      'description': 'Created invoice INV-001 for Acme Corporation',
      'created_at': new Date().toISOString()
    },
    {
      'id': generateUUID(),
      'user_id': userTemplate[0].id, // References Users sheet
      'action': 'PAYMENT_RECORDED',
      'entity': 'Payment',
      'entity_id': paymentsTemplate[0].id,
      'description': 'Recorded payment of $4400.00 for invoice INV-001',
      'created_at': new Date().toISOString()
    },
    {
      'id': generateUUID(),
      'user_id': userTemplate[1].id, // References Users sheet
      'action': 'STATUS_UPDATED',
      'entity': 'Invoice',
      'entity_id': invoiceTemplate[1].id,
      'description': 'Updated invoice INV-002 status to sent',
      'created_at': new Date().toISOString()
    }
  ];

  // Define validation rules for each sheet
  const usersValidations = [
    { sqref: 'D3:D1000', type: 'list', formula1: '"admin,user"', showDropDown: false },
    { sqref: 'E3:E1000', type: 'list', formula1: '"active,suspended"', showDropDown: false },
    { sqref: 'F3:F1000', type: 'list', formula1: '"free,starter,professional,enterprise"', showDropDown: false },
    { sqref: 'G3:G1000', type: 'date', operator: 'greaterThan', formula1: '1900-01-01' },
    { sqref: 'H3:H1000', type: 'date', operator: 'greaterThan', formula1: '1900-01-01' }
  ];

  const invoicesValidations = [
    { sqref: 'E3:E1000', type: 'list', formula1: '"draft,sent,paid,overdue,cancelled"', showDropDown: false },
    { sqref: 'F3:F1000', type: 'decimal', operator: 'greaterThanOrEqual', formula1: '0' },
    { sqref: 'G3:G1000', type: 'decimal', operator: 'greaterThanOrEqual', formula1: '0' },
    { sqref: 'H3:H1000', type: 'decimal', operator: 'greaterThanOrEqual', formula1: '0' },
    { sqref: 'I3:I1000', type: 'decimal', operator: 'greaterThanOrEqual', formula1: '0' },
    { sqref: 'K3:K1000', type: 'date', operator: 'greaterThan', formula1: '1900-01-01' },
    { sqref: 'L3:L1000', type: 'date', operator: 'greaterThan', formula1: '1900-01-01' },
    { sqref: 'M3:M1000', type: 'date', operator: 'greaterThan', formula1: '1900-01-01' }
  ];

  const invoiceItemsValidations = [
    { sqref: 'D3:D1000', type: 'decimal', operator: 'greaterThan', formula1: '0' },
    { sqref: 'E3:E1000', type: 'decimal', operator: 'greaterThanOrEqual', formula1: '0' },
    { sqref: 'F3:F1000', type: 'decimal', operator: 'greaterThanOrEqual', formula1: '0' }
  ];

  const paymentsValidations = [
    { sqref: 'C3:C1000', type: 'decimal', operator: 'greaterThan', formula1: '0' },
    { sqref: 'E3:E1000', type: 'date', operator: 'greaterThan', formula1: '1900-01-01' }
  ];

  const clientsValidations = [
    { sqref: 'H3:H1000', type: 'date', operator: 'greaterThan', formula1: '1900-01-01' }
  ];

  const logsValidations = [
    { sqref: 'G3:G1000', type: 'date', operator: 'greaterThan', formula1: '1900-01-01' }
  ];

  const sheets = [
    { data: userTemplate, sheetName: 'Users', validations: usersValidations },
    { data: clientTemplate, sheetName: 'Clients', validations: clientsValidations },
    { data: invoiceTemplate, sheetName: 'Invoices', validations: invoicesValidations },
    { data: invoiceItemsTemplate, sheetName: 'InvoiceItems', validations: invoiceItemsValidations },
    { data: paymentsTemplate, sheetName: 'Payments', validations: paymentsValidations },
    { data: logsTemplate, sheetName: 'Logs', validations: logsValidations },
    { data: serviceTemplate, sheetName: 'Services' }
  ];

  return exportMultipleSheets(sheets, 'invoicebreek_data.xlsx');
};

// Validate Users data
export const validateUsersData = (data) => {
  const errors = [];
  const warnings = [];
  const emails = new Set();
  const ids = new Set();

  data.forEach((row, index) => {
    const rowNum = index + 2; // Excel rows start at 1, header is row 1

    // Validate required fields
    if (!row.id || row.id.toString().trim() === '') {
      errors.push(`Row ${rowNum}: Missing id (UUID required)`);
    } else {
      // Check for duplicate IDs
      if (ids.has(row.id)) {
        errors.push(`Row ${rowNum}: Duplicate id "${row.id}"`);
      }
      ids.add(row.id);
      
      // Validate UUID format (basic check)
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidPattern.test(row.id)) {
        warnings.push(`Row ${rowNum}: id "${row.id}" is not a valid UUID format`);
      }
    }

    if (!row.email || row.email.toString().trim() === '') {
      errors.push(`Row ${rowNum}: Missing email`);
    } else {
      // Check for duplicate emails (NO DUPLICATE EMAILS RULE)
      if (emails.has(row.email.toLowerCase())) {
        errors.push(`Row ${rowNum}: Duplicate email "${row.email}" - No duplicate emails allowed`);
      }
      emails.add(row.email.toLowerCase());

      // Validate email format
      if (!isValidEmail(row.email)) {
        errors.push(`Row ${rowNum}: Invalid email format "${row.email}"`);
      }
    }

    if (!row.full_name || row.full_name.toString().trim() === '') {
      errors.push(`Row ${rowNum}: Missing full_name`);
    }

    // Validate role
    const validRoles = ['admin', 'user'];
    if (!row.role || !validRoles.includes(row.role.toLowerCase())) {
      errors.push(`Row ${rowNum}: Invalid role "${row.role}" (must be: admin or user)`);
    }

    // Validate status
    const validStatuses = ['active', 'suspended'];
    if (!row.status || !validStatuses.includes(row.status.toLowerCase())) {
      errors.push(`Row ${rowNum}: Invalid status "${row.status}" (must be: active or suspended)`);
    }

    if (!row.plan || row.plan.toString().trim() === '') {
      warnings.push(`Row ${rowNum}: Missing plan`);
    }

    // Validate dates
    if (row.created_at && !isValidDate(row.created_at)) {
      errors.push(`Row ${rowNum}: Invalid created_at date format`);
    }

    if (row.last_login && !isValidDate(row.last_login)) {
      errors.push(`Row ${rowNum}: Invalid last_login date format`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    totalRows: data.length
  };
};

// Validate invoice data
export const validateInvoiceData = (data, usersData = [], clientsData = []) => {
  const errors = [];
  const warnings = [];
  const ids = new Set();
  const invoiceNumbers = new Set();
  
  // Extract valid user and client IDs for reference checking
  const validUserIds = new Set(usersData.map(user => user.id));
  const validClientIds = new Set(clientsData.map(client => client.id));

  data.forEach((row, index) => {
    const rowNum = index + 2;

    // Validate ID (UUID format)
    if (!row.id || row.id.toString().trim() === '') {
      errors.push(`Row ${rowNum}: Missing id`);
    } else {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(row.id.toString())) {
        errors.push(`Row ${rowNum}: Invalid id format (must be UUID)`);
      } else if (ids.has(row.id.toString())) {
        errors.push(`Row ${rowNum}: Duplicate id "${row.id}"`);
      } else {
        ids.add(row.id.toString());
      }
    }

    // Validate invoice_number
    if (!row.invoice_number || row.invoice_number.toString().trim() === '') {
      errors.push(`Row ${rowNum}: Missing invoice_number`);
    } else {
      const invNum = row.invoice_number.toString();
      if (invoiceNumbers.has(invNum)) {
        errors.push(`Row ${rowNum}: Duplicate invoice_number "${invNum}"`);
      } else {
        invoiceNumbers.add(invNum);
      }
    }

    // Validate user_id (must exist in Users sheet)
    if (!row.user_id || row.user_id.toString().trim() === '') {
      errors.push(`Row ${rowNum}: Missing user_id`);
    } else if (usersData.length > 0 && !validUserIds.has(row.user_id.toString())) {
      errors.push(`Row ${rowNum}: user_id "${row.user_id}" does not exist in Users sheet`);
    }

    // Validate client_id (must exist in Clients sheet)
    if (!row.client_id || row.client_id.toString().trim() === '') {
      errors.push(`Row ${rowNum}: Missing client_id`);
    } else if (clientsData.length > 0 && !validClientIds.has(row.client_id.toString())) {
      errors.push(`Row ${rowNum}: client_id "${row.client_id}" does not exist in Clients sheet`);
    }

    // Validate status (strict enum)
    const validStatuses = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];
    if (!row.status || row.status.toString().trim() === '') {
      errors.push(`Row ${rowNum}: Missing status`);
    } else if (!validStatuses.includes(row.status.toString().toLowerCase())) {
      errors.push(`Row ${rowNum}: Invalid status "${row.status}" (must be: draft, sent, paid, overdue, or cancelled)`);
    }

    // Validate numeric fields
    if (row.subtotal === undefined || row.subtotal === null || row.subtotal.toString().trim() === '') {
      errors.push(`Row ${rowNum}: Missing subtotal`);
    } else if (isNaN(row.subtotal)) {
      errors.push(`Row ${rowNum}: subtotal must be a number`);
    }

    if (row.tax === undefined || row.tax === null || row.tax.toString().trim() === '') {
      errors.push(`Row ${rowNum}: Missing tax`);
    } else if (isNaN(row.tax)) {
      errors.push(`Row ${rowNum}: tax must be a number`);
    }

    if (row.discount === undefined || row.discount === null || row.discount.toString().trim() === '') {
      warnings.push(`Row ${rowNum}: Missing discount (defaulting to 0)`);
    } else if (isNaN(row.discount)) {
      errors.push(`Row ${rowNum}: discount must be a number`);
    }

    if (row.total === undefined || row.total === null || row.total.toString().trim() === '') {
      errors.push(`Row ${rowNum}: Missing total`);
    } else if (isNaN(row.total)) {
      errors.push(`Row ${rowNum}: total must be a number`);
    }

    // Validate currency
    if (!row.currency || row.currency.toString().trim() === '') {
      warnings.push(`Row ${rowNum}: Missing currency`);
    }

    // Validate dates
    if (!row.issue_date || row.issue_date.toString().trim() === '') {
      errors.push(`Row ${rowNum}: Missing issue_date`);
    } else if (!isValidDate(row.issue_date)) {
      errors.push(`Row ${rowNum}: Invalid issue_date format`);
    }

    if (!row.due_date || row.due_date.toString().trim() === '') {
      errors.push(`Row ${rowNum}: Missing due_date`);
    } else if (!isValidDate(row.due_date)) {
      errors.push(`Row ${rowNum}: Invalid due_date format`);
    }

    if (!row.created_at || row.created_at.toString().trim() === '') {
      warnings.push(`Row ${rowNum}: Missing created_at`);
    } else if (!isValidDate(row.created_at)) {
      errors.push(`Row ${rowNum}: Invalid created_at format`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    totalRows: data.length
  };
};

// Validate client data
export const validateClientData = (data, usersData = []) => {
  const errors = [];
  const warnings = [];
  const ids = new Set();
  const emails = new Set();
  
  // Extract valid user IDs for reference checking
  const validUserIds = new Set(usersData.map(user => user.id));

  data.forEach((row, index) => {
    const rowNum = index + 2;

    // Validate ID (UUID format)
    if (!row.id || row.id.toString().trim() === '') {
      errors.push(`Row ${rowNum}: Missing id`);
    } else {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(row.id.toString())) {
        errors.push(`Row ${rowNum}: Invalid id format (must be UUID)`);
      } else if (ids.has(row.id.toString())) {
        errors.push(`Row ${rowNum}: Duplicate id "${row.id}"`);
      } else {
        ids.add(row.id.toString());
      }
    }

    // Validate user_id (must exist in Users sheet)
    if (!row.user_id || row.user_id.toString().trim() === '') {
      errors.push(`Row ${rowNum}: Missing user_id`);
    } else if (usersData.length > 0 && !validUserIds.has(row.user_id.toString())) {
      errors.push(`Row ${rowNum}: user_id "${row.user_id}" does not exist in Users sheet`);
    }

    // Validate client_name
    if (!row.client_name || row.client_name.toString().trim() === '') {
      errors.push(`Row ${rowNum}: Missing client_name`);
    }

    // Validate email
    if (!row.email || row.email.toString().trim() === '') {
      errors.push(`Row ${rowNum}: Missing email`);
    } else if (!isValidEmail(row.email)) {
      errors.push(`Row ${rowNum}: Invalid email format`);
    } else {
      const emailLower = row.email.toString().toLowerCase();
      if (emails.has(emailLower)) {
        warnings.push(`Row ${rowNum}: Duplicate email "${row.email}"`);
      } else {
        emails.add(emailLower);
      }
    }

    // Validate phone
    if (!row.phone || row.phone.toString().trim() === '') {
      warnings.push(`Row ${rowNum}: Missing phone`);
    }

    // Validate company
    if (!row.company || row.company.toString().trim() === '') {
      warnings.push(`Row ${rowNum}: Missing company`);
    }

    // Validate billing_address
    if (!row.billing_address || row.billing_address.toString().trim() === '') {
      warnings.push(`Row ${rowNum}: Missing billing_address`);
    }

    // Validate created_at
    if (!row.created_at || row.created_at.toString().trim() === '') {
      warnings.push(`Row ${rowNum}: Missing created_at`);
    } else if (!isValidDate(row.created_at)) {
      errors.push(`Row ${rowNum}: Invalid created_at date format`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    totalRows: data.length
  };
};

// Validate service data
export const validateServiceData = (data) => {
  const errors = [];
  const warnings = [];

  data.forEach((row, index) => {
    const rowNum = index + 2;

    if (!row['Service Name']) {
      errors.push(`Row ${rowNum}: Missing Service Name`);
    }

    if (row['Default Price'] && isNaN(row['Default Price'])) {
      errors.push(`Row ${rowNum}: Default Price must be a number`);
    }

    if (row['Tax Rate (%)'] && isNaN(row['Tax Rate (%)'])) {
      errors.push(`Row ${rowNum}: Tax Rate must be a number`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    totalRows: data.length
  };
};

// Validate invoice items data
export const validateInvoiceItemsData = (data, invoicesData = []) => {
  const errors = [];
  const warnings = [];
  const ids = new Set();
  
  // Extract valid invoice IDs for reference checking
  const validInvoiceIds = new Set(invoicesData.map(invoice => invoice.id));

  data.forEach((row, index) => {
    const rowNum = index + 2;

    // Validate ID (UUID format)
    if (!row.id || row.id.toString().trim() === '') {
      errors.push(`Row ${rowNum}: Missing id`);
    } else {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(row.id.toString())) {
        errors.push(`Row ${rowNum}: Invalid id format (must be UUID)`);
      } else if (ids.has(row.id.toString())) {
        errors.push(`Row ${rowNum}: Duplicate id "${row.id}"`);
      } else {
        ids.add(row.id.toString());
      }
    }

    // Validate invoice_id (must exist in Invoices sheet)
    if (!row.invoice_id || row.invoice_id.toString().trim() === '') {
      errors.push(`Row ${rowNum}: Missing invoice_id`);
    } else if (invoicesData.length > 0 && !validInvoiceIds.has(row.invoice_id.toString())) {
      errors.push(`Row ${rowNum}: invoice_id "${row.invoice_id}" does not exist in Invoices sheet`);
    }

    // Validate description
    if (!row.description || row.description.toString().trim() === '') {
      errors.push(`Row ${rowNum}: Missing description`);
    }

    // Validate quantity
    if (row.quantity === undefined || row.quantity === null || row.quantity.toString().trim() === '') {
      errors.push(`Row ${rowNum}: Missing quantity`);
    } else if (isNaN(row.quantity)) {
      errors.push(`Row ${rowNum}: quantity must be a number`);
    } else if (Number(row.quantity) <= 0) {
      errors.push(`Row ${rowNum}: quantity must be greater than 0`);
    }

    // Validate rate
    if (row.rate === undefined || row.rate === null || row.rate.toString().trim() === '') {
      errors.push(`Row ${rowNum}: Missing rate`);
    } else if (isNaN(row.rate)) {
      errors.push(`Row ${rowNum}: rate must be a number`);
    } else if (Number(row.rate) < 0) {
      errors.push(`Row ${rowNum}: rate cannot be negative`);
    }

    // Validate line_total
    if (row.line_total === undefined || row.line_total === null || row.line_total.toString().trim() === '') {
      errors.push(`Row ${rowNum}: Missing line_total`);
    } else if (isNaN(row.line_total)) {
      errors.push(`Row ${rowNum}: line_total must be a number`);
    }

    // Optional: Verify line_total calculation
    if (!isNaN(row.quantity) && !isNaN(row.rate) && !isNaN(row.line_total)) {
      const expectedTotal = Number(row.quantity) * Number(row.rate);
      const actualTotal = Number(row.line_total);
      if (Math.abs(expectedTotal - actualTotal) > 0.01) {
        warnings.push(`Row ${rowNum}: line_total (${actualTotal}) doesn't match quantity × rate (${expectedTotal})`);
      }
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    totalRows: data.length
  };
};

// Validate payments data
export const validatePaymentsData = (data, invoicesData = []) => {
  const errors = [];
  const warnings = [];
  const ids = new Set();
  
  // Extract valid invoice IDs for reference checking
  const validInvoiceIds = new Set(invoicesData.map(invoice => invoice.id));

  data.forEach((row, index) => {
    const rowNum = index + 2;

    // Validate ID (UUID format)
    if (!row.id || row.id.toString().trim() === '') {
      errors.push(`Row ${rowNum}: Missing id`);
    } else {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(row.id.toString())) {
        errors.push(`Row ${rowNum}: Invalid id format (must be UUID)`);
      } else if (ids.has(row.id.toString())) {
        errors.push(`Row ${rowNum}: Duplicate id "${row.id}"`);
      } else {
        ids.add(row.id.toString());
      }
    }

    // Validate invoice_id (must exist in Invoices sheet)
    if (!row.invoice_id || row.invoice_id.toString().trim() === '') {
      errors.push(`Row ${rowNum}: Missing invoice_id`);
    } else if (invoicesData.length > 0 && !validInvoiceIds.has(row.invoice_id.toString())) {
      errors.push(`Row ${rowNum}: invoice_id "${row.invoice_id}" does not exist in Invoices sheet`);
    }

    // Validate amount
    if (row.amount === undefined || row.amount === null || row.amount.toString().trim() === '') {
      errors.push(`Row ${rowNum}: Missing amount`);
    } else if (isNaN(row.amount)) {
      errors.push(`Row ${rowNum}: amount must be a number`);
    } else if (Number(row.amount) <= 0) {
      errors.push(`Row ${rowNum}: amount must be greater than 0`);
    }

    // Validate payment_method
    if (!row.payment_method || row.payment_method.toString().trim() === '') {
      errors.push(`Row ${rowNum}: Missing payment_method`);
    }

    // Validate payment_date
    if (!row.payment_date || row.payment_date.toString().trim() === '') {
      errors.push(`Row ${rowNum}: Missing payment_date`);
    } else if (!isValidDate(row.payment_date)) {
      errors.push(`Row ${rowNum}: Invalid payment_date format`);
    }

    // Notes are optional, no validation needed
    if (!row.notes || row.notes.toString().trim() === '') {
      warnings.push(`Row ${rowNum}: Missing notes (optional field)`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    totalRows: data.length
  };
};

// Validate logs data
export const validateLogsData = (data, usersData = []) => {
  const errors = [];
  const warnings = [];
  const ids = new Set();
  
  // Extract valid user IDs for reference checking
  const validUserIds = new Set(usersData.map(user => user.id));

  data.forEach((row, index) => {
    const rowNum = index + 2;

    // Validate ID (UUID format)
    if (!row.id || row.id.toString().trim() === '') {
      errors.push(`Row ${rowNum}: Missing id`);
    } else {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(row.id.toString())) {
        errors.push(`Row ${rowNum}: Invalid id format (must be UUID)`);
      } else if (ids.has(row.id.toString())) {
        errors.push(`Row ${rowNum}: Duplicate id "${row.id}"`);
      } else {
        ids.add(row.id.toString());
      }
    }

    // Validate user_id (must exist in Users sheet)
    if (!row.user_id || row.user_id.toString().trim() === '') {
      errors.push(`Row ${rowNum}: Missing user_id`);
    } else if (usersData.length > 0 && !validUserIds.has(row.user_id.toString())) {
      errors.push(`Row ${rowNum}: user_id "${row.user_id}" does not exist in Users sheet`);
    }

    // Validate action
    if (!row.action || row.action.toString().trim() === '') {
      errors.push(`Row ${rowNum}: Missing action`);
    } else {
      // Optional: Check for common action patterns (uppercase with underscores)
      const actionPattern = /^[A-Z_]+$/;
      if (!actionPattern.test(row.action.toString())) {
        warnings.push(`Row ${rowNum}: action "${row.action}" should be uppercase with underscores (e.g., INVOICE_CREATED)`);
      }
    }

    // Validate entity
    if (!row.entity || row.entity.toString().trim() === '') {
      errors.push(`Row ${rowNum}: Missing entity`);
    }

    // Validate entity_id
    if (!row.entity_id || row.entity_id.toString().trim() === '') {
      errors.push(`Row ${rowNum}: Missing entity_id`);
    }

    // Validate description
    if (!row.description || row.description.toString().trim() === '') {
      warnings.push(`Row ${rowNum}: Missing description (recommended for audit trail)`);
    }

    // Validate created_at
    if (!row.created_at || row.created_at.toString().trim() === '') {
      errors.push(`Row ${rowNum}: Missing created_at`);
    } else if (!isValidDate(row.created_at)) {
      errors.push(`Row ${rowNum}: Invalid created_at format`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    totalRows: data.length
  };
};

// Export all InvoiceBreek data to one file with multiple sheets
export const exportAllData = async (users, invoices, clients, services) => {
  const usersData = users.map(user => ({
    'id': user.id || generateUUID(),
    'email': user.email,
    'full_name': user.full_name || user.name || '',
    'role': user.role || 'user',
    'status': user.status || 'active',
    'plan': user.plan || 'free',
    'created_at': user.created_at || new Date().toISOString(),
    'last_login': user.last_login || new Date().toISOString()
  }));

  const invoicesData = invoices.map(invoice => {
    const client = clients.find(c => c.id === invoice.client_id);
    
    return {
      'Invoice Number': invoice.invoice_number,
      'Project Title': invoice.project_title,
      'Project Description': invoice.project_description || '',
      'Invoice Date': invoice.invoice_date,
      'Due Date': invoice.delivery_date,
      'Client Name': client?.name || 'Unknown',
      'Item Description': invoice.items?.[0]?.description || invoice.project_title,
      'Quantity': invoice.items?.[0]?.quantity || 1,
      'Unit Price': invoice.items?.[0]?.price || invoice.total_amount,
      'Subtotal': invoice.subtotal || invoice.total_amount,
      'Tax Rate (%)': invoice.tax_rate || 0,
      'Tax Amount': invoice.tax_amount || 0,
      'Total Amount': invoice.total_amount,
      'Status': invoice.status,
      'Notes': invoice.notes || ''
    };
  });

  const clientsData = clients.map(client => ({
    'Client Name': client.name,
    'Email': client.email || '',
    'Phone': client.phone || '',
    'Address': client.address || '',
    'Tax Number': client.tax_number || '',
    'Contact Person': client.contact_person || '',
    'Notes': client.notes || ''
  }));

  const servicesData = services.map(service => ({
    'Service Name': service.name,
    'Description': service.description || '',
    'Default Price': service.default_price || 0,
    'Unit': service.unit || 'hour',
    'Tax Rate (%)': service.tax_rate || 0,
    'Category': service.category || 'General'
  }));

  const sheets = [
    { data: usersData.length > 0 ? usersData : [{ id: '', email: '', full_name: '', role: '', status: '', plan: '', created_at: '', last_login: '' }], sheetName: 'Users' },
    { data: invoicesData.length > 0 ? invoicesData : [{ 'Invoice Number': '', 'Project Title': '', 'Client Name': '', 'Total Amount': 0, 'Status': '' }], sheetName: 'Invoices' },
    { data: clientsData.length > 0 ? clientsData : [{ 'Client Name': '', Email: '', Phone: '' }], sheetName: 'Clients' },
    { data: servicesData.length > 0 ? servicesData : [{ 'Service Name': '', 'Default Price': 0 }], sheetName: 'Services' }
  ];

  return exportMultipleSheets(sheets, 'invoicebreek_data.xlsx');
};

// Helper functions
const isValidDate = (dateString) => {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
};

const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};
