# Master Feature List — Inventory Manager App

> **Purpose:** Mobile App Audit Checklist  
> **Source:** Desktop App Codebase Analysis  
> **Generated:** 2026-01-23

---

## 1. Authentication & User Management

### 1.1 User Login
- [ ] **Feature Name:** Staff Login
- **Critical Logic:**
  - Validates username/password against bcrypt hash
  - Checks `is_active` flag — blocks inactive accounts
  - Generates JWT token with role claims (expires in configured minutes)
- **Key Data Points:**
  - `POST /token` — OAuth2 password flow
  - Reads from `users` table, joins `user_roles` and `roles`
  - Returns `access_token` with `token_type: bearer`

### 1.2 User Registration (IT Admin Only)
- [ ] **Feature Name:** Register Staff User
- **Critical Logic:**
  - Validates role is one of: `employee`, `manager`, `it_admin`
  - Phone number required
  - Password hashed with bcrypt before storage
  - Default `is_active = true`
- **Key Data Points:**
  - `POST /register` — IT Admin protected
  - Inserts into `users`, `user_roles` tables

### 1.3 Loyalty Customer Registration
- [ ] **Feature Name:** Create Loyalty Customer
- **Critical Logic:**
  - Creates customer with auto-generated internal password (not for login)
  - Phone number used as unique identifier
  - Gets `customer` role automatically
- **Key Data Points:**
  - `POST /loyalty_customer` — Employee+ access
  - Inserts into `users` with role `customer`

### 1.4 Role Management
- [ ] **Feature Name:** Assign Role to User
- **Critical Logic:**
  - Adds additional role to existing user
  - Cannot assign `owner` role
- **Key Data Points:**
  - `POST /assign_role` — IT Admin only
  - Inserts into `user_roles` table

- [ ] **Feature Name:** Remove Role from User
- **Critical Logic:**
  - Owner protection: Only `owner` can remove `manager` role from someone
  - Prevents removing last role
- **Key Data Points:**
  - `DELETE /remove_role` — IT Admin only

- [ ] **Feature Name:** Switch User Role
- **Critical Logic:**
  - Replaces ALL current roles with a new single role
  - Owner protection: Cannot switch `manager` without `owner` privileges
- **Key Data Points:**
  - `PUT /switch_role` — IT Admin only

### 1.5 User Status Management
- [ ] **Feature Name:** Block/Unblock User
- **Critical Logic:**
  - Toggles `is_active` flag
  - Owner protection: Only `owner` can block `manager` or `owner`
  - Blocked users cannot log in
- **Key Data Points:**
  - `PUT /toggle_status` — IT Admin only
  - Updates `is_active` in `users` table

### 1.6 User Listing
- [ ] **Feature Name:** View All Users
- **Critical Logic:**
  - Lists all users with their roles and active status
  - Aggregates roles from join table
- **Key Data Points:**
  - `GET /users` — IT Admin only
  - Joins `users`, `user_roles`, `roles`

---

## 2. Product Management

### 2.1 Product CRUD
- [ ] **Feature Name:** Create Product
- **Critical Logic:**
  - SKU must be unique (duplicate check)
  - Validates supplier exists
  - Sets initial `average_cost`
  - Auto-creates `product_suppliers` link
- **Key Data Points:**
  - `POST /api/v1/products` — Manager only
  - Inserts into `products`, `product_suppliers`
  - Creates audit log

- [ ] **Feature Name:** View All Products
- **Critical Logic:**
  - Aggregates total quantity from all batches
  - Joins with preferred supplier name
- **Key Data Points:**
  - `GET /api/v1/products` — Public
  - Joins `products`, `product_suppliers`, `suppliers`, `inventory_batches`

- [ ] **Feature Name:** Update Product
- **Critical Logic:**
  - SKU uniqueness check (excluding current product)
  - Updates supplier links if supplier changed
- **Key Data Points:**
  - `PUT /api/v1/products/{id}` — Manager only
  - Updates `products`, potentially `product_suppliers`

- [ ] **Feature Name:** Delete Product
- **Critical Logic:**
  - Soft delete or hard delete (check for references in batches/orders)
- **Key Data Points:**
  - `DELETE /api/v1/products/{id}` — Manager only

- [ ] **Feature Name:** Get Product by SKU
- **Critical Logic:**
  - SKU lookup for barcode scanning
  - Returns product with stock totals
- **Key Data Points:**
  - `GET /api/v1/products/sku/{sku}` — Employee+

---

## 3. Supplier Management

### 3.1 Supplier CRUD
- [ ] **Feature Name:** Create Supplier
- **Critical Logic:**
  - Name uniqueness validation
  - Optional contact info (email, phone, location)
- **Key Data Points:**
  - `POST /api/v1/suppliers` — Manager only
  - Inserts into `suppliers`
  - Creates audit log

- [ ] **Feature Name:** View All Suppliers
- **Critical Logic:** None (simple listing)
- **Key Data Points:**
  - `GET /api/v1/suppliers` — Public

- [ ] **Feature Name:** Update Supplier
- **Critical Logic:**
  - Name uniqueness check (excluding self)
- **Key Data Points:**
  - `PUT /api/v1/suppliers/{id}` — Manager only

- [ ] **Feature Name:** Delete Supplier
- **Critical Logic:**
  - Checks for linked products/orders before deletion
- **Key Data Points:**
  - `DELETE /api/v1/suppliers/{id}` — Manager only

### 3.2 Product-Supplier Links
- [ ] **Feature Name:** Link Product to Supplier
- **Critical Logic:**
  - Sets supply price for specific product-supplier combination
  - Optionally sets as preferred supplier
  - Prevents duplicate links
- **Key Data Points:**
  - `POST /api/v1/suppliers/product_links` — Manager only
  - Inserts into `product_suppliers`

- [ ] **Feature Name:** Set Preferred Supplier
- **Critical Logic:**
  - Unsets all other preferred flags for same product
  - Sets chosen link as preferred
- **Key Data Points:**
  - `PUT /api/v1/suppliers/product_links/{id}/preferred` — Manager only

- [ ] **Feature Name:** Remove Product-Supplier Link
- **Critical Logic:**
  - Audit log created
- **Key Data Points:**
  - `DELETE /api/v1/suppliers/product_links/{id}` — Manager only

- [ ] **Feature Name:** View Suppliers for Product
- **Critical Logic:**
  - Returns all suppliers linked to specific product
- **Key Data Points:**
  - `GET /api/v1/suppliers/product/{product_id}/suppliers` — Employee+

---

## 4. Location Management

### 4.1 Location CRUD
- [ ] **Feature Name:** Create Location
- **Critical Logic:**
  - Name uniqueness validation
  - Type must be: `warehouse`, `store`, or `external`
- **Key Data Points:**
  - `POST /api/v1/locations` — Manager only
  - Inserts into `locations`

- [ ] **Feature Name:** View All Locations
- **Critical Logic:** Simple listing
- **Key Data Points:**
  - `GET /api/v1/locations` — Public

- [ ] **Feature Name:** Update Location
- **Critical Logic:**
  - Name uniqueness check
  - Type change validation
- **Key Data Points:**
  - `PUT /api/v1/locations/{id}` — Manager only

- [ ] **Feature Name:** Delete Location
- **Critical Logic:**
  - Cannot delete if batches exist at location
- **Key Data Points:**
  - `DELETE /api/v1/locations/{id}` — Manager only

---

## 5. Inventory Management

### 5.1 Stock Receiving
- [ ] **Feature Name:** Receive Stock (Single)
- **Critical Logic:**
  - Creates new batch with batch_code (auto-generated if empty)
  - Records unit_cost for weighted average calculation
  - Updates product `average_cost` using weighted average formula
  - Validates location exists and is warehouse type
  - Creates operations log entry
- **Key Data Points:**
  - `POST /api/v1/inventory/receive` — Manager only
  - Inserts into `inventory_batches`
  - Updates `products.average_cost`
  - Creates `operations_log` entry

- [ ] **Feature Name:** Bulk Receive Stock
- **Critical Logic:**
  - Same as single but processes multiple products
  - All-or-nothing transaction (rollback on error)
  - Batch code auto-generated per item
- **Key Data Points:**
  - `POST /api/v1/inventory/bulk/receive` — Manager only
  - Multiple inserts in transaction

### 5.2 Stock Transfer
- [ ] **Feature Name:** Transfer Stock (FIFO)
- **Critical Logic:**
  - **Smart FIFO**: Automatically selects oldest batches first based on `received_at`
  - If batch_code specified, transfers from specific batch only
  - Validates source has sufficient stock
  - Creates new batch at destination or updates existing matching batch
  - Merges batches with same expiry at destination
- **Key Data Points:**
  - `POST /api/v1/inventory/transfer` — Employee+
  - Updates `inventory_batches` (deduct source, add destination)
  - Creates operations log entry

- [ ] **Feature Name:** Bulk Transfer Stock
- **Critical Logic:**
  - FIFO logic applied to each item
  - All-or-nothing transaction
- **Key Data Points:**
  - `POST /api/v1/inventory/bulk/transfer` — Employee+

### 5.3 Stock Write-Off
- [ ] **Feature Name:** Write-Off Stock
- **Critical Logic:**
  - Requires reason (expired, damaged, lost, other)
  - Records value lost based on unit_cost
  - Deducts from specific batch
  - Cannot write off more than available quantity
- **Key Data Points:**
  - `POST /api/v1/inventory/write_off` — Manager only
  - Updates `inventory_batches.quantity`
  - Inserts into `stock_write_offs`
  - Creates `operations_log` entry

- [ ] **Feature Name:** View Write-Off History
- **Critical Logic:** Pagination and filtering
- **Key Data Points:**
  - `GET /api/v1/inventory/write_off_history` — Manager only
  - Reads from `stock_write_offs` joined with products/locations

### 5.4 Stock Viewing
- [ ] **Feature Name:** View Product Stock Details
- **Critical Logic:**
  - Aggregates all batches for product
  - Groups by location
  - Shows expiry dates and batch codes
- **Key Data Points:**
  - `GET /api/v1/inventory/product/{id}` — Any authenticated user
  - Reads `inventory_batches` joined with `locations`

- [ ] **Feature Name:** Get Locations for Dropdown
- **Critical Logic:**
  - Returns active locations ordered by type
- **Key Data Points:**
  - `GET /api/v1/inventory/locations` — Employee+

---

## 6. Sales & POS

### 6.1 Point of Sale
- [ ] **Feature Name:** Create Sales Order (In-Store)
- **Critical Logic:**
  - **Auto-FIFO Deduction**: Stock deducted from oldest batches at STORE locations first, then WAREHOUSE (never external for in-store)
  - Records `unit_cost` at time of sale for profit tracking
  - Validates sufficient stock before creating order
  - Supports payment methods: cash, card, upi
  - Optional customer linking (name, phone, email)
- **Key Data Points:**
  - `POST /api/v1/sales/orders` — Any authenticated user
  - Inserts into `sales_orders`, `sales_order_items`
  - Updates `inventory_batches`
  - Creates audit log

- [ ] **Feature Name:** Customer Phone Lookup
- **Critical Logic:**
  - Search loyalty customers by phone for order association
- **Key Data Points:**
  - Frontend service (searches users with customer role)

### 6.2 Sales History
- [ ] **Feature Name:** View All Sales Orders
- **Critical Logic:**
  - Pagination support
  - Search by customer name/phone
  - Filter by status, payment method
  - Sort by date (asc/desc)
- **Key Data Points:**
  - `GET /api/v1/sales/orders` — Any authenticated user
  - Returns `items`, `total`, `page`, `total_pages`

- [ ] **Feature Name:** View My Orders (Customer)
- **Critical Logic:**
  - Returns only orders for logged-in customer
- **Key Data Points:**
  - `GET /api/v1/sales/my_orders` — Customer role

- [ ] **Feature Name:** View Single Order Details
- **Critical Logic:**
  - Returns order header + line items with product details
  - Includes unit_cost for profit visibility (manager+)
- **Key Data Points:**
  - `GET /api/v1/sales/orders/{id}` — Any authenticated user

### 6.3 Sales Export
- [ ] **Feature Name:** Export Sales List PDF
- **Critical Logic:**
  - Generates PDF with all orders matching current filters
  - Includes date, customer, total, payment method
- **Key Data Points:**
  - `GET /api/v1/sales/export_pdf` — Any authenticated user
  - Returns PDF blob

- [ ] **Feature Name:** Export Single Order Receipt PDF
- **Critical Logic:**
  - Generates receipt-style PDF for single order
  - Includes line items and totals
- **Key Data Points:**
  - `GET /api/v1/sales/orders/{id}/pdf` — Any authenticated user

---

## 7. Purchase Order Management

### 7.1 Purchase Order CRUD
- [ ] **Feature Name:** Create Purchase Order
- **Critical Logic:**
  - **Smart Merge**: If draft exists for same supplier, adds items to existing draft
  - Calculates total from items
  - Initial status: `draft`
  - Supports notes and expected date
- **Key Data Points:**
  - `POST /api/v1/purchases` — Employee+
  - Inserts into `purchase_orders`, `purchase_order_items`
  - Creates audit log

- [ ] **Feature Name:** View All Purchase Orders
- **Critical Logic:**
  - Filter by status (draft, placed, received, cancelled)
  - Search by supplier name or PO number
- **Key Data Points:**
  - `GET /api/v1/purchases` — Employee+

- [ ] **Feature Name:** View PO Details
- **Critical Logic:**
  - Returns PO header with line items
  - Includes product names, SKUs, quantities, costs
- **Key Data Points:**
  - `GET /api/v1/purchases/{id}` — Employee+

### 7.2 PO Item Management
- [ ] **Feature Name:** Add Items to PO
- **Critical Logic:**
  - Only allowed on draft status POs
  - If product already in PO, updates quantity instead of adding duplicate
  - Recalculates PO total
- **Key Data Points:**
  - `POST /api/v1/purchases/{id}/items` — Employee+

- [ ] **Feature Name:** Remove Item from PO
- **Critical Logic:**
  - Only on draft status
  - Recalculates total
  - If last item removed, deletes entire PO
- **Key Data Points:**
  - `DELETE /api/v1/purchases/{id}/items/{item_id}` — Manager only

### 7.3 PO Status Changes
- [ ] **Feature Name:** Place Order (Submit PO)
- **Critical Logic:**
  - Changes status from `draft` → `placed`
  - Cannot revert once placed
- **Key Data Points:**
  - `PUT /api/v1/purchases/{id}/status` — Manager only
  - Creates audit log

- [ ] **Feature Name:** Cancel Order
- **Critical Logic:**
  - Can cancel `draft` or `placed` orders
  - For draft: auto-deletes the PO
  - Status → `cancelled`
- **Key Data Points:**
  - `PUT /api/v1/purchases/{id}/status` — Manager only

- [ ] **Feature Name:** Receive Purchase Order
- **Critical Logic:**
  - Converts PO items into inventory batches
  - Creates batches at specified warehouse
  - Updates product `average_cost` using weighted average
  - Status → `received`
  - Cannot receive cancelled orders
- **Key Data Points:**
  - `POST /api/v1/purchases/{id}/receive` — Employee+
  - Inserts into `inventory_batches`
  - Updates `products.average_cost`
  - Creates audit log

### 7.4 Draft Management
- [ ] **Feature Name:** Check for Active Draft
- **Critical Logic:**
  - Returns existing draft PO for supplier if exists
  - Used for "Add to Existing Draft" feature
- **Key Data Points:**
  - `GET /api/v1/purchases/draft/check?supplier_id=X` — Employee+

---

## 8. Reports & Exports

### 8.1 Current Stock Reports
- [ ] **Feature Name:** Stock Summary Report
- **Critical Logic:**
  - Aggregates stock by product
  - Filter by category, supplier, stock status
  - Date range filter for received_at
- **Key Data Points:**
  - `GET /api/v1/reports/stock_summary` — Employee+
  - Formats: JSON, CSV, PDF

- [ ] **Feature Name:** Location Summary Report
- **Critical Logic:**
  - Stock grouped by location
  - Shows total units and value per location
- **Key Data Points:**
  - `GET /api/v1/reports/location_summary` — Employee+

- [ ] **Feature Name:** Batch-Wise Stock Report
- **Critical Logic:**
  - Detailed batch-level view
  - Shows batch codes, expiry dates, quantities
- **Key Data Points:**
  - `GET /api/v1/reports/batch_wise_stock` — Employee+

- [ ] **Feature Name:** Physical Stock Register
- **Critical Logic:**
  - For stock counting
  - **Blind mode**: Hides system quantities for unbiased counting
  - Filter by location, category
- **Key Data Points:**
  - `GET /api/v1/reports/physical_register` — Employee+

### 8.2 Inventory Health Reports
- [ ] **Feature Name:** Low Stock / Reorder Report
- **Critical Logic:**
  - Products below configurable threshold (default: 20)
  - Includes suggested reorder quantity
  - Filter by category, location, supplier
- **Key Data Points:**
  - `GET /api/v1/reports/low_stock_reorder` — Employee+

- [ ] **Feature Name:** Stock Ageing Report
- **Critical Logic:**
  - Shows how long stock has been in inventory
  - Calculates days since received
- **Key Data Points:**
  - `GET /api/v1/reports/stock_ageing` — Employee+

- [ ] **Feature Name:** Near Expiry Report
- **Critical Logic:**
  - Products expiring within X days (default: 30)
  - Sorted by expiry urgency
  - Filter by category, location, supplier
- **Key Data Points:**
  - `GET /api/v1/reports/near_expiry` — Employee+

- [ ] **Feature Name:** Overstock / Dormant Report
- **Critical Logic:**
  - Products with no sales for X days (default: 90)
  - Identifies slow-moving inventory
- **Key Data Points:**
  - `GET /api/v1/reports/overstock_dormant` — Employee+

### 8.3 Financial Reports
- [ ] **Feature Name:** Item Profitability Report
- **Critical Logic:**
  - Calculates revenue, cost, profit per product
  - Uses actual `unit_cost` from sales (not average)
  - Profit margin percentage
- **Key Data Points:**
  - `GET /api/v1/reports/item_profitability` — Manager only

- [ ] **Feature Name:** Stock Movement Report
- **Critical Logic:**
  - Shows inbound/outbound/transfer movements
  - Configurable days back (default: 90)
- **Key Data Points:**
  - `GET /api/v1/reports/stock_movement` — Employee+

- [ ] **Feature Name:** Daily Transactions Report
- **Critical Logic:**
  - All transactions grouped by day
  - Filter by SKU, username
  - Shows operation type (sale, receive, transfer, write-off)
- **Key Data Points:**
  - `GET /api/v1/reports/daily_transactions` — Manager only

- [ ] **Feature Name:** Supplier Performance Report
- **Critical Logic:**
  - Aggregates purchase orders by supplier
  - Shows total orders, value, on-time delivery rate
- **Key Data Points:**
  - `GET /api/v1/reports/supplier_performance` — Manager only

---

## 9. Analytics & Insights

### 9.1 Dashboard Analytics
- [ ] **Feature Name:** Inventory Valuation
- **Critical Logic:**
  - Sum of (quantity × average_cost) for all batches
  - Returns total value, item count, distinct products
- **Key Data Points:**
  - `GET /api/v1/analytics/inventory_valuation` — Manager only

- [ ] **Feature Name:** Top Selling Products
- **Critical Logic:**
  - Ranked by revenue within date range
  - Shows units sold and total revenue per product
- **Key Data Points:**
  - `GET /api/v1/analytics/top_selling_products` — Manager only

- [ ] **Feature Name:** Sales Summary
- **Critical Logic:**
  - Total sales value and order count for date range
- **Key Data Points:**
  - `GET /api/v1/analytics/sales_summary` — Manager only

- [ ] **Feature Name:** Sales Trends (Chart Data)
- **Critical Logic:**
  - Daily sales totals for charting
  - Defaults to last 7 days
- **Key Data Points:**
  - `GET /api/v1/analytics/sales_trends` — Manager only

- [ ] **Feature Name:** Write-Off Summary
- **Critical Logic:**
  - Groups write-offs by reason
  - Shows count and total value lost per reason
- **Key Data Points:**
  - `GET /api/v1/analytics/write_off_summary` — Manager only

### 9.2 Data Science Features
- [ ] **Feature Name:** Market Basket Analysis
- **Critical Logic:**
  - **Apriori algorithm** on sales data
  - Identifies "frequently bought together" patterns
  - Returns rules with confidence and lift scores
- **Key Data Points:**
  - `GET /api/v1/analysis/market_basket` — Manager only
  - Requires: mlxtend library

- [ ] **Feature Name:** ABC Classification
- **Critical Logic:**
  - Pareto analysis: A (80% revenue), B (15%), C (5%)
  - Classifies products by cumulative revenue contribution
- **Key Data Points:**
  - `GET /api/v1/analysis/abc_classification` — Manager only

- [ ] **Feature Name:** Customer Segmentation (RFM)
- **Critical Logic:**
  - **RFM Model**: Recency, Frequency, Monetary
  - Segments: VIP, Loyal Active, New Customer, At Risk, Lost, Standard
  - Based on purchase behavior
- **Key Data Points:**
  - `GET /api/v1/analysis/customer_segments` — Manager only

---

## 10. Alerts & Notifications

### 10.1 Stock Alerts
- [ ] **Feature Name:** Shelf Restock Alerts
- **Critical Logic:**
  - **Automatic Check**: Runs every 10 minutes
  - Triggers when store shelf stock < 5 units
  - Creates alert with severity based on stock level
  - Auto-resolves when stock replenished
- **Key Data Points:**
  - System scheduled job
  - Inserts into `system_alerts`
  - `GET /api/v1/system/alerts/shelf-restock` — Employee+

- [ ] **Feature Name:** Low Stock Alerts
- **Critical Logic:**
  - Runs every 10 minutes
  - Triggers when total stock (all locations) < 20 units
  - Independent from shelf restock alerts
- **Key Data Points:**
  - System scheduled job
  - `GET /api/v1/system/alerts/operational` — Employee+

- [ ] **Feature Name:** View Operational Alerts
- **Critical Logic:**
  - Returns shelf restock + low stock + "added to order" alerts
  - Excludes IT system alerts
- **Key Data Points:**
  - `GET /api/v1/system/alerts/operational` — Employee+

- [ ] **Feature Name:** Get Alert Count (Badge)
- **Critical Logic:**
  - Returns count of unresolved alerts for notification badge
- **Key Data Points:**
  - `GET /api/v1/system/alerts/count` — IT Admin only

### 10.2 Alert Actions
- [ ] **Feature Name:** Resolve Alert
- **Critical Logic:**
  - Directly marks alert as resolved
  - Records who resolved it
- **Key Data Points:**
  - `PATCH /api/v1/system/alerts/{id}/resolve` — IT Admin only

- [ ] **Feature Name:** Request Alert Closure
- **Critical Logic:**
  - Marks alert as "pending user confirmation"
  - Used for IT-reported issues awaiting user verification
- **Key Data Points:**
  - `PUT /api/v1/system/alerts/{id}/request_closure` — IT Admin only

- [ ] **Feature Name:** Confirm Alert Fix
- **Critical Logic:**
  - User confirms IT's fix, resolves alert
  - Only works on "pending_user" status
- **Key Data Points:**
  - `PUT /api/v1/system/alerts/{id}/confirm` — Any authenticated

### 10.3 Issue Reporting
- [ ] **Feature Name:** Report Issue
- **Critical Logic:**
  - User can report problems/bugs
  - Creates alert visible to IT Admin
  - Severity: info, medium, warning, critical
- **Key Data Points:**
  - `POST /api/v1/system/alerts/report` — Any authenticated
  - Records user ID and IP address

- [ ] **Feature Name:** View My Reported Issues
- **Critical Logic:**
  - User sees their own reported issues and status
- **Key Data Points:**
  - `GET /api/v1/system/alerts/my` — Any authenticated

---

## 11. System Administration

### 11.1 Database Backup
- [ ] **Feature Name:** Trigger Manual Backup
- **Critical Logic:**
  - Creates PostgreSQL dump file
  - Names with `manual_` prefix + timestamp
  - Stores in configured backup directory
- **Key Data Points:**
  - `POST /api/v1/system/backup` — IT Admin only
  - Uses `pg_dump` via Docker container
  - Creates operations log entry

- [ ] **Feature Name:** Auto Backup (Scheduled)
- **Critical Logic:**
  - Runs daily at 12:00 PM
  - Creates backup with `auto_` prefix
  - Deletes backups older than 7 days
- **Key Data Points:**
  - APScheduler cron job
  - No API endpoint (automatic)

- [ ] **Feature Name:** View Backup List
- **Critical Logic:**
  - Lists all backup files
  - Shows filename, creation time, size, type (manual/auto)
- **Key Data Points:**
  - `GET /api/v1/system/backups` — IT Admin only

- [ ] **Feature Name:** Restore Backup
- **Critical Logic:**
  - **Full Restore**: Drops all tables and restores from backup
  - Uses `pg_restore` with `--clean`
  - Creates audit log before restore
- **Key Data Points:**
  - `POST /api/v1/system/restore/{filename}` — IT Admin only

- [ ] **Feature Name:** Delete Backup
- **Critical Logic:**
  - Removes backup file from disk
- **Key Data Points:**
  - `DELETE /api/v1/system/backups/{filename}` — IT Admin only

### 11.2 Audit Logs
- [ ] **Feature Name:** View Audit Logs
- **Critical Logic:**
  - Paginated log viewer
  - Filter by: date range, username, action type, keyword search
  - Shows: timestamp, username, action, target, IP address, details JSON
- **Key Data Points:**
  - `GET /api/v1/system/audit_logs` — IT Admin only
  - Reads from `audit_logs` joined with `users`

- [ ] **Feature Name:** Get Audit Log Action Types
- **Critical Logic:**
  - Returns distinct action types for filter dropdown
- **Key Data Points:**
  - `GET /api/v1/system/audit_log_actions` — IT Admin only

### 11.3 Operations Logs
- [ ] **Feature Name:** View Operations Logs
- **Critical Logic:**
  - Shows write-offs and backup operations
  - Filter by: date, username, operation type, keyword
  - Shows: timestamp, user, operation, quantity, reason, file name
- **Key Data Points:**
  - `GET /api/v1/system/operations_logs` — Employee+
  - Reads from `operations_log` table

- [ ] **Feature Name:** Get Operation Types
- **Critical Logic:**
  - Returns distinct operation types for filter
- **Key Data Points:**
  - `GET /api/v1/system/operations_log_types` — Employee+

---

## 12. Third-Party Integrations

### 12.1 External Marketplace Orders
- [ ] **Feature Name:** Receive External Order (Webhook)
- **Critical Logic:**
  - Receives orders from Amazon/Flipkart via webhook
  - **Idempotency Check**: Skips if `external_order_id` already exists
  - SKU resolution: Maps external SKUs to internal products
  - **FBA Logic**: Deducts from 'external' location only
  - **FBM Logic**: Deducts from 'warehouse' first, then 'store'
  - Records `unit_cost` for profit tracking
  - Creates completed sales order
- **Key Data Points:**
  - `POST /api/v1/integrations/webhook/order`
  - Protected by `X-Api-Key` header (not JWT)
  - Inserts into `sales_orders`, `sales_order_items`
  - Updates `inventory_batches`

---

## 13. UI-Specific Features (Desktop App)

### 13.1 Dashboard
- [ ] **Feature Name:** Manager Dashboard
- **Critical Logic:**
  - Shows KPIs: Sales today, inventory value, top sellers, write-offs
  - Sales trend chart (configurable date range)
  - Quick access to low stock and expiring items
  - Shelf restock alerts widget
- **Key Data Points:**
  - Multiple API calls aggregated

### 13.2 Quick Actions
- [ ] **Feature Name:** Quick Stock Lookup
- **Critical Logic:**
  - Search by product name or SKU
  - Shows all batches with locations and expiry
- **Key Data Points:**
  - Uses `getProductStock` service

- [ ] **Feature Name:** Bulk Restock from Alert
- **Critical Logic:**
  - Takes products from low stock alerts
  - Pre-populates quantities to restore to threshold
  - Creates purchase order from alert items
- **Key Data Points:**
  - Uses Purchase Order creation flow

- [ ] **Feature Name:** Shelf Transfer from Alert
- **Critical Logic:**
  - Triggered from shelf restock alert
  - Pre-selects: from warehouse, to store
  - Auto-fills product and suggested quantity
- **Key Data Points:**
  - Uses Transfer Stock flow

### 13.3 Catalog Management
- [ ] **Feature Name:** Product Catalog View
- **Critical Logic:**
  - Products with their suppliers, current stock, price
  - Can add to draft PO directly
- **Key Data Points:**
  - Product + Supplier links

- [ ] **Feature Name:** Add to Draft PO (from Catalog)
- **Critical Logic:**
  - Checks for existing draft for supplier
  - Adds item or creates new draft
- **Key Data Points:**
  - Uses `check_active_draft` + `addItemToPurchaseOrder`

---

## Role-Based Access Summary

| Feature Area | Customer | Employee | Manager | IT Admin | Owner |
|-------------|----------|----------|---------|----------|-------|
| Login | ✓ | ✓ | ✓ | ✓ | ✓ |
| View Products | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create Products | ✗ | ✗ | ✓ | ✗ | ✓ |
| View Stock | ✗ | ✓ | ✓ | ✓ | ✓ |
| Transfer Stock | ✗ | ✓ | ✓ | ✓ | ✓ |
| Receive Stock | ✗ | ✗ | ✓ | ✗ | ✓ |
| Write-Off Stock | ✗ | ✗ | ✓ | ✗ | ✓ |
| Create Sales Order | ✗ | ✓ | ✓ | ✓ | ✓ |
| Create PO Draft | ✗ | ✓ | ✓ | ✓ | ✓ |
| Place/Cancel PO | ✗ | ✗ | ✓ | ✗ | ✓ |
| Receive PO | ✗ | ✓ | ✓ | ✓ | ✓ |
| View Reports | ✗ | ✓ | ✓ | ✓ | ✓ |
| Profitability Reports | ✗ | ✗ | ✓ | ✗ | ✓ |
| Analytics / Data Science | ✗ | ✗ | ✓ | ✗ | ✓ |
| User Management | ✗ | ✗ | ✗ | ✓ | ✓ |
| System Alerts (IT) | ✗ | ✗ | ✗ | ✓ | ✓ |
| Backup & Restore | ✗ | ✗ | ✗ | ✓ | ✓ |
| Audit Logs | ✗ | ✗ | ✗ | ✓ | ✓ |
| Block Managers | ✗ | ✗ | ✗ | ✗ | ✓ |

---

## API Endpoint Summary

| Router | Base Path | # Endpoints |
|--------|-----------|-------------|
| Users | `/` | 9 |
| Products | `/api/v1/products` | 6 |
| Suppliers | `/api/v1/suppliers` | 10 |
| Locations | `/api/v1/locations` | 5 |
| Inventory | `/api/v1/inventory` | 8 |
| Sales | `/api/v1/sales` | 6 |
| Purchases | `/api/v1/purchases` | 9 |
| Reports | `/api/v1/reports` | 11 |
| Analytics | `/api/v1/analytics` | 7 |
| Analysis (DS) | `/api/v1/analysis` | 3 |
| System | `/api/v1/system` | 14 |
| Integrations | `/api/v1/integrations` | 1 |
| **Total** | | **~89** |

---

*Generated from codebase located at:*
- Desktop App: `c:\backupKaBackup\Inventory_Manager\Inventory_Manager_Desktop`
- API Backend: `c:\backupKaBackup\Inventory_Manager\Inventory_Manager_APIs`
