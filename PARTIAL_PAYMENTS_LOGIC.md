# Partial Payments Logic

## Overview
The partial payments system allows invoices to be paid in multiple installments over time. This feature includes payment schedules, progress tracking, smart payment suggestions, and automatic status management.

## Features

### 1. Payment Schedule Component
**Location**: `src/components/payments/PaymentSchedule.jsx`

Displays and manages payment installments for an invoice with:
- **Visual Progress Bar**: Shows percentage paid with color-coded indicators
  - Green (100%): Fully paid
  - Blue (50-99%): Partial payment in progress
  - Yellow (0-49%): Minimal payment made
- **Installment Tracking**: Each installment shows:
  - Due date
  - Amount
  - Status (Paid, Overdue, Due Today, Partial, Pending)
  - Associated payments
- **Summary Statistics**:
  - Total installments
  - Paid installments
  - Overdue installments
  - Pending installments
- **Quick Actions**: Record payment buttons on unpaid installments

#### Status Badges
- **Paid** (Green): Full installment amount received
- **Overdue** (Red): Past due date and not fully paid
- **Due Today** (Orange): Due date is today
- **Partial** (Yellow): Some payment received but not full amount
- **Pending** (Gray): No payment received, not yet due

### 2. Payment Schedule Dialog
**Location**: `src/components/payments/PaymentScheduleDialog.jsx`

Create custom payment schedules with:

#### Quick Templates
1. **2 Payments**: Split 50/50 over 2 months
2. **3 Payments**: Split 33/33/34 over 3 months
3. **4 Payments**: Split 25% each over 4 months
4. **4 Weekly**: Split 25% each over 4 weeks
5. **Deposit + Balance**: 30% deposit, 70% balance after 1 month

#### Custom Schedule Builder
- Add/remove installments dynamically
- Set custom amounts and due dates
- Add descriptions for each installment
- Real-time validation ensures total equals invoice amount
- Visual summary shows total scheduled vs invoice total

#### Validation Rules
- All installments must have amount and due date
- Total scheduled amount must equal invoice total (within $0.01)
- Cannot save schedule with mismatched totals

### 3. Enhanced Payment Recording Modal
**Location**: `src/components/invoice/RecordPaymentModal.jsx`

Improved with partial payment support:

#### Smart Payment Suggestions
Automatically suggests common payment amounts:
- **Full Balance**: Pay remaining amount completely
- **50% of Balance**: Half of remaining balance
- **25% of Balance**: Quarter of remaining balance
- **10% of Balance**: Ten percent of remaining balance

#### Enhanced Progress Display
- **Invoice Total**: Full invoice amount
- **Remaining Balance**: Amount still owed
- **Already Paid**: Total of previous payments
- **Progress Bar**: Visual representation of payment completion
- **Percentage Complete**: Exact percentage paid

#### Partial Payment Warnings
- Real-time warning when entering partial amount
- Shows remaining balance after current payment
- Prevents overpayment (amount cannot exceed remaining)
- Color-coded indicators (orange for partial, green for full)

### 4. Partial Payment Indicator
**Location**: `src/components/payments/PartialPaymentIndicator.jsx`

Visual component showing payment progress on invoice lists:

#### Compact Mode (for tables)
- Mini progress bar (12px wide)
- Percentage complete
- Color-coded by progress

#### Default Mode (for cards/details)
- Full progress bar with percentage
- "Paid" amount in green
- "Due" amount in orange
- "Partial Payment" badge if incomplete

### 5. ViewInvoice Integration
**Location**: `src/pages/ViewInvoice.jsx`

Complete partial payment support:
- Payment schedule display (if created)
- "Add Schedule" button (if no schedule exists)
- Payment history with all installments
- Record payment for specific installments
- Auto-save schedule to invoice entity

## Payment Status Logic

### Automatic Status Updates
When recording a payment, the system automatically updates invoice status:

```javascript
const totalPaid = allPayments.reduce((sum, p) => sum + p.amount, 0);

if (totalPaid >= invoice.total_amount) {
    status = 'paid';           // Fully paid
} else if (totalPaid > 0) {
    status = 'partial_paid';   // Some payment received
} else {
    status = unchanged;         // No payments yet
}
```

### Status Transitions
- **draft/sent/viewed** → **partial_paid**: First payment recorded
- **partial_paid** → **paid**: Final payment completes total
- **paid**: Cannot be changed (edit disabled)

## Data Model

### Invoice Entity Updates
Added `payment_schedule` field:
```javascript
{
    payment_schedule: [
        {
            amount: 500.00,
            due_date: "2026-03-01",
            description: "First installment (50%)"
        },
        {
            amount: 500.00,
            due_date: "2026-04-01",
            description: "Second installment (50%)"
        }
    ]
}
```

### Payment Entity
```javascript
{
    invoice_id: "uuid",
    client_id: "uuid",
    amount: 250.00,
    payment_date: "2026-02-15",
    payment_method: "bank_transfer",
    reference_number: "TXN123456",
    notes: "Partial payment for Feb",
    created_date: "2026-02-15T10:30:00Z"
}
```

## User Flows

### Flow 1: Creating a Payment Schedule
1. Open invoice in ViewInvoice page
2. Click "Add Schedule" button in Payment Schedule section
3. Choose a quick template OR create custom schedule
4. Adjust amounts and due dates as needed
5. Verify total equals invoice amount
6. Click "Create Schedule"
7. Schedule is saved to invoice and displayed

### Flow 2: Recording a Partial Payment
1. Open invoice or use "Record Payment" from invoice list
2. View payment progress (if previous payments exist)
3. Choose payment amount:
   - Click a suggested amount (Full, 50%, 25%, 10%)
   - OR enter custom amount
4. See partial payment warning if amount < remaining
5. Select payment method and date
6. Add reference number and notes
7. Click "Record Payment"
8. Invoice status updates to 'partial_paid'
9. Progress bar and indicators update

### Flow 3: Paying Scheduled Installments
1. View invoice with payment schedule
2. See installments with due dates and statuses
3. Click "Record Payment" on an installment
4. Payment modal pre-fills with installment amount
5. Complete payment details
6. Submit payment
7. Installment marked as "Paid" in schedule
8. Progress bar updates

### Flow 4: Multiple Partial Payments
1. Record first payment (e.g., $250)
   - Status changes to 'partial_paid'
   - Progress shows 25% complete
2. Record second payment (e.g., $250)
   - Status remains 'partial_paid'
   - Progress shows 50% complete
3. Record final payment (e.g., $500)
   - Status changes to 'paid'
   - Progress shows 100% complete
   - Invoice marked as fully paid

## UI Enhancements

### Progress Visualization
- **Progress Bars**: Color-coded by completion percentage
  - Red (0-25%): Critical
  - Yellow (25-50%): Needs attention
  - Blue (50-99%): Good progress
  - Green (100%): Complete
- **Percentage Labels**: Always display exact completion
- **Amount Labels**: Show both paid and remaining

### Smart Suggestions
- **Contextual**: Based on remaining balance
- **Common Amounts**: 100%, 50%, 25%, 10%
- **One-Click**: Apply suggestion instantly
- **Toggleable**: Hide/show suggestions as needed

### Warning System
- **Partial Payment Alert**: Orange warning when amount < balance
- **Overpayment Prevention**: Red error if amount > balance
- **Remaining Preview**: Shows balance after payment
- **Validation Messages**: Clear, actionable error messages

## Best Practices

### For Users
1. **Create Schedule First**: Set up payment plan before recording payments
2. **Use Templates**: Quick templates for common scenarios
3. **Track Progress**: Monitor progress bar and installment status
4. **Record Promptly**: Record payments immediately after receipt
5. **Add References**: Always include transaction IDs
6. **Note Partial Payments**: Add context in notes field

### For Developers
1. **Always Validate**: Check payment amount against remaining balance
2. **Update Status**: Automatically update invoice status after payment
3. **Handle Edge Cases**: 
   - Overpayment attempts
   - Negative amounts
   - Missing required fields
4. **Maintain History**: Log all payment events
5. **Performance**: Load payments efficiently with filters
6. **User Feedback**: Clear success/error messages

## Edge Cases Handled

### Overpayment Protection
- Payment amount validated against remaining balance
- Cannot enter amount greater than what's owed
- Error message shows maximum allowed amount

### Rounding Issues
- All comparisons use 0.01 tolerance
- Prevents floating-point precision errors
- Example: 999.99 vs 1000.00 handled correctly

### Schedule Mismatch
- Prevents saving schedule if total ≠ invoice amount
- Visual indicator shows difference
- Must adjust installments to match exactly

### Concurrent Payments
- Each payment creates new Payment record
- Status calculated from all Payment records
- No race conditions with atomic updates

### Deleted Payments
- If Payment records deleted, status recalculates
- Can transition back from 'paid' to 'partial_paid'
- History maintained for audit trail

## Testing Scenarios

### Test 1: Basic Partial Payment
1. Create invoice for $1,000
2. Record payment of $250
3. Verify status = 'partial_paid'
4. Verify progress = 25%
5. Verify remaining = $750

### Test 2: Multiple Partials to Paid
1. Create invoice for $1,000
2. Record payment of $300 (status: partial_paid, 30%)
3. Record payment of $200 (status: partial_paid, 50%)
4. Record payment of $500 (status: paid, 100%)

### Test 3: Payment Schedule
1. Create invoice for $1,200
2. Create schedule: 3 payments of $400 each
3. Record $400 (installment 1 paid)
4. Skip to month 3, record $400 (installment 3 paid, installment 2 overdue)
5. Record $400 (all paid, status: paid)

### Test 4: Payment Suggestions
1. Open payment modal on $1,000 invoice
2. Verify suggestions: $1000, $500, $250, $100
3. Click $500 suggestion
4. Verify amount field = 500.00
5. See warning: "Remaining after: $500.00"

### Test 5: Schedule Templates
1. Create invoice for $1,000
2. Apply "2 Payments" template
3. Verify: 2 installments of $500 each
4. Apply "Deposit + Balance" template
5. Verify: $300 deposit, $700 balance

## Future Enhancements

### Planned Features
1. **Recurring Payment Schedules**: Auto-create payments based on schedule
2. **Payment Reminders**: Email/notification before installment due
3. **Late Fees**: Auto-calculate fees for overdue installments
4. **Payment Plan Negotiation**: Allow clients to propose schedules
5. **Auto-Payment**: Integrate with payment gateways for auto-charge
6. **Payment Analytics**: Charts showing payment patterns
7. **Bulk Payment Import**: Import multiple payments from CSV
8. **Payment Refunds**: Handle refunds and credits
9. **Multi-Currency Schedules**: Support foreign currency installments
10. **Payment Reconciliation**: Match bank transactions to payments

### Technical Improvements
1. **Payment Entity Relations**: Better database relationships
2. **Optimistic Updates**: Faster UI updates
3. **Offline Support**: Record payments offline, sync later
4. **Payment Webhooks**: Listen to payment gateway events
5. **Audit Logs**: Complete payment change history
6. **Payment Exports**: Export payment data for accounting

## API Integration

### Required Endpoints
- `Payment.create()` - Create payment record
- `Payment.filter({ invoice_id })` - Get all payments for invoice
- `Payment.list()` - Get all payments
- `Invoice.update(id, { payment_schedule })` - Save schedule
- `Invoice.update(id, { status })` - Update status

### Example Usage
```javascript
// Record partial payment
const payment = await Payment.create({
    invoice_id: invoice.id,
    client_id: invoice.client_id,
    amount: 250.00,
    payment_date: new Date().toISOString(),
    payment_method: 'bank_transfer',
    reference_number: 'TXN123',
    notes: 'First installment'
});

// Get all payments
const payments = await Payment.filter({ invoice_id: invoice.id });

// Calculate status
const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
const newStatus = totalPaid >= invoice.total_amount ? 'paid' : 'partial_paid';

// Update invoice
await Invoice.update(invoice.id, { status: newStatus });
```

## Accessibility

- **Keyboard Navigation**: All buttons and inputs keyboard accessible
- **Screen Reader Support**: ARIA labels on all interactive elements
- **Color Contrast**: High contrast for all text and indicators
- **Focus States**: Clear focus indicators on all controls
- **Error Announcements**: Screen reader announces validation errors

## Performance Considerations

- **Lazy Loading**: Payment schedule only loads when needed
- **Optimistic Updates**: UI updates before server confirmation
- **Debounced Validation**: Amount validation debounced to reduce checks
- **Efficient Queries**: Payments filtered by invoice_id, not full scan
- **Memoization**: Calculated values cached to prevent re-computation
