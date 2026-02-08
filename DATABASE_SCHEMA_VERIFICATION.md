# Database Schema Verification Report

## Critical Finding: User Entity is Missing ❌

### Problem Summary
The admin dashboard attempts to fetch all users using `User.list()`, but **there is NO User entity in the database layer**. Instead:

```javascript
// src/api/entities.js (line 50)
export const User = breakApi.auth;  // ← This is the AUTH MANAGER, not a User data entity
```

The `breakApi.auth` is just the authentication system that stores the currently logged-in user in localStorage. It does NOT provide a way to query all users in the system.

### What's Missing

| Field | Purpose | Status | Impact |
|-------|---------|--------|--------|
| `User` Entity | Query all users in the system | ❌ MISSING | Admin dashboard crashes on `User.list()` |
| `user.created_at` | Track user signup date | ⚠️ PARTIAL | AuthManager has no created_at field |
| `user.status` | User account status (active/suspended) | ✅ Can add | AuthManager has status in login |
| `user.plan` | Subscription plan type | ✅ Present | AuthManager sets plan on login |
| `invoice.created_at` | Invoice creation timestamp | ❌ WRONG FIELD | Code uses `created_date` not `created_at` |
| `invoice.user_id` | Link invoice to user | ✅ Code expects it | Need to verify in Invoice entity |
| `subscription.status` | Current subscription status | ❌ MISSING ENTITY | No separate Subscription table |
| `subscription.plan` | Subscription plan | ⚠️ PARTIAL | Lives on User entity, not separate |

### Current AuthManager Fields
```javascript
{
  id: '1',                           // User ID
  email: string,                     // Email address
  role: 'admin' | 'user',            // Role
  full_name: string,                 // Display name
  company_name: string,              // Company
  company_address: string,           // Address
  currency: string,                  // Currency code
  timezone: string,                  // Timezone
  logo_url: string,                  // Logo URL
  plan: string                       // Plan type
  // MISSING: created_at, status, display_name, updated_at, plan_history, previously_trial
}
```

### Dashboard Calculation Issues

The dashboard code expects these fields that DON'T EXIST:

1. **Admin Stats** - Tries to fetch `User.list()` → **Will fail**
2. **Growth Stats** - Uses `u.created_at` → **Will be undefined**
3. **Financial Metrics** - Uses `u.subscription_amount` → **Will be undefined**
4. **Activity Logs** - Uses `u.suspension_reason`, `u.plan_history` → **Will be undefined**

### What's Working

✅ **Invoice Data**: Invoice entity exists and has:
- `total_amount` - Invoice total
- `status` - Invoice status (paid, unpaid, etc.)
- `created_date` - Invoice creation date (NOTE: uses `created_date` not `created_at`)
- `user_id` - Link to user (expected)

### Solutions Needed

**Option 1: Create a User Entity** (RECOMMENDED)
```javascript
// Add to customClient.js createEntities()
const entityNames = [
  'User',  // ← ADD THIS
  'Client',
  // ... rest of entities
];
```

Then add User fields in bulk import or API:
```javascript
// User entity should have:
{
  id: string,
  email: string,
  full_name: string,
  display_name: string,
  role: string,
  status: 'active' | 'suspended' | 'trial' | 'cancelled',
  plan: string,
  created_at: ISO 8601 timestamp,  // ← CRITICAL
  updated_at: ISO 8601 timestamp,
  subscription_amount: number,
  plan_history: array,
  previously_trial: boolean,
  suspension_reason: string
}
```

**Option 2: Load Users from CSV/Excel**
```javascript
// Create /src/data/users.js with sample data
export const mockUsers = [
  {
    id: '1',
    email: 'user1@example.com',
    full_name: 'John Doe',
    created_at: '2024-01-15T10:00:00Z',
    status: 'active',
    plan: 'premium',
    // ... rest of fields
  },
  // ... more users
];
```

**Option 3: Use a Backend API**
```javascript
// Create a real backend endpoint
const response = await fetch('/api/users');
const allUsers = await response.json();
```

### Field Name Discrepancies

⚠️ **Invoice Date Field**:
- Dashboard code uses: `inv.created_date`
- Standard convention: `created_at`
- **Action**: Verify which field actually exists in Invoice entity

### Recommendation

**The dashboard metrics are currently FAKE/SIMULATED.** They won't show real data until:

1. ✅ A proper User entity is created with all required fields
2. ✅ Users are imported/synced to the database
3. ✅ Field names are standardized (created_at not created_date)
4. ✅ Dashboard calculations are updated to use real data

**Without this, the admin dashboard displays meaningless numbers.**

---

## Next Steps

1. [ ] Create User entity in database layer
2. [ ] Add User to customClient.js
3. [ ] Import or create test user data
4. [ ] Standardize date field names (created_at vs created_date)
5. [ ] Test User.list() returns real data
6. [ ] Verify dashboard metrics calculate correctly
