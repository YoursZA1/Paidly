---
description: Repository Information Overview
alwaysApply: true
---

# InvoiceBreak App Information

## Repository Summary
InvoiceBreak App is a comprehensive invoice management system featuring a **React frontend** built with **Vite**, a **Node.js Express backend**, and **Supabase** for database, authentication, and storage services. The platform handles clients, services, invoices, quotes, and payments with support for PDF generation and billing integrations.

## Repository Structure
- **src/**: React frontend application including components, hooks, pages, and services.
- **server/**: Node.js Express server for handling server-side logic and webhooks.
- **supabase/**: Supabase configuration, PostgreSQL database schema, and Edge Functions.
- **docs/**: Detailed documentation covering data models, security, storage, and setup.
- **scripts/**: Utility scripts for database verification, schema management, and environment setup.
- **tests/**: Unit tests for the application using Vitest.

### Main Repository Components
- **Frontend (breakinvoice-app)**: User interface for managing invoicing workflows.
- **Backend (invoicebreek-server)**: Express-based API for specialized server-side tasks.
- **Database (Supabase)**: PostgreSQL-backed data store with RLS and storage buckets.

## Projects

### Frontend (breakinvoice-app)
**Configuration File**: [./package.json](./package.json)

#### Language & Runtime
**Language**: JavaScript (React 18)  
**Version**: Node.js (Vite 6)  
**Build System**: Vite  
**Package Manager**: npm

#### Dependencies
**Main Dependencies**:
- `@supabase/supabase-js`: Supabase integration
- `react-router-dom`: Routing
- `framer-motion`: Animations
- `lucide-react`: Icon set
- `shadcn/ui`: Component library (Radix UI based)
- `recharts`: Data visualization
- `zod` & `react-hook-form`: Form validation
- `xlsx`: Data export

**Development Dependencies**:
- `vitest`: Testing framework
- `tailwindcss`: Styling
- `eslint`: Linting

#### Build & Installation
```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

#### Testing
**Framework**: Vitest  
**Test Location**: [./tests/unit/](./tests/unit/)  
**Naming Convention**: `*.test.js`, `*.spec.js`  
**Configuration**: [./vitest.config.js](./vitest.config.js)

**Run Command**:
```bash
npm test
npm run test:run
```

---

### Backend (invoicebreek-server)
**Configuration File**: [./server/package.json](./server/package.json)

#### Language & Runtime
**Language**: JavaScript (Node.js)  
**Version**: Node.js (ES Modules)  
**Build System**: Node.js  
**Package Manager**: npm

#### Dependencies
**Main Dependencies**:
- `express`: Web framework
- `@supabase/supabase-js`: Supabase client
- `cors`: Cross-Origin Resource Sharing
- `dotenv`: Environment variable management

#### Build & Installation
```bash
# Navigate to server directory
cd server

# Install dependencies
npm install

# Run development server with watch mode
npm run dev
```

---

### Database & Cloud (Supabase)
**Type**: Infrastructure & Backend-as-a-Service

#### Specification & Tools
**Type**: Supabase / PostgreSQL  
**Version**: PostgreSQL 15+  
**Required Tools**: Supabase CLI

#### Key Resources
**Main Files**:
- [./supabase/schema.postgres.sql](./supabase/schema.postgres.sql): Database schema and RLS policies
- [./supabase/functions/billing-webhook/](./supabase/functions/billing-webhook/): Edge Functions
- [./scripts/create-storage-buckets.sql](./scripts/create-storage-buckets.sql): Storage configuration

#### Usage & Operations
**Key Commands**:
```bash
# Verify database setup
node scripts/verify-database-setup.js

# Verify Supabase config
node scripts/verify-supabase-config.js
```

#### Validation
**Quality Checks**: Manual SQL verification scripts in `scripts/`.  
**Testing Approach**: Database RLS testing via `test-rls-policies.sql`.
