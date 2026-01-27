# Inventory Manager — Full Project Context

> **Version:** 1.0  
> **Last Updated:** 2026-01-23  
> **Maintainer:** Sufiyaan Zafar

---

## 📋 Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Diagram](#2-architecture-diagram)
3. [Technology Stack](#3-technology-stack)
4. [Directory Structure](#4-directory-structure)
5. [Database Schema](#5-database-schema)
6. [API Structure](#6-api-structure)
7. [Frontend Structure](#7-frontend-structure)
8. [Security Model](#8-security-model)
9. [Business Logic Highlights](#9-business-logic-highlights)
10. [Scheduled Jobs](#10-scheduled-jobs)
11. [Third-Party Integrations](#11-third-party-integrations)
12. [Development Setup](#12-development-setup)
13. [Deployment Guide](#13-deployment-guide)
14. [File Reference](#14-file-reference)

---

## 1. Project Overview

**Inventory Manager** is a full-stack inventory management system designed for retail businesses. It supports:

- **Multi-location inventory** (Warehouse, Store, External/FBA)
- **Batch tracking** with expiry dates and FIFO logic
- **Purchase order lifecycle** (Draft → Placed → Received)
- **Point-of-Sale (POS)** with profit tracking
- **Multi-channel sales** (In-store + Amazon/Flipkart webhooks)
- **Role-based access control** (Owner, Manager, Employee, IT Admin, Customer)
- **Data science features** (ABC Analysis, Market Basket, Customer Segmentation)
- **Automated alerts** (Low stock, Shelf restock, Expiry warnings)

### Project Components

| Component | Purpose | Tech |
|-----------|---------|------|
| **Inventory_Manager_APIs** | Backend REST API | Python + FastAPI |
| **Inventory_Manager_Desktop** | Desktop Web App | React + TypeScript + MUI |
| *(Planned)* Mobile App | Mobile client | To be audited |

---

## 2. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND CLIENTS                          │
├─────────────────────────────────────────────────────────────────┤
│  Desktop App (React)          │  Mobile App (Planned)            │
│  localhost:5173               │  Expo/React Native                │
└───────────────┬───────────────┴───────────────┬──────────────────┘
                │                               │
                │         HTTP/REST             │
                ▼                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                        FastAPI BACKEND                           │
│                      localhost:8000                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │ Users   │ │Products │ │Inventory│ │ Sales   │ │Purchases│   │
│  │ Router  │ │ Router  │ │ Router  │ │ Router  │ │ Router  │   │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘   │
│       │           │           │           │           │         │
│  ┌────┴───────────┴───────────┴───────────┴───────────┴────┐   │
│  │                    security.py                           │   │
│  │         (JWT Auth, RBAC, Audit Logging)                  │   │
│  └──────────────────────────┬───────────────────────────────┘   │
└─────────────────────────────┼───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      PostgreSQL Database                         │
│                  Docker: inventory-db:5432                       │
├─────────────────────────────────────────────────────────────────┤
│  users, roles, user_roles, products, suppliers, locations,      │
│  inventory_batches, sales_orders, sales_order_items,            │
│  purchase_orders, purchase_order_items, stock_write_offs,       │
│  system_alerts, audit_logs, operations_log, product_suppliers   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     External Integrations                        │
├─────────────────────────────────────────────────────────────────┤
│  Amazon/Flipkart Webhooks (X-Api-Key auth)                       │
│  POST /api/v1/integrations/webhook/order                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Technology Stack

### Backend (Inventory_Manager_APIs)

| Category | Technology | Version |
|----------|------------|---------|
| Framework | FastAPI | 0.120.0 |
| Database | PostgreSQL | 15 (Alpine) |
| ORM | psycopg2-binary + SQLAlchemy | 2.9.11 / 2.0.44 |
| Auth | python-jose (JWT) + passlib (bcrypt) | 3.5.0 / 1.7.4 |
| Scheduler | APScheduler | 3.11.2 |
| PDF Generation | ReportLab | 4.4.5 |
| Data Science | pandas, scikit-learn, mlxtend | Latest |
| Containerization | Docker Compose | 3.8 |

### Frontend (Inventory_Manager_Desktop)

| Category | Technology | Version |
|----------|------------|---------|
| Framework | React | 19.2.0 |
| Language | TypeScript | 5.9.3 |
| UI Library | Material-UI (MUI) | 7.3.5 |
| Data Grid | MUI X Data Grid | 8.20.0 |
| Date Picker | MUI X Date Pickers | 8.21.0 |
| Charts | Recharts | 3.5.0 |
| State Management | Zustand | 5.0.8 |
| HTTP Client | Axios | 1.13.2 |
| Build Tool | Vite | 7.2.4 |
| Routing | React Router DOM | 7.9.6 |

---

## 4. Directory Structure

```
Inventory_Manager/
├── Inventory_Manager_APIs/         # Backend
│   ├── main.py                     # FastAPI app entry point
│   ├── security.py                 # Auth, RBAC, audit logging
│   ├── requirements.txt            # Python dependencies
│   ├── docker-compose.yml          # PostgreSQL container
│   ├── .env                        # Environment variables
│   ├── migrate_db_full.py          # Database migration script
│   ├── generate_full_data.py       # Test data generator
│   ├── routers/                    # API route modules
│   │   ├── products.py
│   │   ├── suppliers.py
│   │   ├── locations.py
│   │   ├── inventory.py
│   │   ├── sales.py
│   │   ├── purchases.py
│   │   ├── users.py
│   │   ├── analytics.py
│   │   ├── analysis.py             # Data science endpoints
│   │   ├── reports.py
│   │   ├── system.py
│   │   └── integrations.py         # External webhooks
│   └── backups/                    # Database backup files
│
├── Inventory_Manager_Desktop/      # Frontend
│   ├── package.json
│   ├── vite.config.ts
│   ├── src/
│   │   ├── main.tsx                # React entry point
│   │   ├── App.tsx                 # Routes & layout
│   │   ├── theme.ts                # MUI theme config
│   │   ├── api/
│   │   │   └── client.ts           # Axios instance
│   │   ├── store/
│   │   │   └── authStore.ts        # Zustand auth state
│   │   ├── services/               # API service layers
│   │   │   ├── inventoryService.ts
│   │   │   ├── salesService.ts
│   │   │   ├── purchaseService.ts
│   │   │   ├── analyticsService.ts
│   │   │   ├── systemService.ts
│   │   │   └── ...
│   │   ├── pages/                  # Main page components
│   │   │   ├── DashboardHome.tsx
│   │   │   ├── InventoryPage.tsx
│   │   │   ├── CatalogPage.tsx
│   │   │   ├── OrdersPage.tsx
│   │   │   ├── SalesHistoryPage.tsx
│   │   │   ├── StockAlertsPage.tsx
│   │   │   ├── AnalyticsPage.tsx
│   │   │   ├── DataSciencePage.tsx
│   │   │   ├── ReportPage.tsx
│   │   │   ├── SystemPage.tsx
│   │   │   ├── UserManagementPage.tsx
│   │   │   └── ...
│   │   └── components/             # Reusable components
│   │       ├── Layout.tsx
│   │       ├── LoginScreen.tsx
│   │       ├── ProductTable.tsx
│   │       ├── BulkRestockDialog.tsx
│   │       ├── CreateOrderDialog.tsx
│   │       └── ... (33 total)
│
└── master_feature_list.md          # Feature audit document
```

---

## 5. Database Schema

### Core Tables

```sql
-- Users & Authentication
users (id, username, email, password_hash, phone_number, is_active, created_at)
roles (id, name, description)
user_roles (user_id, role_id)

-- Products & Suppliers
products (id, sku, name, selling_price, average_cost, category, unit_of_measure, supplier_id, created_at)
suppliers (id, name, location, contact_person, phone_number, email, created_at)
product_suppliers (id, product_id, supplier_id, supply_price, supplier_sku, is_preferred)

-- Locations
locations (id, name, description, location_type, created_at)
-- location_type: 'warehouse' | 'store' | 'external'

-- Inventory
inventory_batches (id, product_id, location_id, batch_code, quantity, unit_cost, expiry_date, received_at)
stock_write_offs (id, batch_id, product_id, location_id, quantity_removed, reason, write_off_date, performed_by_user_id)

-- Sales
sales_orders (id, customer_name, customer_email, customer_phone, total_amount, sales_channel, 
              status, fulfillment_method, payment_method, payment_reference, external_order_id, 
              user_id, order_timestamp)
sales_order_items (id, order_id, product_id, quantity, unit_price, unit_cost)

-- Purchases
purchase_orders (id, supplier_id, status, total_amount, expected_date, notes, created_at)
purchase_order_items (id, purchase_order_id, product_id, quantity, unit_cost)

-- System
system_alerts (id, severity, message, is_resolved, status, user_id, created_at)
audit_logs (id, user_id, username, action, target_table, target_id, ip_address, details, timestamp)
operations_log (id, user_id, username, operation_type, sub_type, target_id, quantity, reason, 
                file_name, ip_address, details, timestamp)
```

### Key Relationships

```
products ──┬── inventory_batches (1:N)
           ├── product_suppliers (N:M with suppliers)
           ├── sales_order_items (1:N)
           └── purchase_order_items (1:N)

suppliers ──┬── products (legacy 1:N via supplier_id)
            └── product_suppliers (N:M with products)

locations ─── inventory_batches (1:N)

users ───┬── user_roles (N:M with roles)
         ├── sales_orders (1:N)
         ├── system_alerts (1:N)
         └── audit_logs (1:N)

sales_orders ─── sales_order_items (1:N)
purchase_orders ─── purchase_order_items (1:N)
```

### Important Columns

| Table | Column | Purpose |
|-------|--------|---------|
| products | `average_cost` | Weighted average cost (updated on receive) |
| sales_order_items | `unit_cost` | Cost snapshot at time of sale (for profit) |
| inventory_batches | `unit_cost` | Purchase cost for this specific batch |
| inventory_batches | `batch_code` | Unique identifier within product |
| sales_orders | `fulfillment_method` | 'in-store', 'FBA', 'FBM' |
| system_alerts | `status` | 'active', 'pending_user', 'resolved' |

---

## 6. API Structure

### Base URL
```
http://localhost:8000
```

### Router Prefixes

| Router | Prefix | Endpoints |
|--------|--------|-----------|
| Users | `/api/v1/users` or root | 9 |
| Products | `/api/v1/products` | 6 |
| Suppliers | `/api/v1/suppliers` | 10 |
| Locations | `/api/v1/locations` | 5 |
| Inventory | `/api/v1/inventory` | 8 |
| Sales | `/api/v1/sales` | 6 |
| Purchases | `/api/v1/purchases` | 9 |
| Reports | `/api/v1/reports` | 11 |
| Analytics | `/api/v1/analytics` | 7 |
| Analysis | `/api/v1/analysis` | 3 |
| System | `/api/v1/system` | 14 |
| Integrations | `/api/v1/integrations` | 1 |

### Key Endpoints

```python
# Authentication
POST /token                              # OAuth2 login → JWT

# Products
GET  /api/v1/products                    # List all (with stock totals)
POST /api/v1/products                    # Create (Manager)
GET  /api/v1/products/sku/{sku}          # Lookup by SKU

# Inventory Operations
POST /api/v1/inventory/receive           # Receive stock (Manager)
POST /api/v1/inventory/transfer          # Transfer between locations
POST /api/v1/inventory/write_off         # Write off damaged/expired
POST /api/v1/inventory/bulk/receive      # Bulk receive
POST /api/v1/inventory/bulk/transfer     # Bulk transfer

# Sales
POST /api/v1/sales/orders                # Create sale (auto-FIFO)
GET  /api/v1/sales/orders                # Sales history (paginated)
GET  /api/v1/sales/orders/{id}/pdf       # Download receipt

# Purchase Orders
POST /api/v1/purchases                   # Create PO
POST /api/v1/purchases/{id}/receive      # Receive PO → inventory
PUT  /api/v1/purchases/{id}/status       # Place/Cancel

# Reports (supports JSON/CSV/PDF)
GET  /api/v1/reports/stock_summary
GET  /api/v1/reports/low_stock_reorder
GET  /api/v1/reports/near_expiry
GET  /api/v1/reports/item_profitability

# Data Science
GET  /api/v1/analysis/market_basket      # Association rules
GET  /api/v1/analysis/abc_classification # ABC analysis
GET  /api/v1/analysis/customer_segments  # RFM segmentation

# System
POST /api/v1/system/backup               # Manual backup
GET  /api/v1/system/audit_logs           # Paginated audit log
GET  /api/v1/system/operations_logs      # Write-off/backup history

# External Webhook
POST /api/v1/integrations/webhook/order  # Amazon/Flipkart orders
```

---

## 7. Frontend Structure

### Route Map

| Path | Component | Role Required |
|------|-----------|---------------|
| `/login` | LoginScreen | None |
| `/` | DashboardRouter | Authenticated |
| `/products` | CatalogPage | Authenticated |
| `/inventory` | InventoryPage | Authenticated |
| `/sales` | BillingPage (POS) | Authenticated |
| `/sales/history` | SalesHistoryPage | Authenticated |
| `/orders` | OrdersPage (POs) | Authenticated |
| `/stock-alerts` | StockAlertsPage | Authenticated |
| `/analytics` | AnalyticsPage | Manager+ |
| `/datascience` | DataSciencePage | Manager+ |
| `/reports` | ReportPage | Authenticated |
| `/system` | SystemPage | IT Admin |
| `/users` | UserManagementPage | IT Admin |
| `/support` | SupportPage | Authenticated |

### State Management

```typescript
// store/authStore.ts (Zustand)
interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => void;
}
```

### API Client

```typescript
// api/client.ts
const BASE_URL = 'http://127.0.0.1:8000';
const client = axios.create({ baseURL: BASE_URL });
```

---

## 8. Security Model

### Authentication Flow

```
1. User submits username/password
2. POST /token (OAuth2 password flow)
3. Backend validates credentials
4. JWT token returned (60 min expiry)
5. Token stored in localStorage
6. All API calls include: Authorization: Bearer <token>
```

### Role Hierarchy

| Role | Level | Permissions |
|------|-------|-------------|
| **owner** | 5 | Full access + can manage managers |
| **it_admin** | 4 | User management, backups, audit logs |
| **manager** | 3 | Products, suppliers, receiving, write-offs, analytics |
| **employee** | 2 | Transfers, POS, basic reports, create PO drafts |
| **customer** | 1 | View own orders only |

### Security Features

- **Password hashing**: bcrypt (72-char limit)
- **JWT Algorithm**: HS256
- **Token expiry**: 60 minutes
- **Account blocking**: `is_active` flag checked on login
- **Owner protection**: Only owners can block/change managers
- **Audit logging**: All API access logged with IP address
- **Operations logging**: Write-offs and backups tracked separately

---

## 9. Business Logic Highlights

### FIFO Inventory Deduction

```python
# When selling: Deduct from oldest batches first
# Priority: Store → Warehouse (never External for in-store sales)
# For FBA orders: Deduct from External location
# For FBM orders: Warehouse → Store

ORDER BY received_at ASC, expiry_date ASC NULLS LAST
```

### Weighted Average Cost

```python
# On receiving new stock:
new_avg = (old_qty * old_avg + new_qty * new_cost) / (old_qty + new_qty)
products.average_cost = new_avg
```

### Profit Tracking

```python
# At time of sale, snapshot cost into sales_order_items:
sales_order_items.unit_cost = current_product.average_cost

# Profit = SUM(unit_price - unit_cost) * quantity
```

### Smart PO Merge

```python
# When creating PO for supplier with existing draft:
# → Merge items into existing draft instead of creating new PO
```

### Alert Auto-Resolution

```python
# Shelf Restock: Created when store < 5, resolved when store >= 5
# Low Stock: Created when total < 20, resolved when total >= 20
# Checked every 10 minutes by APScheduler
```

---

## 10. Scheduled Jobs

| Job | Trigger | Action |
|-----|---------|--------|
| Auto Backup | Daily @ 12:00 PM | Creates DB dump, deletes backups > 7 days |
| Shelf Restock Check | Every 10 min | Creates alerts for store stock < 5 |
| Low Stock Check | Every 10 min | Creates alerts for total stock < 20 |

```python
# Configuration in system.py
scheduler = BackgroundScheduler()
scheduler.add_job(run_auto_backup, 'cron', hour=12, minute=0)
scheduler.add_job(run_stock_checks, 'interval', minutes=10)
scheduler.start()
```

---

## 11. Third-Party Integrations

### Amazon/Flipkart Webhook

**Endpoint**: `POST /api/v1/integrations/webhook/order`

**Authentication**: `X-Api-Key` header (not JWT)

**Payload**:
```json
{
  "platform": "amazon",
  "order_id": "AMZ-12345",
  "fulfillment_method": "FBA",
  "customer_name": "John Doe",
  "total_amount": 1500.00,
  "items": [
    { "sku": "PROD-001", "quantity": 2, "price": 750.00 }
  ]
}
```

**Logic**:
- FBA orders: Deduct from `external` locations
- FBM orders: Deduct from `warehouse` → `store`
- Idempotent: Checks `external_order_id` before processing
- Records profit via `unit_cost` snapshot

---

## 12. Development Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- Docker Desktop

### Backend Setup

```bash
cd Inventory_Manager_APIs

# Start PostgreSQL
docker-compose up -d

# Create virtual environment
python -m venv venv
venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt

# Configure environment (create .env)
DB_NAME=postgres
DB_USER=postgres
DB_PASS=Merabadahai@202122
DB_HOST=localhost
DB_PORT=5432
SECRET_KEY=your-secret-key
DATABASE_URL=postgresql://postgres:Merabadahai@202122@localhost:5432/postgres

# Run migrations
python migrate_db_full.py

# (Optional) Generate test data
python generate_full_data.py

# Start server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Setup

```bash
cd Inventory_Manager_Desktop

# Install dependencies
npm install

# Start dev server
npm run dev
# Opens at http://localhost:5173
```

### Configuration

| File | Purpose |
|------|---------|
| `APIs/.env` | Database credentials, JWT secret |
| `Desktop/src/api/client.ts` | Backend URL (change for production) |

---

## 13. Deployment Guide

### Backend (Production)

```bash
# Use production WSGI server
pip install gunicorn
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000

# Or with Docker
docker build -t inventory-api .
docker run -p 8000:8000 --env-file .env inventory-api
```

### Frontend (Production)

```bash
# Build static files
npm run build

# Deploy dist/ folder to:
# - Nginx
# - Vercel
# - Netlify
# - S3 + CloudFront
```

### Database Backup

```bash
# Manual backup (via API)
POST /api/v1/system/backup

# Or via Docker
docker exec inventory-db pg_dump -U postgres postgres > backup.sql
```

---

## 14. File Reference

### Backend Key Files

| File | Purpose |
|------|---------|
| `main.py` | FastAPI app initialization, router registration |
| `security.py` | JWT auth, RBAC, audit/operation logging |
| `migrate_db_full.py` | Database schema migration |
| `routers/inventory.py` | Receive, transfer, write-off, bulk operations |
| `routers/sales.py` | POS, order history, FIFO deduction |
| `routers/purchases.py` | PO lifecycle |
| `routers/reports.py` | All report endpoints (PDF/CSV/JSON) |
| `routers/analysis.py` | Data science (ML) endpoints |
| `routers/system.py` | Backups, alerts, audit logs |

### Frontend Key Files

| File | Purpose |
|------|---------|
| `App.tsx` | Route definitions, auth protection |
| `store/authStore.ts` | Zustand state for auth |
| `services/*.ts` | API service layers |
| `pages/*.tsx` | Main page components |
| `components/*.tsx` | Reusable UI components |
| `theme.ts` | MUI theme customization |

---

## Quick Reference Card

```
┌─────────────────────────────────────────┐
│           QUICK COMMANDS                │
├─────────────────────────────────────────┤
│ Start DB:    docker-compose up -d       │
│ Start API:   uvicorn main:app --reload  │
│ Start Web:   npm run dev                │
│                                         │
│ API Docs:    http://localhost:8000/docs │
│ Web App:     http://localhost:5173      │
└─────────────────────────────────────────┘
```

---

*Document generated from codebase analysis.*  
*For feature-level details, see `master_feature_list.md`*
