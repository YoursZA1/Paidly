# Invoice Creation Process Cleanup

## Summary
Cleaned up and fixed the invoice creation process to ensure proper data flow, organization filtering, and Supabase integration.

## Key Changes

### 1. EntityManager Improvements (`src/api/customClient.js`)

#### Organization Filtering
- **`pullFromSupabase()`**: Now filters all queries by `org_id` to ensure users only see their organization's data
- **`list()`**: Always pulls fresh data from Supabase first before returning cached data
- **`get()`**: Fetches from Supabase if not in local cache, with org_id filtering

#### Create Method
- Automatically includes `org_id` from user's membership
- Sets `created_by` field
- Handles child records (invoice_items, quote_items) separately
- Proper error handling and validation

#### Update Method
- Verifies organization ownership before updating
- Handles items updates (deletes old, inserts new)
- Proper org_id filtering on update queries

### 2. CreateInvoice Page (`src/pages/CreateInvoice.jsx`)

#### Data Loading
- Loads clients and services from Supabase on mount
- Supports pre-selected client via URL parameter (`?client_id=...`)
- Proper error handling with toast notifications
- Loading states with skeleton UI

#### Invoice Creation Flow
- Two-step process: Details → Preview
- Validation before proceeding to preview
- Automatic invoice number generation (`INV-YYYYMMDD-CLIENT-TIME`)
- Proper data mapping for Supabase schema
- Success/error notifications
- Navigation to invoice list after creation

#### Error Handling
- Client selection validation
- Items validation (at least one required)
- Clear error messages
- Toast notifications for user feedback

### 3. InvoicePreview Component (`src/components/invoice/InvoicePreview.jsx`)

#### Field Mapping Fixes
- Fixed field name inconsistencies (`qty` → `quantity`, `price` → `unit_price`)
- Supports multiple field name formats for backward compatibility
- Proper total calculation

#### UI Improvements
- Loading state on create button
- Disabled state during creation
- Better visual feedback

## Data Flow

### Invoice Creation Flow
1. User fills invoice details (client, items, dates, etc.)
2. Clicks "Next" → Validation → Preview screen
3. Reviews preview → Clicks "Create Invoice"
4. System generates invoice number
5. `Invoice.create()` called:
   - Gets user's `org_id` from memberships table
   - Creates invoice record in Supabase with `org_id`
   - Creates invoice_items records linked to invoice
   - Returns created invoice
6. Success notification → Navigate to invoice list

### Data Relationships
- **Invoice** → `org_id` (from user's membership)
- **Invoice** → `client_id` (from clients table, filtered by org_id)
- **Invoice Items** → `invoice_id` (linked to invoice)
- **Invoice Items** → `service_name` (from services/products)

## Testing Checklist

- [ ] Create invoice with client selection
- [ ] Create invoice with multiple items
- [ ] Verify invoice appears in invoice list
- [ ] Verify invoice items are saved correctly
- [ ] Verify org_id filtering (users only see their org's invoices)
- [ ] Test validation (no client, no items)
- [ ] Test error handling (network errors, Supabase errors)
- [ ] Test pre-selected client via URL parameter
- [ ] Verify invoice number generation format
- [ ] Test navigation after creation

## Database Schema Requirements

Ensure these tables exist in Supabase:
- `invoices` (with `org_id`, `client_id`, `invoice_number`, `status`, etc.)
- `invoice_items` (with `invoice_id`, `service_name`, `quantity`, `unit_price`, `total_price`)
- `memberships` (with `user_id`, `org_id`)
- `clients` (with `org_id`)
- `services` (with `org_id`)

## Notes

- All entity operations now properly filter by `org_id`
- Invoice items are stored in separate `invoice_items` table
- Invoice creation automatically sets `status` to 'draft'
- Invoice numbers follow format: `INV-YYYYMMDD-CLIENT-TIME`
- Proper error handling throughout the flow
- Toast notifications for user feedback
