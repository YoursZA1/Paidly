# Database Schema: Unified Catalog System

## Overview

The unified catalog system uses a single `catalog_items` table to store all inventory items (services, products, labor, materials, expenses). Invoices reference catalog items via `catalog_item_id` rather than free text entry.

---

## 1. Primary Table: `catalog_items`

### Base Fields (Required for ALL Items)

```sql
CREATE TABLE catalog_items (
    -- Identity
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Base Fields (Mandatory)
    name                VARCHAR(255) NOT NULL,
    item_type           VARCHAR(50) NOT NULL CHECK (item_type IN ('service', 'product', 'labor', 'material', 'expense')),
    description         TEXT,
    default_unit        VARCHAR(50) NOT NULL,  -- 'hour', 'piece', 'kg', 'day', etc.
    default_rate        DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    tax_category        VARCHAR(50) DEFAULT 'standard' CHECK (tax_category IN ('standard', 'reduced', 'zero', 'exempt')),
    is_active           BOOLEAN DEFAULT true,
    
    -- Pricing Controls (Phase 7)
    price_locked        BOOLEAN DEFAULT false,
    price_locked_at     TIMESTAMP,
    price_locked_reason VARCHAR(255),
    
    -- Usage Tracking (Phase 7)
    usage_count         INTEGER DEFAULT 0,
    last_used_date      TIMESTAMP,
    
    -- Legacy Compatibility (Optional)
    unit_price          DECIMAL(10, 2),  -- Maps to default_rate
    unit_of_measure     VARCHAR(50),     -- Maps to default_unit
    service_type        VARCHAR(50),     -- Legacy pricing type
    
    -- Optional Fields
    category            VARCHAR(100),
    pricing_type        VARCHAR(50) CHECK (pricing_type IN ('hourly', 'fixed', 'per_item', 'daily', 'weekly', 'monthly')),
    min_quantity        INTEGER DEFAULT 1,
    tags                TEXT[],  -- Array of tags
    estimated_duration  VARCHAR(100),
    requirements        TEXT,
    
    -- Type-Specific Fields (JSONB for flexibility)
    type_specific_data  JSONB,
    
    -- Audit Fields
    created_at          TIMESTAMP DEFAULT NOW(),
    updated_at          TIMESTAMP DEFAULT NOW(),
    archived_at         TIMESTAMP,
    archive_reason      VARCHAR(255),
    
    -- Indexes
    INDEX idx_user_item_type (user_id, item_type),
    INDEX idx_user_active (user_id, is_active),
    INDEX idx_usage_count (usage_count DESC),
    INDEX idx_last_used (last_used_date DESC)
);
```

### Type-Specific Data Structure (JSONB)

Each item type stores additional fields in `type_specific_data`:

#### **Product** (item_type = 'product')
```json
{
  "sku": "PROD-001",
  "unit": "each",
  "price": 99.99
}
```

#### **Service** (item_type = 'service')
```json
{
  "billing_unit": "hour",
  "rate": 150.00
}
```

#### **Labor** (item_type = 'labor')
```json
{
  "role": "Senior Developer",
  "hourly_rate": 125.00
}
```

#### **Material** (item_type = 'material')
```json
{
  "unit_type": "m²",
  "cost_rate": 45.00
}
```

#### **Expense** (item_type = 'expense')
```json
{
  "cost_type": "fixed",
  "default_cost": 500.00
}
```

---

## 2. Invoice Line Items Table

### Schema: `invoice_items` (or `line_items`)

```sql
CREATE TABLE invoice_items (
    -- Identity
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id          UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    
    -- Catalog Reference (CRITICAL)
    catalog_item_id     UUID REFERENCES catalog_items(id) ON DELETE SET NULL,
    
    -- Line Item Fields (Synced from Catalog)
    service_name        VARCHAR(255) NOT NULL,
    description         TEXT,
    item_type           VARCHAR(50) NOT NULL,
    
    -- Quantity & Pricing
    quantity            DECIMAL(10, 2) NOT NULL DEFAULT 1,
    unit_type           VARCHAR(50) NOT NULL,
    unit_price          DECIMAL(10, 2) NOT NULL,
    
    -- Pricing Lock Info
    price_locked        BOOLEAN DEFAULT false,
    price_lock_note     TEXT,
    
    -- Tax
    item_tax_rate       DECIMAL(5, 2) DEFAULT 0.00,
    item_tax_amount     DECIMAL(10, 2) DEFAULT 0.00,
    
    -- Totals
    total_price         DECIMAL(10, 2) NOT NULL,
    
    -- Type-Specific Metadata (preserved from catalog)
    type_specific_data  JSONB,
    
    -- Audit
    created_at          TIMESTAMP DEFAULT NOW(),
    updated_at          TIMESTAMP DEFAULT NOW(),
    
    -- Indexes
    INDEX idx_invoice_id (invoice_id),
    INDEX idx_catalog_item (catalog_item_id)
);
```

### Key Design Decisions

1. **Foreign Key with SET NULL**: If catalog item is deleted, `catalog_item_id` becomes NULL but line item data is preserved
2. **Data Denormalization**: Invoice line items store a snapshot of catalog data at time of creation
3. **Traceability**: `catalog_item_id` allows tracking usage and preventing deletion of used items

---

## 3. Tax Categories Mapping

Tax categories in `catalog_items.tax_category` map to rates:

| Category   | Default Rate | Description                |
|------------|--------------|----------------------------|
| `standard` | 10%          | Standard tax rate          |
| `reduced`  | 5%           | Reduced tax rate           |
| `zero`     | 0%           | Zero-rated (taxable @ 0%)  |
| `exempt`   | 0%           | Tax-exempt (not taxable)   |

**Implementation**:
```javascript
const TAX_CATEGORY_RATES = {
    'standard': 10,
    'reduced': 5,
    'zero': 0,
    'exempt': 0
};
```

---

## 4. Usage Tracking Logic

### Incrementing Usage Count

When an invoice line item is created/saved:

```sql
-- Trigger or application logic
UPDATE catalog_items 
SET 
    usage_count = usage_count + 1,
    last_used_date = NOW()
WHERE id = :catalog_item_id;
```

### Checking Usage Before Deletion

```sql
-- Query to check if item can be deleted
SELECT 
    c.id,
    c.name,
    c.usage_count,
    COUNT(DISTINCT i.id) as active_invoice_count
FROM catalog_items c
LEFT JOIN invoice_items ii ON ii.catalog_item_id = c.id
LEFT JOIN invoices i ON i.id = ii.invoice_id
WHERE c.id = :item_id
GROUP BY c.id;

-- Cannot delete if active_invoice_count > 0
```

---

## 5. Price Lock Enforcement

### Database Constraints

```sql
-- Trigger to prevent rate changes on locked items
CREATE OR REPLACE FUNCTION prevent_price_change_on_locked()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.price_locked = true AND NEW.default_rate != OLD.default_rate THEN
        RAISE EXCEPTION 'Cannot change default_rate: Item pricing is locked';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_price_lock_before_update
    BEFORE UPDATE ON catalog_items
    FOR EACH ROW
    EXECUTE FUNCTION prevent_price_change_on_locked();
```

### Application-Level Validation

See `ItemPermissionsService.validateRateChange()` for frontend validation.

---

## 6. Data Migration Notes

### Migrating from Legacy Schema

If you have separate `services` and `products` tables:

```sql
-- Migrate services to unified catalog
INSERT INTO catalog_items (
    id, user_id, name, item_type, description, 
    default_unit, default_rate, tax_category, is_active,
    unit_price, unit_of_measure, service_type, category, tags, created_at
)
SELECT 
    id,
    user_id,
    name,
    'service' AS item_type,
    description,
    COALESCE(unit_of_measure, 'hour') AS default_unit,
    COALESCE(unit_price, 0) AS default_rate,
    'standard' AS tax_category,
    is_active,
    unit_price,
    unit_of_measure,
    service_type,
    category,
    tags,
    created_at
FROM services;

-- Migrate products to unified catalog
INSERT INTO catalog_items (
    id, user_id, name, item_type, description,
    default_unit, default_rate, tax_category, is_active,
    type_specific_data, created_at
)
SELECT 
    id,
    user_id,
    name,
    'product' AS item_type,
    description,
    COALESCE(unit, 'each') AS default_unit,
    COALESCE(price, 0) AS default_rate,
    'standard' AS tax_category,
    is_active,
    jsonb_build_object(
        'sku', sku,
        'unit', unit,
        'price', price
    ) AS type_specific_data,
    created_at
FROM products;
```

---

## 7. Critical Relationships

### Entity Relationship Diagram (ERD)

```
users (1) ──────── (M) catalog_items
                        │
                        │ catalog_item_id (FK)
                        │ ON DELETE SET NULL
                        │
                        └── (M) invoice_items
                                │
                                │ invoice_id (FK)
                                │
                        invoices (1) ──── (M) invoice_items
```

### Data Flow

1. **Catalog Creation**: User creates catalog item → Saved to `catalog_items`
2. **Invoice Creation**: User selects catalog item → Creates `invoice_items` row with `catalog_item_id`
3. **Usage Tracking**: Invoice saved → `catalog_items.usage_count` increments
4. **Deletion Prevention**: User tries to delete → Check `usage_count > 0` → Block or suggest archive

---

## 8. API Endpoints Alignment

### Required Backend Routes

```
GET    /api/catalog-items              # List all catalog items for user
POST   /api/catalog-items              # Create new catalog item
GET    /api/catalog-items/:id          # Get single catalog item
PUT    /api/catalog-items/:id          # Update catalog item
DELETE /api/catalog-items/:id          # Delete (check usage_count first)

GET    /api/catalog-items/:id/usage    # Get usage statistics
POST   /api/catalog-items/:id/lock     # Lock pricing
DELETE /api/catalog-items/:id/lock     # Unlock pricing
POST   /api/catalog-items/:id/archive  # Archive item (soft delete)

GET    /api/invoices/:id/items         # Get invoice line items
POST   /api/invoices/:id/items         # Add line item (increments usage_count)
```

### Example Request/Response

**POST /api/catalog-items**
```json
{
  "name": "Senior Developer Labor",
  "item_type": "labor",
  "description": "Full-stack development services",
  "default_unit": "hour",
  "default_rate": 150.00,
  "tax_category": "standard",
  "is_active": true,
  "price_locked": false,
  "type_specific_data": {
    "role": "Senior Developer",
    "hourly_rate": 150.00
  }
}
```

**Response**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "123e4567-e89b-12d3-a456-426614174000",
  "name": "Senior Developer Labor",
  "item_type": "labor",
  "default_unit": "hour",
  "default_rate": 150.00,
  "tax_category": "standard",
  "price_locked": false,
  "usage_count": 0,
  "created_at": "2026-02-06T10:30:00Z"
}
```

---

## 9. Index Strategy

For optimal performance:

```sql
-- Catalog item lookups
CREATE INDEX idx_catalog_user_active ON catalog_items(user_id, is_active);
CREATE INDEX idx_catalog_item_type ON catalog_items(item_type);
CREATE INDEX idx_catalog_usage ON catalog_items(usage_count DESC);

-- Category filtering
CREATE INDEX idx_catalog_category ON catalog_items(category) WHERE category IS NOT NULL;

-- Full-text search
CREATE INDEX idx_catalog_name_search ON catalog_items USING gin(to_tsvector('english', name || ' ' || COALESCE(description, '')));

-- Invoice item lookups
CREATE INDEX idx_invoice_items_catalog ON invoice_items(catalog_item_id) WHERE catalog_item_id IS NOT NULL;
CREATE INDEX idx_invoice_items_invoice ON invoice_items(invoice_id);
```

---

## 10. Validation Rules

### Frontend → Backend Alignment

| Field            | Validation                                      | Error Message                              |
|------------------|-------------------------------------------------|--------------------------------------------|
| `name`           | Required, 1-255 chars                           | "Item name is required"                    |
| `item_type`      | Required, enum validation                       | "Item type must be one of: service, product, labor, material, expense" |
| `default_unit`   | Required, 1-50 chars                            | "Default unit is required"                 |
| `default_rate`   | Required, >= 0                                  | "Default rate must be 0 or greater"        |
| `tax_category`   | Optional, enum validation                       | "Tax category must be: standard, reduced, zero, or exempt" |
| `usage_count`    | Read-only, managed by system                    | N/A                                        |
| `price_locked`   | Boolean, if true prevents rate changes          | "Cannot change rate: pricing is locked"    |

---

## 11. Security Considerations

### Row-Level Security (RLS) - PostgreSQL Example

```sql
-- Enable RLS
ALTER TABLE catalog_items ENABLE ROW LEVEL SECURITY;

-- Users can only see their own items
CREATE POLICY catalog_items_select_policy ON catalog_items
    FOR SELECT
    USING (user_id = current_user_id());

-- Users can only modify their own items
CREATE POLICY catalog_items_update_policy ON catalog_items
    FOR UPDATE
    USING (user_id = current_user_id());

-- Prevent deletion of used items
CREATE POLICY catalog_items_delete_policy ON catalog_items
    FOR DELETE
    USING (user_id = current_user_id() AND usage_count = 0);
```

---

## 12. Performance Considerations

### Estimated Table Sizes

| Users | Avg Items/User | Total Rows | Table Size (Est) |
|-------|----------------|------------|------------------|
| 1,000 | 50             | 50,000     | ~25 MB           |
| 10,000| 50             | 500,000    | ~250 MB          |
| 100,000| 50            | 5,000,000  | ~2.5 GB          |

### Query Optimization

```sql
-- Efficient user catalog lookup (uses idx_catalog_user_active)
SELECT * FROM catalog_items 
WHERE user_id = :user_id AND is_active = true
ORDER BY name ASC;

-- Most used items (uses idx_catalog_usage)
SELECT * FROM catalog_items
WHERE user_id = :user_id
ORDER BY usage_count DESC
LIMIT 10;

-- Usage count with invoice details
SELECT 
    c.id,
    c.name,
    c.usage_count,
    COUNT(DISTINCT ii.id) as line_item_count,
    COUNT(DISTINCT i.id) as invoice_count
FROM catalog_items c
LEFT JOIN invoice_items ii ON ii.catalog_item_id = c.id
LEFT JOIN invoices i ON i.id = ii.invoice_id
WHERE c.user_id = :user_id
GROUP BY c.id
ORDER BY c.usage_count DESC;
```

---

## Summary

### Key Takeaways for Backend Development

1. ✅ **Single Source of Truth**: `catalog_items` table stores all inventory types
2. ✅ **Mandatory Fields**: `name`, `item_type`, `default_unit`, `default_rate` are required
3. ✅ **Foreign Key Reference**: Invoices use `catalog_item_id`, not free text
4. ✅ **Usage Tracking**: `usage_count` prevents deletion of used items
5. ✅ **Price Lock**: `price_locked` prevents accidental rate changes
6. ✅ **Type Safety**: `item_type` enum ensures data integrity
7. ✅ **Soft Delete**: Use `is_active = false` or `archived_at` instead of hard delete

### Implementation Checklist

- [ ] Create `catalog_items` table with all base fields
- [ ] Create `invoice_items` table with `catalog_item_id` FK
- [ ] Add triggers for usage_count increment
- [ ] Add validation for price_locked updates
- [ ] Implement RLS policies for multi-tenant security
- [ ] Create indexes for performance
- [ ] Migrate legacy services/products data
- [ ] Update API endpoints to use new schema
- [ ] Test deletion prevention logic
- [ ] Deploy and verify with frontend integration

---

**Document Version**: 1.0  
**Last Updated**: February 6, 2026  
**Related**: UNIFIED_CATALOG_SYSTEM.md, INDUSTRY_PRESETS_GUIDE.md
