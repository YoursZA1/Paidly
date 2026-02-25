# Database Quick Reference Guide

## Quick Access to Clients, Services, and Products

### Import Entities

```javascript
import { Client, Service } from "@/api/entities";
```

### Clients

#### Create a Client
```javascript
const client = await Client.create({
  name: "Acme Corp",
  email: "contact@acme.com",
  phone: "+1-555-0123",
  address: "123 Main St",
  contact_person: "John Doe",
  website: "https://acme.com",
  tax_id: "TAX-123",
  industry: "technology",
  payment_terms: "net_30",
  payment_terms_days: 30
});
```

#### List All Clients
```javascript
const clients = await Client.list("-created_date"); // Sorted by newest first
```

#### Get a Client by ID
```javascript
const client = await Client.get(clientId);
```

#### Update a Client
```javascript
await Client.update(clientId, {
  email: "newemail@acme.com",
  phone: "+1-555-9999"
});
```

#### Delete a Client
```javascript
await Client.delete(clientId);
```

### Services/Products (Unified Catalog)

#### Create a Service
```javascript
const service = await Service.create({
  name: "Web Development",
  item_type: "service",
  default_unit: "hour",
  default_rate: 150.00,
  billing_unit: "hour",
  rate: 150.00,
  description: "Professional web development",
  category: "Development",
  tax_category: "standard",
  is_active: true
});
```

#### Create a Product
```javascript
const product = await Service.create({
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

#### Create Labor
```javascript
const labor = await Service.create({
  name: "Senior Developer",
  item_type: "labor",
  default_unit: "hour",
  default_rate: 125.00,
  role: "Senior Developer",
  hourly_rate: 125.00,
  description: "Senior software developer",
  category: "Labor",
  tax_category: "standard",
  is_active: true
});
```

#### Create Material
```javascript
const material = await Service.create({
  name: "Concrete Mix",
  item_type: "material",
  default_unit: "kg",
  default_rate: 45.00,
  unit_type: "kg",
  cost_rate: 45.00,
  description: "Premium concrete mix",
  category: "Materials",
  tax_category: "standard",
  is_active: true
});
```

#### Create Expense
```javascript
const expense = await Service.create({
  name: "Travel Expenses",
  item_type: "expense",
  default_unit: "trip",
  default_rate: 500.00,
  cost_type: "fixed",
  default_cost: 500.00,
  description: "Standard travel expenses",
  category: "Expenses",
  tax_category: "standard",
  is_active: true
});
```

#### List All Services/Products
```javascript
const items = await Service.list("-created_date");
```

#### Filter by Type
```javascript
const allItems = await Service.list();
const products = allItems.filter(item => item.item_type === 'product');
const services = allItems.filter(item => item.item_type === 'service');
const activeItems = allItems.filter(item => item.is_active);
```

#### Search by Name
```javascript
const items = await Service.list();
const filtered = items.filter(item => 
  item.name.toLowerCase().includes('laptop')
);
```

#### Update a Service/Product
```javascript
await Service.update(itemId, {
  default_rate: 175.00,
  rate: 175.00,
  is_active: false
});
```

#### Delete a Service/Product
```javascript
await Service.delete(itemId);
```

## Common Patterns

### Get Active Products Only
```javascript
const allItems = await Service.list();
const activeProducts = allItems.filter(item => 
  item.item_type === 'product' && item.is_active
);
```

### Get Services by Category
```javascript
const allItems = await Service.list();
const developmentServices = allItems.filter(item => 
  item.item_type === 'service' && item.category === 'Development'
);
```

### Get Clients by Industry
```javascript
const clients = await Client.list();
const techClients = clients.filter(client => 
  client.industry === 'technology'
);
```

### Create Invoice with Client and Services
```javascript
import { Invoice, Client, Service } from "@/api/entities";

// Get client and services
const client = await Client.get(clientId);
const services = await Service.list();
const selectedServices = services.filter(s => selectedIds.includes(s.id));

// Create invoice with items
const invoice = await Invoice.create({
  client_id: client.id,
  project_title: "Website Redesign",
  items: selectedServices.map(service => ({
    service_name: service.name,
    description: service.description,
    quantity: 1,
    unit_price: service.default_rate,
    total_price: service.default_rate
  })),
  subtotal: selectedServices.reduce((sum, s) => sum + s.default_rate, 0),
  tax_rate: 10,
  tax_amount: subtotal * 0.10,
  total_amount: subtotal * 1.10,
  status: 'draft'
});
```

## Field Reference

### Client Fields
- `id` - UUID (auto-generated)
- `org_id` - UUID (auto-set from user's membership)
- `name` - Text (required)
- `email` - Text
- `phone` - Text
- `address` - Text
- `contact_person` - Text
- `website` - Text
- `tax_id` - Text
- `fax` - Text
- `alternate_email` - Text
- `notes` - Text
- `internal_notes` - Text
- `industry` - Text
- `payment_terms` - Text (default: 'net_30')
- `payment_terms_days` - Integer (default: 30)
- `follow_up_enabled` - Boolean (default: true)
- `created_at` - Timestamp (auto-set)
- `updated_at` - Timestamp (auto-updated)

### Service/Product Fields (Base)
- `id` - UUID (auto-generated)
- `org_id` - UUID (auto-set from user's membership)
- `name` - Text (required)
- `description` - Text
- `item_type` - Enum: 'service', 'product', 'labor', 'material', 'expense' (required)
- `default_unit` - Text (required)
- `default_rate` - Numeric (required)
- `tax_category` - Enum: 'standard', 'reduced', 'zero', 'exempt'
- `is_active` - Boolean (default: true)
- `category` - Text
- `tags` - Text array
- `created_at` - Timestamp (auto-set)
- `updated_at` - Timestamp (auto-updated)

### Service-Specific Fields
- `billing_unit` - Text ('hour', 'day', 'session', etc.)
- `rate` - Numeric (synced with default_rate)

### Product-Specific Fields
- `sku` - Text
- `unit` - Text ('each', 'box', 'kg', etc.)
- `price` - Numeric (synced with default_rate)

### Labor-Specific Fields
- `role` - Text
- `hourly_rate` - Numeric (synced with default_rate)

### Material-Specific Fields
- `unit_type` - Text ('m²', 'kg', 'litres', etc.)
- `cost_rate` - Numeric (synced with default_rate)

### Expense-Specific Fields
- `cost_type` - Enum: 'fixed', 'variable'
- `default_cost` - Numeric (synced with default_rate)

## Notes

1. **Organization Filtering**: All queries automatically filter by `org_id` from the user's membership
2. **Auto-timestamps**: `created_at` and `updated_at` are automatically managed
3. **Backward Compatibility**: Legacy fields (`rate`, `unit`, `unit_price`) are preserved
4. **Type Safety**: Use `item_type` to distinguish between services, products, etc.
5. **Active Filtering**: Use `is_active` to filter out archived items
