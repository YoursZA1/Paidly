# Invoice Edit Restrictions - Quick Guide

## 🔒 What's Restricted?

Invoices with these statuses **CANNOT** be edited:
- ✅ **Paid** - Full payment received
- 💰 **Partially Paid** - Some payment received

Invoices with these statuses **CAN** be edited:
- 📄 **Draft** - Not yet sent
- 📤 **Sent** - Sent but not paid
- ⏰ **Overdue** - Past due but not paid

---

## 📱 User Experience

### 1. Invoice Actions Menu

**For Editable Invoices (Draft, Sent, Overdue):**
```
┌─────────────────────────┐
│ Actions            ⋮    │
├─────────────────────────┤
│ 💰 Record Payment       │
│ 👁️  View Invoice         │
│ 📄 Preview PDF          │
│ ✏️  Edit Invoice        │ ← Clickable
│ ✉️  Email to Client      │
│ 🔗 Get Share Link       │
│ ⬇️  Download PDF        │
│ 📊 Export as JSON       │
│ 🗑️  Delete Invoice      │
└─────────────────────────┘
```

**For Restricted Invoices (Paid, Partially Paid):**
```
┌─────────────────────────────┐
│ Actions                ⋮    │
├─────────────────────────────┤
│ 💰 Record Payment           │
│ 👁️  View Invoice             │
│ 📄 Preview PDF              │
│ ✏️  Edit Invoice (Locked)   │ ← Grayed out, not clickable
│ ✉️  Email to Client          │
│ 🔗 Get Share Link           │
│ ⬇️  Download PDF            │
│ 📊 Export as JSON           │
│ 🗑️  Delete Invoice          │
└─────────────────────────────┘
```

### 2. Direct URL Access Attempt

**What Happens:**
```
User types: /edit-invoice?id=123
             ↓
System checks invoice status
             ↓
Status = "paid"
             ↓
Toast appears:
┌──────────────────────────────────────┐
│ ⚠️ Cannot Edit Invoice               │
│                                      │
│ This invoice is paid and cannot      │
│ be edited. View the invoice instead. │
└──────────────────────────────────────┘
             ↓
Auto-redirect to: /view-invoice?id=123
```

### 3. Visual Indicators

#### Status Badge Colors:
- **Draft**: 🔵 Blue - Editable
- **Sent**: 🟢 Green - Editable  
- **Overdue**: 🔴 Red - Editable
- **Partially Paid**: 🟣 Purple - 🔒 **LOCKED**
- **Paid**: 🟢 Green - 🔒 **LOCKED**

---

## 🎯 Why These Restrictions?

### Paid Invoices 🔒
```
❌ Cannot Edit Because:
├─ Payment has been received
├─ Financial records must not change
├─ Audit trail must be preserved
└─ Accounting reconciliation requires stability
```

### Partially Paid Invoices 🔒
```
❌ Cannot Edit Because:
├─ Partial payment recorded against original amount
├─ Changes would affect payment tracking
├─ Client already paid based on original terms
└─ Accounting entries would become incorrect
```

---

## 💡 What Can You Do Instead?

When editing is blocked, you can:

### ✅ View the Invoice
- Read-only access to all details
- See complete invoice information
- Review payment history

### ✅ Download/Export
- Download PDF for records
- Export as JSON for data processing
- Share link with client

### ✅ Record Additional Payments
- For partially paid invoices
- Track remaining balance
- Update payment status

### ✅ Create New Invoice
- Start fresh with new invoice
- Reference original if needed
- Maintain separate records

### ✅ Contact Support
- Request correction if needed
- Ask about credit notes
- Get admin assistance

---

## 🔧 Technical Details

### Status Check Code:
```javascript
// Check if invoice is locked for editing
const isLocked = ['paid', 'partial_paid'].includes(invoice.status);

if (isLocked) {
    // Redirect to view page
    navigate(createPageUrl("ViewInvoice") + `?id=${id}`);
}
```

### Protection Layers:

1️⃣ **UI Layer** (InvoiceActions.jsx)
   - Edit button disabled
   - "(Locked)" label shown
   - Grayed out appearance

2️⃣ **Route Protection** (EditInvoice.jsx)
   - Status check on page load
   - Automatic redirect
   - Toast notification

3️⃣ **Visual Feedback**
   - Toast warning message
   - Status badge indicators
   - Menu item styling

---

## 📊 Status Reference Table

| Status | Badge | Editable | Why? |
|--------|-------|----------|------|
| Draft | 🔵 Blue | ✅ Yes | Not yet sent - safe to change |
| Sent | 🟢 Green | ✅ Yes | Sent but not paid - can update |
| Overdue | 🔴 Red | ✅ Yes | Past due but no payment - can adjust |
| Partial Paid | 🟣 Purple | ❌ No | Payment received - must be stable |
| Paid | ✅ Green | ❌ No | Fully paid - records locked |

---

## 🎬 Demo Scenario

### Scenario: Trying to Edit a Paid Invoice

```
Step 1: User sees paid invoice in list
        Status Badge: [✅ Paid]

Step 2: User clicks Actions menu (⋮)
        Menu opens with options

Step 3: User sees "Edit Invoice (Locked)"
        - Text is grayed out (50% opacity)
        - Cursor shows "not-allowed"
        - Click does nothing

Step 4: User tries direct URL
        Types: /edit-invoice?id=INV-001

Step 5: Page starts loading
        System fetches invoice data

Step 6: Status check detects "paid"
        Condition: invoice.status === 'paid'

Step 7: Toast notification appears
        ⚠️ Cannot Edit Invoice
        This invoice is paid and cannot be edited.

Step 8: Auto-redirect (after 1 second)
        Navigates to: /view-invoice?id=INV-001

Step 9: View page loads
        Shows invoice in read-only mode
        All details visible but not editable
```

---

## ⚡ Quick Reference

### Can I edit this invoice?

```
┌─────────────────────────────────────┐
│ Is payment recorded?                │
│   ↓ YES → ❌ Cannot Edit             │
│   ↓ NO  → Check next...             │
│                                     │
│ Is status "paid" or "partial_paid"? │
│   ↓ YES → ❌ Cannot Edit             │
│   ↓ NO  → ✅ Can Edit                │
└─────────────────────────────────────┘
```

### What happens when I try?

```
UI Method:
  Click Edit → Nothing happens
               Button is disabled

Direct URL:
  Type URL → Page loads
          → Status check runs
          → Toast appears
          → Redirect to View page
```

---

## 🚀 For Developers

### Files Modified:
1. `src/pages/EditInvoice.jsx`
   - Added status check in `loadInitialData()`
   - Redirect paid/partial_paid to view page
   - Toast notification on restriction

2. `src/components/invoice/InvoiceActions.jsx`
   - Disabled edit menu item for locked invoices
   - Added "(Locked)" label
   - Conditional rendering and styling

### Files Created:
1. `src/components/invoice/InvoiceEditRestriction.jsx`
   - Full-page restriction explanation component
   - Ready for dedicated restriction page

### Key Functions:
```javascript
// Check if editable
const isEditable = !['paid', 'partial_paid'].includes(status);

// Redirect if locked
if (invoice.status === 'paid' || invoice.status === 'partial_paid') {
    toast({ title: "⚠️ Cannot Edit Invoice", ... });
    navigate(createPageUrl("ViewInvoice") + `?id=${id}`);
}
```

---

**Status**: ✅ Production Ready  
**Build**: ✅ Successful  
**Last Updated**: January 31, 2026
