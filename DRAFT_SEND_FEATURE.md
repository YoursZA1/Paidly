# Save as Draft / Send Immediately Feature

## Overview
Comprehensive draft and send functionality for invoices, allowing users to either save invoices as drafts for later review or send them immediately to clients.

---

## 📁 New Files Created

### Core Components
1. **[src/components/invoice/InvoiceSaveActions.jsx](src/components/invoice/InvoiceSaveActions.jsx)**
   - Dual-action buttons for Save as Draft / Send Now
   - Confirmation dialog for both actions
   - Loading states and error handling
   - Customizable button text and styling

2. **[src/components/invoice/InvoiceStatusBadge.jsx](src/components/invoice/InvoiceStatusBadge.jsx)**
   - Visual status indicators with icons
   - 7 status types supported (draft, sent, pending, paid, partial_paid, overdue, cancelled)
   - Color-coded badges with tooltips
   - Configurable sizes (small, default, large)

3. **[src/services/InvoiceSendService.js](src/services/InvoiceSendService.js)**
   - Send invoice to client
   - Save invoice as draft
   - Update draft invoices
   - Send draft invoices (convert to sent)
   - Get all draft invoices
   - Delete draft invoices
   - Resend invoices
   - Schedule invoice sending

---

## 🔧 Enhanced Existing Files

### Invoice Creation
- **[src/pages/CreateInvoice.jsx](src/pages/CreateInvoice.jsx)**
  - Added saveAsDraft parameter to handleCreateInvoice
  - Automatically sets status to 'draft' or 'sent'
  - Records sent_date when invoice is sent
  - Sends email notification when not saving as draft
  - Updated toast messages for draft vs sent
  - Imports InvoiceSendService

### Invoice Preview
- **[src/components/invoice/InvoicePreview.jsx](src/components/invoice/InvoicePreview.jsx)**
  - Integrated InvoiceSaveActions component
  - Separate actions for Save Draft and Send Now
  - Loading state management
  - Different button for editing mode
  - Passes saveAsDraft parameter to onCreate

### Invoice List
- **[src/components/invoice/InvoiceList.jsx](src/components/invoice/InvoiceList.jsx)**
  - Uses InvoiceStatusBadge instead of generic Badge
  - Enhanced visual status indicators
  - Proper status styling with icons

### Invoice Actions
- **[src/components/invoice/InvoiceActions.jsx](src/components/invoice/InvoiceActions.jsx)**
  - Added "Send Invoice Now" option for drafts
  - Conditional menu item based on status
  - Imports sendDraftInvoice service
  - Loading state for sending
  - Success/error toast notifications

---

## 🎯 Key Features

### 1. Save as Draft
- **Draft Creation**: Invoices saved with status 'draft'
- **No Email Sent**: Client not notified when draft is created
- **Editable**: Drafts can be edited before sending
- **Visual Indicator**: Draft status badge in invoice list
- **Draft Management**: View, edit, and delete drafts

### 2. Send Immediately
- **Instant Send**: Invoice marked as 'sent' and client notified
- **Email Notification**: Client receives email with invoice link
- **Sent Date Tracked**: Records exact timestamp of sending
- **Public Link Generated**: Shareable link created automatically
- **Status Update**: Status automatically changes to 'sent'

### 3. Draft Management
- **Send Later**: Convert draft to sent status anytime
- **Edit Drafts**: Full editing capabilities for unsent invoices
- **Delete Drafts**: Remove draft invoices without client knowledge
- **Draft Filter**: Filter invoices by draft status
- **Draft Count**: Track number of unsent invoices

### 4. Status Tracking
- **Draft**: Invoice created but not sent
- **Sent**: Invoice sent to client
- **Pending**: Awaiting payment
- **Paid**: Fully paid
- **Partial Paid**: Partially paid
- **Overdue**: Payment deadline passed
- **Cancelled**: Invoice cancelled

---

## 📊 Invoice Status Flow

```
Create Invoice
    ↓
┌──────────────┐
│ Save Choice  │
└──────┬───────┘
       │
   ┌───┴────┐
   │        │
Draft      Send
   │        │
   ↓        ↓
[DRAFT]  [SENT]
   │        │
   └────┬───┘
        ↓
   [PENDING]
        ↓
   [PAID] or [OVERDUE]
```

---

## 🔌 API Integration

### Invoice Create with Status
```javascript
await Invoice.create({
  ...invoiceData,
  status: saveAsDraft ? 'draft' : 'sent',
  sent_date: saveAsDraft ? null : new Date().toISOString(),
});
```

### Send Draft Invoice
```javascript
import { sendDraftInvoice } from '@/services/InvoiceSendService';

await sendDraftInvoice(invoiceId);
// Status updated from 'draft' to 'sent'
// Email sent to client
// sent_date recorded
```

### Save as Draft
```javascript
import { saveInvoiceAsDraft } from '@/services/InvoiceSendService';

await saveInvoiceAsDraft(invoiceData);
// Status: 'draft'
// No email sent
// No sent_date
```

### Update Draft
```javascript
import { updateDraftInvoice } from '@/services/InvoiceSendService';

await updateDraftInvoice(invoiceId, updatedData);
// Only works for draft status
// Maintains draft status
```

---

## 💡 Usage Examples

### Creating Invoice with Options
```jsx
<InvoiceSaveActions
  onSaveDraft={async () => {
    await createInvoice(true); // true = save as draft
  }}
  onSendNow={async () => {
    await createInvoice(false); // false = send now
  }}
  loading={isProcessing}
  disabled={!isValid}
  showConfirmDialog={true}
/>
```

### Displaying Status
```jsx
import InvoiceStatusBadge from './InvoiceStatusBadge';

<InvoiceStatusBadge status="draft" size="small" />
<InvoiceStatusBadge status="sent" size="default" />
<InvoiceStatusBadge status="paid" size="large" />
```

### Sending Draft from List
```jsx
// In invoice action menu
{invoice.status === 'draft' && (
  <DropdownMenuItem onClick={handleSendDraft}>
    <Send className="w-4 h-4 mr-2" />
    Send Invoice Now
  </DropdownMenuItem>
)}
```

---

## 📱 User Interface

### Create Invoice Page
- **Step 3 (Preview)**: Two prominent buttons
  - "Save as Draft" (outline style, left side)
  - "Send Invoice" (primary style, right side)
- **Confirmation Dialog**: Optional confirmation before action
- **Loading States**: Visual feedback during processing

### Invoice List
- **Status Badge**: Color-coded status indicators
  - Gray: Draft
  - Blue: Sent
  - Green: Paid
  - Orange: Partial
  - Red: Overdue
- **Action Menu**: "Send Now" option for drafts
- **Quick Filters**: Filter by draft status

### Status Badge Colors
- **Draft**: Gray background, gray text
- **Sent**: Blue background, blue text
- **Pending**: Yellow background, yellow text
- **Paid**: Green background, green text
- **Partial Paid**: Orange background, orange text
- **Overdue**: Red background, red text
- **Cancelled**: Gray background, muted text

---

## ✅ Workflow Examples

### Scenario 1: Save as Draft
1. User creates invoice
2. Clicks "Save as Draft" on preview
3. Invoice saved with status 'draft'
4. No email sent to client
5. Invoice appears in list with Draft badge
6. User can edit or send later

### Scenario 2: Send Immediately
1. User creates invoice
2. Clicks "Send Invoice" on preview
3. Confirmation dialog appears
4. Invoice saved with status 'sent'
5. Email sent to client automatically
6. sent_date recorded
7. Invoice appears in list with Sent badge

### Scenario 3: Send Draft Later
1. User views draft invoice in list
2. Clicks action menu (three dots)
3. Selects "Send Invoice Now"
4. Confirmation dialog appears
5. Status changes from 'draft' to 'sent'
6. Email sent to client
7. Badge updates to Sent

### Scenario 4: Edit Draft
1. User finds draft in invoice list
2. Clicks "Edit Invoice" from menu
3. Makes changes to invoice
4. Saves changes (remains as draft)
5. Can choose to send when ready

---

## 🎨 UI Components Detail

### InvoiceSaveActions Props
```jsx
{
  onSaveDraft: () => Promise<void>,     // Called when saving as draft
  onSendNow: () => Promise<void>,       // Called when sending immediately
  loading: boolean,                      // Shows loading state
  disabled: boolean,                     // Disables both buttons
  showConfirmDialog: boolean,            // Show confirmation dialog
  confirmationType: 'send' | 'draft'     // Type of confirmation
}
```

### InvoiceStatusBadge Props
```jsx
{
  status: 'draft' | 'sent' | 'pending' | 'paid' | 'partial_paid' | 'overdue' | 'cancelled',
  size: 'small' | 'default' | 'large'
}
```

---

## 🔔 Toast Notifications

### Draft Saved
```
Title: "✓ Draft Saved"
Description: "Invoice [number] has been saved as draft."
```

### Invoice Sent
```
Title: "✓ Invoice Sent"
Description: "Invoice [number] has been sent to client."
```

### Send Error
```
Title: "✗ Error"
Description: "Failed to send invoice. Please try again."
```

---

## 📋 Database Fields

### Invoice Fields
```javascript
{
  status: 'draft' | 'sent' | 'pending' | 'paid' | 'partial_paid' | 'overdue',
  sent_date: ISO date string or null,
  draft_created_date: ISO date string,
  last_modified_date: ISO date string,
  last_sent_date: ISO date string,
  resend_count: number
}
```

---

## 🚀 Future Enhancements

1. **Scheduled Sending**: Schedule draft to be sent at specific time
2. **Draft Reminders**: Notify user of unsent drafts
3. **Bulk Send**: Send multiple drafts at once
4. **Draft Templates**: Save drafts as reusable templates
5. **Auto-Draft**: Automatically save as draft every N minutes
6. **Draft Analytics**: Track draft-to-sent conversion rate
7. **Collaborative Drafts**: Multiple users can edit drafts
8. **Draft Comments**: Add internal notes to drafts
9. **Draft Approval**: Require approval before sending
10. **Draft Expiry**: Auto-delete old drafts

---

## 🧪 Testing Checklist

- [x] Create invoice as draft
- [x] Create invoice and send immediately
- [x] View draft in invoice list
- [x] Edit draft invoice
- [x] Send draft from list
- [x] Delete draft invoice
- [x] Status badge displays correctly
- [x] Toast notifications show
- [x] Loading states work
- [x] Confirmation dialogs appear
- [x] Email sent on send action
- [x] sent_date recorded correctly
- [x] Build without errors

---

## 🎉 Summary

The Save as Draft / Send Immediately feature provides:

✅ **Draft Management** - Save invoices for later review  
✅ **Instant Sending** - Send invoices immediately to clients  
✅ **Visual Status** - Clear status badges and indicators  
✅ **Flexible Workflow** - Edit drafts before sending  
✅ **Email Integration** - Automatic client notifications  
✅ **Action Menu** - Send drafts from invoice list  
✅ **Confirmation Dialogs** - Prevent accidental sending  
✅ **Loading States** - Visual feedback during operations  
✅ **Error Handling** - Graceful error management  

---

**Status**: ✅ Complete and Production Ready  
**Build Status**: ✅ Successful  
**No Breaking Changes**: ✅ Confirmed  
**Components Added**: 3 new components  
**Services Added**: 1 new service  
**Files Enhanced**: 4 existing files
