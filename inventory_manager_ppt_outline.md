# Inventory Manager — Presentation Outline

> **Prepared for:** PPT / Slide Deck  
> **Project:** Inventory Manager (Full-Stack)  
> **Author:** Sufiyaan Zafar  

---

## Slide 1 — Title Slide

- **Title:** Inventory Manager
- **Subtitle:** A Full-Stack, Multi-Platform Inventory & Retail Management System
- **Tagline:** "End-to-end inventory control — from warehouse to customer, desktop to mobile"
- **Components:** Backend APIs · Desktop App · Mobile PWA

---

## Slide 2 — Problem Statement

- Manual inventory tracking leads to errors, stock-outs, and lost revenue
- Lack of real-time visibility across multiple storage locations
- No integration between purchasing, sales, and inventory operations
- Difficulty tracking profitability at the product level
- No automated alerts for low stock, expiring items, or shelf restocking

---

## Slide 3 — Solution Overview

- **Unified platform** covering the entire inventory lifecycle
- **Multi-location tracking** — Warehouse, Store, External (FBA)
- **Batch-level control** with expiry dates and FIFO logic
- **Role-based access** for Owner, Manager, Employee, IT Admin, and Customer
- **Multi-channel sales** — In-store POS + Amazon/Flipkart webhooks
- **Cross-platform** — Desktop web app + Mobile PWA with barcode scanning

---

## Slide 4 — System Architecture

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  Desktop App │   │  Mobile PWA  │   │  Marketplace │
│  (React/MUI) │   │ (Capacitor)  │   │  Webhooks    │
└──────┬───────┘   └──────┬───────┘   └──────┬───────┘
       │                  │                  │
       └──────────┬───────┴──────────────────┘
                  │ REST API + WebSocket
                  ▼
        ┌─────────────────┐
        │  FastAPI Backend │
        │  (~100+ endpoints)│
        │  19 Router Modules│
        └────────┬────────┘
                 │
        ┌────────▼────────┐
        │   PostgreSQL    │
        │   (Docker)      │
        └─────────────────┘
```

- **Backend:** Python + FastAPI (19 routers, ~100+ REST endpoints)
- **Desktop:** React 19 + TypeScript + Material-UI (MUI)
- **Mobile/PWA:** React + TypeScript + Capacitor (Android APK)
- **Database:** PostgreSQL 15 (Docker)
- **Real-time:** WebSocket for barcode scanner communication

---

## Slide 5 — Technology Stack

| Layer | Technology |
|-------|-----------|
| **Backend Framework** | FastAPI (Python) |
| **Database** | PostgreSQL 15 (Docker Compose) |
| **ORM / DB Access** | psycopg2 + SQLAlchemy |
| **Authentication** | JWT (OAuth2 password flow) + bcrypt |
| **Scheduler** | APScheduler (auto-backup, stock checks) |
| **PDF Generation** | ReportLab (A4 GST invoices, reports) |
| **Data Science** | pandas, scikit-learn, mlxtend |
| **Frontend Framework** | React 19 + TypeScript |
| **UI Library** | Material-UI (MUI) v7 + MUI X Data Grid |
| **Charts** | Recharts |
| **State Management** | Zustand |
| **Build Tool** | Vite |
| **Mobile** | Capacitor (PWA → Android APK) |

---

## Slide 6 — User Roles & Access Control

| Feature Area | Employee | Manager | IT Admin | Owner |
|-------------|----------|---------|----------|-------|
| View Products & Stock | ✅ | ✅ | ✅ | ✅ |
| Transfer Stock | ✅ | ✅ | ✅ | ✅ |
| Create Sales / POS | ✅ | ✅ | ✅ | ✅ |
| Create Products | ❌ | ✅ | ❌ | ✅ |
| Receive Stock / Write-Off | ❌ | ✅ | ❌ | ✅ |
| Analytics & Profitability | ❌ | ✅ | ❌ | ✅ |
| User Management | ❌ | ❌ | ✅ | ✅ |
| Backup & Restore | ❌ | ❌ | ✅ | ✅ |
| Block Managers | ❌ | ❌ | ❌ | ✅ |

- **5-tier hierarchy:** Owner → IT Admin → Manager → Employee → Customer
- **JWT tokens** with role claims (60-min expiry)
- **Owner protection:** Only owners can manage managers

---

## Slide 7 — Core Feature: Product & Supplier Management

- **Product CRUD** — Create, update, delete products with SKU uniqueness validation
- **Supplier CRUD** — Manage supplier contacts, emails, locations
- **Product–Supplier Linking** — Many-to-many relationships with supply price per link
- **Preferred Supplier** — Mark preferred supplier per product for quick reordering
- **Barcode Support** — Products linked to physical barcodes for scanning
- **Catalog View** — Browse products with stock levels, pricing, and "Add to PO" action

---

## Slide 8 — Core Feature: Multi-Location Inventory

- **Location Types:** Warehouse, Store, External (FBA)
- **Batch Tracking** — Each stock receipt creates a batch with:
  - Unique batch code (auto-generated)
  - Unit cost, expiry date, received timestamp
- **Stock Operations:**
  - 📥 **Receive** — Single or bulk receive into warehouse
  - 🔄 **Transfer** — Move stock between locations (FIFO-based)
  - 🗑️ **Write-Off** — Damaged, expired, lost stock with reason tracking
- **Weighted Average Cost** — Automatically recalculated on each receive
- **FIFO Logic** — Oldest batches deducted first (by `received_at`)

---

## Slide 9 — Core Feature: Point of Sale (POS) & Billing

- **In-Store Sales** — Create orders with auto FIFO stock deduction
- **Payment Methods:** Cash, Card, UPI
- **Customer Linking** — Associate sales with loyalty customers by phone lookup
- **Profit Tracking** — Cost snapshot at time of sale (`unit_cost` recorded per line item)
- **Receipt PDF** — Generate downloadable receipt for each order
- **Sales History** — Paginated, searchable, filterable order history
- **Export** — Sales list PDF export with filters
- **Barcode Scanning at Checkout** — Scan items directly into the billing page via WebSocket

---

## Slide 10 — Core Feature: Purchase Order Management

- **Full Lifecycle:** Draft → Placed → Received (or Cancelled)
- **Smart Merge:** Adding items for same supplier auto-merges into existing draft PO
- **Item Management:** Add/remove items, quantity updates, auto-recalculate totals
- **Receive PO:** Converts PO items into inventory batches automatically
- **Draft Check:** Quick lookup of active drafts per supplier
- **"Add to PO" from Catalog:** One-click add from product catalog to draft PO

---

## Slide 11 — Feature: B2B Wholesale Management

- **B2B Client Management** — Full CRUD with credit limits, GSTIN, price tiers
- **B2B Orders** — Wholesale orders with per-client pricing and margin tracking
- **Credit System:**
  - Per-client credit limits
  - Balance tracking (amount owed vs. paid)
  - Auto-block when exceeding credit limit
- **B2B Dashboard:**
  - Total amount to collect
  - Clients over credit limit
  - Top debtors list
- **Frequent Items** — Show client's frequently purchased items with last-sold price
- **B2B Invoice PDF** — A4 GST-compliant invoice generation

---

## Slide 12 — Feature: Khata (B2C Credit Ledger)

- **Customer Credit Accounts** — Name, phone, credit limit, running balance
- **Transaction Ledger** — Complete history of credits and payments per customer
- **Payment Recording** — Cash, UPI, or card payments with reference tracking
- **Auto-Blocking** — Customers exceeding credit limit are automatically blocked
- **Khata Dashboard:**
  - Total credit outstanding
  - Customers with balance, over-limit, near-limit, blocked
- **POS Integration** — Phone lookup at checkout to check credit eligibility
- **WhatsApp Reminders** — Send payment reminders to customers

---

## Slide 13 — Feature: GST Invoice System

- **A4 Professional Invoice PDF** — Indian GST-compliant format
- **Invoice Types:**
  - Sales Order Invoice (B2C)
  - B2B Invoice (with GSTIN)
  - Purchase Order Invoice (Self-Billed)
- **Customizable Settings:**
  - Business name, address, GSTIN, PAN
  - Custom logo, colors, and footer text
  - Tax rate configuration
- **Amount in Words** — Auto-converts totals to Indian currency words
- **Live Preview** — Preview invoice with settings before saving

---

## Slide 14 — Feature: Loyalty Points Program

- **Points Earning** — Configurable earn rate (e.g., 1 point per ₹100 spent)
- **Points Redemption** — Redeem points for discount at checkout
- **Customer Lookup** — Phone-based lookup showing points balance
- **Checkout Integration** — Show points preview during billing
- **Settings Management** — Manager can adjust earn rate and redemption value
- **Automatic Points Addition** — Points added after sale completion

---

## Slide 15 — Feature: Barcode Scanner (WebSocket)

- **Wireless Scanning** — Phone scans barcodes, Desktop receives results in real-time
- **WebSocket Architecture:**
  - Phone connects as `scanner` role
  - Desktop connects as `billing` role
  - Scans broadcast from phone → all connected desktops
- **Two Modes:**
  - 🛒 **Billing Mode** — Scan adds product to checkout
  - 📥 **Receiving Mode** — Scan receives +1 unit into inventory
- **Product Lookup** — Barcode → product details (name, price, stock)
- **Mobile PWA Scanner Page** — Dedicated barcode scanning page in PWA

---

## Slide 16 — Feature: Reports & Exports

| Report | Description | Format |
|--------|-------------|--------|
| **Stock Summary** | Aggregate stock by product with filters | JSON / CSV / PDF |
| **Location Summary** | Stock grouped by location with values | JSON / CSV / PDF |
| **Batch-Wise Stock** | Detailed batch-level view with expiry | JSON / CSV / PDF |
| **Physical Register** | Blind mode for unbiased stock counting | JSON / CSV / PDF |
| **Low Stock / Reorder** | Products below threshold with suggested qty | JSON / CSV / PDF |
| **Stock Ageing** | Days since received for each batch | JSON / CSV / PDF |
| **Near Expiry** | Products expiring within X days | JSON / CSV / PDF |
| **Overstock / Dormant** | No sales for X days (default: 90) | JSON / CSV / PDF |
| **Item Profitability** | Revenue, cost, profit per product | JSON / CSV / PDF |
| **Stock Movement** | Inbound/outbound/transfer history | JSON / CSV / PDF |
| **Daily Transactions** | All operations grouped by day | JSON / CSV / PDF |
| **Supplier Performance** | Orders, value, delivery rate per supplier | JSON / CSV / PDF |

---

## Slide 17 — Feature: Analytics Dashboard

- **Inventory Valuation** — Total stock value (qty × avg cost)
- **Sales Summary** — Total sales and order count for date range
- **Sales Trends** — Daily sales chart (configurable date range)
- **Top Selling Products** — Ranked by revenue with units sold
- **Write-Off Summary** — By reason (expired, damaged, lost, other) with value
- **Role-Based Dashboards:**
  - 📊 **Manager Dashboard** — KPIs, sales trends, quick actions
  - 👤 **Employee Dashboard** — Shift summary, pending tasks, activity feed
  - 🔧 **Admin Dashboard** — System health, alerts, recent activity

---

## Slide 18 — Feature: Data Science & AI

- **ABC Classification** (Pareto Analysis)
  - A-items: 80% of revenue
  - B-items: 15% of revenue
  - C-items: 5% of revenue
  - Helps prioritize stock management focus
- **Market Basket Analysis** (Apriori Algorithm)
  - "Frequently bought together" patterns
  - Confidence and lift scores for product associations
  - Uses: mlxtend library
- **Customer Segmentation** (RFM Model)
  - Recency, Frequency, Monetary analysis
  - Segments: VIP, Loyal Active, New Customer, At Risk, Lost, Standard
  - Actionable insights for marketing

---

## Slide 19 — Feature: Alerts & Notifications

- **Automated Stock Alerts** (checked every 10 minutes):
  - 🔔 **Shelf Restock** — Store stock < 5 units
  - ⚠️ **Low Stock** — Total stock < 20 units
  - Auto-resolves when stock replenished
- **Alert Severity Levels:** Info, Medium, Warning, Critical
- **Alert Actions:**
  - Quick shelf transfer from alert
  - Bulk restock (creates purchase order from alert items)
  - Resolve, request closure, confirm fix workflow
- **Issue Reporting** — Users can report bugs/problems visible to IT Admin
- **Notification Badge** — Unresolved alert count on navigation

---

## Slide 20 — Feature: System Administration

- **Database Backup & Restore:**
  - Manual backup trigger (PostgreSQL dump)
  - Auto-backup daily at 12:00 PM (APScheduler)
  - Auto-delete backups older than 7 days
  - Full restore capability
- **Audit Logs:**
  - Every API action logged with timestamp, user, IP, details
  - Filterable by date range, user, action type, keyword
- **Operations Logs:**
  - Write-offs and backup operations tracked separately
  - Filter by operation type, user, date
- **User Management:**
  - Register, block/unblock users
  - Assign/remove/switch roles
  - Owner protection for manager-level actions

---

## Slide 21 — Feature: External Marketplace Integration

- **Amazon & Flipkart** order ingestion via webhook
- **Endpoint:** `POST /api/v1/integrations/webhook/order`
- **Authentication:** API Key (header-based, not JWT)
- **Fulfillment Methods:**
  - **FBA (Fulfilled by Amazon):** Deducts from External location
  - **FBM (Fulfilled by Merchant):** Deducts from Warehouse → Store
- **Idempotent Processing** — Duplicate `external_order_id` check
- **SKU Resolution** — Maps external SKUs to internal products
- **Profit Tracking** — Records `unit_cost` snapshot for each order

---

## Slide 22 — Multi-Platform Experience

| Feature | Desktop App | Mobile PWA |
|---------|------------|------------|
| Dashboard | ✅ (Manager/Employee/Admin views) | ✅ |
| Product Catalog | ✅ | ✅ |
| Inventory Management | ✅ | ✅ |
| POS / Billing | ✅ | ✅ |
| Purchase Orders | ✅ | ✅ |
| B2B Management | ✅ | ✅ |
| Khata (B2C Credit) | ✅ | ✅ |
| Reports | ✅ | ✅ |
| Analytics | ✅ | ✅ |
| Data Science | ✅ | ✅ |
| Barcode Scanner | Receives scans (billing page) | Sends scans (camera) |
| Invoice Settings | ✅ (full config) | ✅ |
| Stock Alerts | ✅ | ✅ |
| System Admin | ✅ | ✅ |
| QR Pairing | Generates QR | Scans QR to connect |

---

## Slide 23 — Workflow: Stock Receiving

```
1. Manager creates Purchase Order (Draft)
2. Items added to PO (from catalog or manually)
3. PO submitted (Draft → Placed)
4. Goods arrive → PO received
5. System auto-creates inventory batches
6. Weighted average cost updated per product
7. Audit log entry created
```

**Alternative:** Direct receive via scanner (scan barcode → +1 unit)

---

## Slide 24 — Workflow: Sales / Point of Sale

```
1. Employee opens Billing page
2. Products added via search or barcode scan
3. Optional: Customer phone lookup (loyalty/khata)
4. Payment method selected (Cash / Card / UPI)
5. Order submitted → auto FIFO stock deduction
   - Store batches first (oldest), then Warehouse
6. Cost snapshot saved per item (for profit tracking)
7. Loyalty points earned (if customer linked)
8. Receipt/Invoice PDF available for download
```

---

## Slide 25 — Workflow: B2B Order & Credit

```
1. B2B client created with credit limit & GSTIN
2. Wholesale order placed with per-client pricing
3. Order total added to client's outstanding balance
4. If balance exceeds credit limit → client auto-blocked
5. GST invoice generated for the order
6. Client makes payment → recorded in ledger
7. Balance updated, client unblocked if within limit
8. Dashboard shows top debtors and collection analytics
```

---

## Slide 26 — Workflow: Automated Alerts

```
Every 10 minutes (APScheduler):

Check Shelf Stock:
  → Store stock < 5 units? → Create "Shelf Restock" alert
  → Store stock ≥ 5 units? → Auto-resolve existing alert

Check Total Stock:
  → Total stock < 20 units? → Create "Low Stock" alert
  → Total stock ≥ 20 units? → Auto-resolve existing alert

Employee sees alert → Quick actions:
  → Transfer from warehouse to store shelf
  → Create purchase order for restocking
```

---

## Slide 27 — Key Business Logic Highlights

| Logic | Description |
|-------|-------------|
| **FIFO Deduction** | Sell oldest batches first (`ORDER BY received_at ASC`) |
| **Weighted Average Cost** | `(old_qty × old_avg + new_qty × new_cost) / total_qty` |
| **Profit = Revenue − Cost** | Uses actual `unit_cost` snapshot, not average |
| **Smart PO Merge** | Auto-merges items into existing draft for same supplier |
| **Alert Auto-Resolution** | Stock alerts resolve when thresholds met |
| **Credit Auto-Block** | Khata/B2B customers blocked when exceeding limit |
| **Idempotent Webhooks** | Duplicate external order IDs rejected |

---

## Slide 28 — Security & Compliance

- **Authentication:** OAuth2 + JWT with bcrypt password hashing
- **Role-Based Access Control (RBAC):** 5-tier hierarchy enforced per endpoint
- **Audit Trail:** Every action logged with user, timestamp, IP address
- **Owner Protection:** Critical actions require owner-level privileges
- **GST Compliance:** A4 invoices with GSTIN, tax breakdown, amount in words
- **Database Backup:** Automated daily + manual trigger with 7-day retention
- **API Key Auth:** Separate authentication for external marketplace webhooks

---

## Slide 29 — Project Stats

| Metric | Count |
|--------|-------|
| **Backend API Endpoints** | ~100+ |
| **Backend Routers** | 19 modules |
| **Desktop Pages** | 19 |
| **Desktop Components** | 56+ |
| **PWA Pages** | 20 |
| **Database Tables** | 20+ |
| **User Roles** | 5 |
| **Report Types** | 12 |
| **Scheduled Jobs** | 3 |
| **Data Science Models** | 3 (ABC, RFM, Market Basket) |

---

## Slide 30 — Future Scope / Roadmap (Optional)

- ~~Mobile app development~~ (PWA with Capacitor ✅)
- Multi-store chain management
- Advanced demand forecasting with ML
- Supplier portal for direct PO communication
- Customer-facing mobile app for loyalty tracking
- Integration with accounting software (Tally, Zoho)
- Multi-currency and multi-language support

---

## Slide 31 — Thank You / Q&A

- **Title:** Thank You!
- **Contact / GitHub / Demo link**
- **Q&A session**
