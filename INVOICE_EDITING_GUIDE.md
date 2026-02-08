# Invoice Editing Feature Guide

## 🎯 Feature Overview

Edit draft invoices with the ability to save changes as draft or send to clients immediately.

## 📋 Key Features

### 1. Edit Invoice Page
- **URL**: `/edit-invoice?id={invoiceId}`
- **Access**: Click "Edit" on any draft invoice from the invoice list

### 2. Visual Indicators

#### Status Badge
```
┌─────────────────────────────┐
│ Edit Invoice #INV-001 DRAFT │ ← Status badge next to title
└─────────────────────────────┘
```

#### Draft Alert Banner (Blue)
```
┌────────────────────────────────────────────────┐
│ ⓘ  Draft Invoice                               │
│    This invoice is still a draft and hasn't    │
│    been sent to the client yet. You can        │
│    continue editing and send it when ready.    │
└────────────────────────────────────────────────┘
```

#### Invoice Info Card
```
┌─────────────────────────────────────────────┐
│  📄 Invoice Information        [DRAFT]      │
│                                              │
│  📄 Invoice Number    👤 Client              │
│     INV-001              John Doe            │
│                                              │
│  📅 Created           💰 Total Amount        │
│     Jan 15, 2025         R 25,000.00        │
│                                              │
│  🕒 Last Modified                            │
│     Jan 16, 2025 2:30 PM                    │
│                                              │
│  ⓘ  Draft Status                            │
│     This invoice hasn't been sent to the    │
│     client. You can make changes and either │
│     save as draft or send it.               │
└─────────────────────────────────────────────┘
```

### 3. Edit Workflow

#### Step 1: Project Details
- Edit services, items, descriptions
- Update quantities, rates, amounts
- Modify tax rates and currency
- Change client or banking details

#### Step 2: Payment Breakdown
- Review calculated payments
- Adjust milestone dates
- Verify payment schedule

#### Step 3: Preview & Save
```
┌──────────────────────────────────────────┐
│  Invoice Preview                          │
│  [All invoice details displayed]          │
│                                           │
│  ┌────────────────────────────────────┐  │
│  │  [← Back]  [Update Draft] [Update &│  │
│  │                            Send →] │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

### 4. Action Buttons

#### Update Draft
- **Icon**: 💾 Save
- **Action**: Saves changes without sending
- **Result**: 
  - Status remains 'draft'
  - Toast: "✓ Draft Updated"
  - Returns to invoice list

#### Update & Send
- **Icon**: 📤 Send
- **Action**: Saves changes and emails client
- **Result**:
  - Status changes to 'sent'
  - Email sent to client
  - sent_date updated
  - Toast: "✓ Invoice Updated - Invoice INV-001 has been sent to client"
  - Returns to invoice list

## 🔄 User Flows

### Scenario 1: Edit and Save Draft
```
1. User clicks "Edit" on draft invoice
   ↓
2. System shows draft alert + invoice info
   ↓
3. User updates project details
   ↓
4. User reviews payment breakdown
   ↓
5. User clicks "Update Draft"
   ↓
6. System saves changes
   ↓
7. Toast: "✓ Draft Updated"
   ↓
8. Return to invoice list
```

### Scenario 2: Edit and Send
```
1. User clicks "Edit" on draft invoice
   ↓
2. System shows draft alert + invoice info
   ↓
3. User updates invoice details
   ↓
4. User clicks "Update & Send"
   ↓
5. System:
   - Updates invoice
   - Changes status to 'sent'
   - Sets sent_date
   - Sends email to client
   ↓
6. Toast: "✓ Invoice sent to client"
   ↓
7. Return to invoice list
```

### Scenario 3: Edit Sent Invoice
```
1. User clicks "Edit" on sent invoice
   ↓
2. No draft alert (already sent)
   ↓
3. User updates details
   ↓
4. User clicks action button
   ↓
5. System saves without re-sending
   ↓
6. Toast: "✓ Invoice Updated"
```

## 💡 Usage Tips

### When to Use Update Draft
- Still making changes
- Need approval before sending
- Want to review later
- Waiting for more information

### When to Use Update & Send
- Ready to bill client
- All information confirmed
- Client is expecting invoice
- Completing the workflow

## 🔐 Business Rules

1. **Draft Status**
   - Can be edited freely
   - No email sent until "Update & Send"
   - Status badge shows DRAFT

2. **Status Conversion**
   - Draft → Sent: Email sent
   - Sent → Sent: No email
   - Sent_date only set once

3. **Timestamps**
   - created_date: Never changes
   - sent_date: Set on first send
   - last_modified_date: Updated every save

4. **Email Notifications**
   - Only sent when draft becomes sent
   - Not sent for subsequent edits
   - Includes invoice PDF and details

## 📊 Status Indicators

| Status | Badge Color | Can Edit | Email on Save |
|--------|-------------|----------|---------------|
| draft  | Blue        | Yes      | Only if sending |
| sent   | Green       | Yes      | No            |
| paid   | Purple      | Limited  | No            |
| overdue| Red         | Limited  | No            |

## 🎨 Design Elements

### Colors
- **Draft Alert**: Blue (`border-blue-200 bg-blue-50`)
- **Info Card Draft**: Blue border (`border-blue-200`)
- **Info Card Sent**: Gray border (`border-gray-200`)
- **Success Toast**: Default (Green)
- **Error Toast**: Destructive (Red)

### Icons
- 📄 FileText - Invoice number
- 👤 User - Client name
- 📅 Calendar - Dates
- 💰 DollarSign - Amount
- 🕒 Clock - Last modified
- ⓘ AlertCircle - Draft status
- ✓ CheckCircle - Sent status
- 💾 Save - Update draft
- 📤 Send - Send invoice

## 🚀 Quick Start

### For Developers
```javascript
// Navigate to edit invoice
navigate(createPageUrl("edit-invoice") + `?id=${invoiceId}`);

// Check if invoice is draft
const isDraft = invoice.status === 'draft';

// Update invoice
await handleUpdateInvoice(saveAsDraft);
// saveAsDraft = true (draft) or false (send)
```

### For Users
1. Go to Invoices page
2. Find draft invoice
3. Click "Edit" action
4. Make your changes
5. Choose action:
   - **Update Draft**: Keep as draft
   - **Update & Send**: Send to client

## 📱 Mobile Support

All components are responsive:
- Stacked layout on mobile
- Touch-optimized buttons
- Readable text sizes
- Scrollable content areas

---

**Feature Status**: ✅ Production Ready  
**Last Updated**: January 2025  
**Developer**: GitHub Copilot
