# Payment Recording Feature

## Overview
The payment recording feature allows users to manually record payments received for invoices. Payments are tracked separately in a Payment entity and automatically update invoice statuses based on the total amount paid.

## Features Implemented

### 1. Payment Entity
- **Location**: `src/api/entities.js`, `src/api/customClient.js`
- **Fields**:
  - `invoice_id` - Reference to the invoice
  - `client_id` - Reference to the client
  - `amount` - Payment amount
  - `payment_date` - Date payment was received
  - `payment_method` - Method used (bank_transfer, cash, credit_card, debit_card, mobile_payment, check, other)
  - `reference_number` - Optional transaction/reference ID
  - `notes` - Additional notes about the payment
  - `created_date` - When the payment record was created

### 2. Payment Recording Dialog
- **Component**: `src/components/invoice/RecordPaymentModal.jsx`
- **Features**:
  - Amount input with validation (cannot exceed outstanding balance)
  - Payment date picker (defaults to today)
  - Payment method dropdown with 7 predefined options and icons:
    - Bank Transfer (Building2 icon)
    - Cash (Banknote icon)
    - Credit Card (CreditCard icon)
    - Debit Card (CreditCard icon)
    - Mobile Payment (Smartphone icon)
    - Check (DollarSign icon)
    - Other (DollarSign icon)
  - Reference number field for transaction IDs
  - Notes textarea for additional details
  - Real-time validation showing remaining balance
  - Loads existing payments to calculate outstanding amount

### 3. Payment History Display
- **Component**: `src/components/payments/PaymentHistory.jsx`
- **Features**:
  - List of all payments recorded for an invoice
  - Payment method badges with colored icons
  - Payment dates formatted as "MMM d, yyyy"
  - Payment amounts with currency formatting
  - Reference numbers display
  - Total paid calculation
  - Empty state when no payments exist
  - Hover effects for better UX

### 4. Invoice Status Auto-Update
- **Logic Location**: `src/components/invoice/InvoiceActions.jsx`, `src/pages/ViewInvoice.jsx`
- **Status Rules**:
  - `paid` - When total payments >= invoice total_amount
  - `partial_paid` - When total payments > 0 but < total_amount
  - Unchanged - When no payments exist

### 5. Integration Points

#### ViewInvoice Page (`src/pages/ViewInvoice.jsx`)
- Record Payment button in action bar (disabled for paid/cancelled invoices)
- PaymentHistory component showing all payments
- RecordPaymentModal for recording new payments
- Automatic payment data loading
- Real-time status updates after payment recording

#### InvoiceActions Component (`src/components/invoice/InvoiceActions.jsx`)
- "Record Payment" option in dropdown menu
- Payment recording from invoice list
- Automatic invoice status update
- Version history tracking for payment events

#### Invoices List (`src/pages/Invoices.jsx`)
- Loads all payments for all invoices
- Groups payments by invoice_id
- Passes payment data to list and grid views

#### Invoice List View (`src/components/invoice/InvoiceList.jsx`)
- New "Paid" column showing:
  - Total amount paid (green if > 0)
  - Remaining amount due (if partially paid)
  - Gray text if no payments
- Real-time payment totals display

#### Invoice Grid View (`src/components/invoice/InvoiceGrid.jsx`)
- Payment summary on each invoice card
- Shows "Paid: $X" in green if payments exist
- Shows "Due: $X" if remaining balance exists
- Falls back to creation date if no payments

## Payment Methods
The system supports 7 payment methods with corresponding icons:
1. **bank_transfer** - Bank Transfer
2. **cash** - Cash
3. **credit_card** - Credit Card
4. **debit_card** - Debit Card
5. **mobile_payment** - Mobile Payment (PayPal, Venmo, etc.)
6. **check** - Check
7. **other** - Other methods

## Usage Flow

### Recording a Payment
1. Open an invoice (ViewInvoice page or from Invoices list)
2. Click "Record Payment" button/menu item
3. Enter payment details:
   - Amount (validated against outstanding balance)
   - Payment date
   - Payment method (dropdown selection)
   - Optional reference number
   - Optional notes
4. Click "Record Payment"
5. Payment is saved to Payment entity
6. Invoice status automatically updates based on total paid
7. Payment appears in PaymentHistory
8. Invoice list updates to show payment totals

### Viewing Payment History
- On ViewInvoice page, scroll to "Payment History" section
- Shows all recorded payments with:
  - Payment method and icon
  - Payment amount
  - Payment date
  - Reference number (if provided)
  - Total paid summary

### Payment Totals on Lists
- **List View**: "Paid" column shows total paid and remaining
- **Grid View**: Invoice cards show "Paid: $X" and "Due: $X"
- Green highlighting for paid amounts
- Gray text for no payments

## Data Integrity

### Validation
- Payment amount must be > 0
- Payment amount cannot exceed outstanding balance
- Payment date is required
- Payment method is required (selected from dropdown)
- Outstanding balance calculated from existing Payment records

### Status Updates
- Status changes are atomic with payment creation
- Version history tracks payment events
- Failed payment creation doesn't update invoice status
- Multiple partial payments supported (status updates correctly)

### History Tracking
- Each payment event creates a history entry
- History includes:
  - Action: "payment_recorded"
  - Summary: "Payment recorded ($X.XX)"
  - Changes: payment record and status change
  - Metadata: amount and payment method

## Technical Implementation

### API Calls
```javascript
// Create payment
await Payment.create({
    invoice_id: invoice.id,
    client_id: invoice.client_id,
    amount: paymentData.amount,
    payment_date: paymentData.payment_date,
    payment_method: paymentData.payment_method,
    reference_number: paymentData.reference_number,
    notes: paymentData.notes,
    created_date: new Date().toISOString()
});

// Load payments for invoice
const payments = await Payment.filter({ invoice_id: invoice.id });

// Load all payments
const allPayments = await Payment.list();
```

### Status Calculation
```javascript
const allPayments = await Payment.filter({ invoice_id: invoice.id });
const totalPaid = allPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

let newStatus = invoice.status;
if (totalPaid >= invoice.total_amount) {
    newStatus = 'paid';
} else if (totalPaid > 0) {
    newStatus = 'partial_paid';
}
```

## UI Components

### RecordPaymentModal Props
```javascript
{
    invoice: object,      // Invoice object
    isOpen: boolean,      // Dialog visibility
    onClose: function,    // Close handler
    onSave: function      // Save handler (receives paymentData)
}
```

### PaymentHistory Props
```javascript
{
    payments: array,      // Array of payment objects
    currency: string      // Currency code (e.g., 'USD', 'ZAR')
}
```

## Future Enhancements
Potential improvements for future development:
- Payment editing/deletion functionality
- Payment receipt generation (PDF)
- Payment reminders for partial payments
- Payment method statistics/reports
- Bulk payment recording
- Payment import from bank statements
- Payment reconciliation tools
- Refund recording
- Payment schedule/installments
- Integration with payment gateways (Stripe, PayPal, etc.)

## Testing Checklist
- [ ] Record payment with all required fields
- [ ] Validate amount exceeding outstanding balance is rejected
- [ ] Verify status updates to 'partial_paid' for partial payment
- [ ] Verify status updates to 'paid' when fully paid
- [ ] Check PaymentHistory displays correctly
- [ ] Verify payment totals on invoice list
- [ ] Test multiple partial payments
- [ ] Verify payment methods display correct icons
- [ ] Test payment recording from ViewInvoice
- [ ] Test payment recording from Invoices list (dropdown)
- [ ] Verify version history tracking
- [ ] Test with different currencies
- [ ] Verify disabled state for paid/cancelled invoices
