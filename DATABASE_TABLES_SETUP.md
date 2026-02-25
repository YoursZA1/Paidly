# Database Tables Setup: Clients, Services, and Products

## Overview

This document describes the database schema for storing clients, services, and products in Supabase. All tables are properly secured with Row Level Security (RLS) and organization-based filtering.

## Tables Created

### 1. Clients Table (`public.clients`)

Stores client/customer information with comprehensive contact and business details.

**Schema:**
```sql
create table if not exists public.clients (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  address text,
  contact_person text,
  website text,
  tax_id text,
  fax text,
  alternate_email text,
  notes text,
  internal_notes text,
  industry text,
  payment_terms text default 'net_30',
  payment_terms_days integer default 30,
  follow_up_enabled boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

**Key Features:**
- Organization-scoped (`org_id`) - each client belongs to one organization
- Contact information (email, phone, address, contact person)
- Business details (website, tax_id, fax)
- Payment terms configuration
- Notes and internal notes for tracking
- Industry classification
- Follow-up tracking enabled by default

**Indexes:**
- `idx_clients_org_id` - Fast org-based queries
- `idx_clients_name` - Name search
- `idx_clients_email` - Email lookup
- `idx_clients_created_at` - Recent clients

### 2. Services Table (`public.services`)

Unified catalog table storing services, products, labor, materials, and expenses.

**Schema:**
```sql
create table if not exists public.services (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  
  -- Base Fields (Mandatory for all item types)
  item_type text not null default 'service' check (item_type in ('service', 'product', 'labor', 'material', 'expense')),
  default_unit text not null,
  default_rate numeric(12,2) not null default 0,
  tax_category text default 'standard' check (tax_category in ('standard', 'reduced', 'zero', 'exempt')),
  is_active boolean default true,
  
  -- Legacy/Backward Compatibility Fields
  rate numeric(12,2) default 0,
  unit text,
  unit_price numeric(12,2),
  unit_of_measure text,
  service_type text,
  
  -- Type-Specific Fields (Products)
  sku text,
  price numeric(12,2),
  
  -- Type-Specific Fields (Services)
  billing_unit text,
  
  -- Type-Specific Fields (Labor)
  role text,
  hourly_rate numeric(12,2),
  
  -- Type-Specific Fields (Materials)
  unit_type text,
  cost_rate numeric(12,2),
  
  -- Type-Specific Fields (Expenses)
  cost_type text check (cost_type in ('fixed', 'variable')),
  default_cost numeric(12,2),
  
  -- Optional Fields
  category text,
  pricing_type text check (pricing_type in ('hourly', 'fixed', 'per_item', 'daily', 'weekly', 'monthly')),
  min_quantity integer default 1,
  tags text[],
  estimated_duration text,
  requirements text,
  
  -- Pricing Controls
  price_locked boolean default false,
  price_locked_at timestamptz,
  price_locked_reason text,
  
  -- Usage Tracking
  usage_count integer default 0,
  last_used_date timestamptz,
  
  -- Type-Specific Data (JSONB for flexibility)
  type_specific_data jsonb,
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

**Item Types:**
1. **Service** (`item_type = 'service'`)
   - Uses: `billing_unit`, `rate`
   - Example: "Web Development", "Consulting"

2. **Product** (`item_type = 'product'`)
   - Uses: `sku`, `unit`, `price`
   - Example: "Laptop", "Software License"

3. **Labor** (`item_type = 'labor'`)
   - Uses: `role`, `hourly_rate`
   - Example: "Senior Developer", "Electrician"

4. **Material** (`item_type = 'material'`)
   - Uses: `unit_type`, `cost_rate`
   - Example: "Concrete", "Steel"

5. **Expense** (`item_type = 'expense'`)
   - Uses: `cost_type`, `default_cost`
   - Example: "Travel", "Equipment"

**Key Features:**
- Unified catalog for all item types
- Organization-scoped (`org_id`)
- Flexible type-specific fields
- Pricing controls (price locking)
- Usage tracking
- Category and tag support
- Backward compatible with legacy fields

**Indexes:**
- `idx_services_org_id` - Fast org-based queries
- `idx_services_item_type` - Filter by type
- `idx_services_name` - Name search
- `idx_services_is_active` - Active items only
- `idx_services_category` - Category filtering
- `idx_services_created_at` - Recent items
- `idx_services_usage_count` - Popular items
- `idx_services_last_used_date` - Recently used

## Row Level Security (RLS)

All tables have RLS enabled with policies that:

1. **Admin Access**: Admins can access all records
2. **Organization Members**: Users can only access records from their organization
3. **Write Access**: Users can create/update/delete records in their organization

### Example Policies:

**Clients:**
- `org members select` - Read clients from user's org
- `org members write` - Create/update/delete clients in user's org

**Services:**
- `org members select services` - Read services from user's org
- `org members write services` - Create/update/delete services in user's org

## Usage Examples

### Creating a Client

```javascript
import { Client } from "@/api/entities";

const newClient = await Client.create({
  name: "Acme Corporation",
  email: "contact@acme.com",
  phone: "+1-555-0123",
  address: "123 Main St, City, State 12345",
  contact_person: "John Doe",
  website: "https://acme.com",
  tax_id: "TAX-123456",
  industry: "technology",
  payment_terms: "net_30",
  payment_terms_days: 30
});
```

### Creating a Service

```javascript
import { Service } from "@/api/entities";

const newService = await Service.create({
  name: "Web Development",
  item_type: "service",
  default_unit: "hour",
  default_rate: 150.00,
  billing_unit: "hour",
  rate: 150.00,
  description: "Professional web development services",
  category: "Development",
  tax_category: "standard",
  is_active: true
});
```

### Creating a Product

```javascript
const newProduct = await Service.create({
  name: "Laptop Pro 15",
  item_type: "product",
  default_unit: "each",
  default_rate: 1299.99,
  sku: "LAPTOP-PRO-15",
  unit: "each",
  price: 1299.99,
  description: "High-performance laptop",
  category: "Hardware",
  tax_category: "standard",
  is_active: true
});
```

### Querying Services by Type

```javascript
// Get all active products
const products = await Service.list("-created_date");
const activeProducts = products.filter(s => 
  s.item_type === 'product' && s.is_active
);

// Get all services
const services = products.filter(s => s.item_type === 'service');
```

## Migration Notes

If you have existing data:

1. **Clients**: Existing clients will work, but new fields will be `null` until updated
2. **Services**: 
   - Existing services will have `item_type = 'service'` by default
   - Legacy fields (`rate`, `unit`) are preserved for backward compatibility
   - New fields can be populated gradually

## Testing Checklist

- [ ] Create a client with all fields
- [ ] Create a service (item_type = 'service')
- [ ] Create a product (item_type = 'product')
- [ ] Create labor (item_type = 'labor')
- [ ] Create material (item_type = 'material')
- [ ] Create expense (item_type = 'expense')
- [ ] Verify org_id filtering (users only see their org's data)
- [ ] Test RLS policies (users can't access other org's data)
- [ ] Test indexes (queries should be fast)
- [ ] Test backward compatibility (legacy fields work)

## Related Tables

- `invoices` - References clients via `client_id`
- `invoice_items` - References services via `service_name` (or can link via ID)
- `quotes` - References clients via `client_id`
- `quote_items` - References services via `service_name`

## Next Steps

1. Run the migration: `supabase/schema.postgres.sql`
2. Verify tables are created: Check Supabase dashboard
3. Test RLS policies: Try accessing data from different users
4. Update application code: Ensure EntityManager uses new fields
5. Migrate existing data: Update legacy records with new fields
