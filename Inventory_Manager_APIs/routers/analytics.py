from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Annotated, List, Optional
import psycopg2
import os
from dotenv import load_dotenv
from datetime import date, datetime, timedelta

# --- New Imports for Security ---
from security import check_role, User, get_db_connection, get_current_user

router = APIRouter(
    prefix="/api/v1/analytics",
    tags=["Analytics & Reports"]
)

# --- Load Environment Variables ---
load_dotenv()
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASS = os.getenv("DB_PASS")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")

# --- Pydantic Response Models (V1) ---

class NearingExpiryItem(BaseModel):
    product_id: int
    product_name: str
    sku: str
    batch_id: int
    batch_code: str
    location_name: str
    quantity: int
    expiry_date: date

class SalesSummary(BaseModel):
    total_sales_value: float
    total_orders: int
    start_date: date
    end_date: date

class AuditLogEntry(BaseModel):
    id: int
    user_id: Optional[int]
    username: Optional[str]
    action: str
    target_table: Optional[str]
    target_id: Optional[int]
    ip_address: Optional[str]
    timestamp: datetime
    details: Optional[dict]

# --- Pydantic Response Models (V2 - NEW) ---

class InventoryValuation(BaseModel):
    total_valuation: float
    total_items: int
    distinct_products: int

class TopSeller(BaseModel):
    product_id: int
    sku: str
    product_name: str
    total_units_sold: int
    total_revenue: float  # ADDED: Total revenue from sales

class WriteOffSummaryItem(BaseModel):
    reason: str
    total_count: int
    total_value_lost: float

class SalesTrendItem(BaseModel):
    date: date
    total_sales: float

# --- API Endpoints for Analytics (V1) ---

# 1. Nearing Expiry Report (Manager only)
@router.get("/nearing_expiry", response_model=List[NearingExpiryItem])
def get_nearing_expiry_report(
    current_user: Annotated[User, Depends(check_role("manager"))],
    days_out: int = 30 
):
    conn = None
    start_date = datetime.now().date() + timedelta(days=1)
    end_date = start_date + timedelta(days=days_out)
    
    sql = """
    SELECT 
        p.id as product_id, p.name as product_name, p.sku,
        b.id as batch_id, b.batch_code,
        l.name as location_name, b.quantity, b.expiry_date
    FROM inventory_batches b
    JOIN products p ON b.product_id = p.id
    JOIN locations l ON b.location_id = l.id
    WHERE 
        b.expiry_date IS NOT NULL
        AND b.quantity > 0
        AND b.expiry_date >= %s
        AND b.expiry_date <= %s
    ORDER BY b.expiry_date ASC;
    """
    try:
        conn = get_db_connection()
        if conn is None:
            raise HTTPException(status_code=500, detail="Database connection failed")
        
        cur = conn.cursor()
        cur.execute(sql, (start_date, end_date))
        items = cur.fetchall()
        cur.close()
        
        report_list = []
        for item in items:
            report_list.append(NearingExpiryItem(
                product_id=item[0],
                product_name=item[1],
                sku=item[2],
                batch_id=item[3],
                batch_code=item[4],
                location_name=item[5],
                quantity=item[6],
                expiry_date=item[7]
            ))
        return report_list
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

# 2. Sales Summary Report (Manager only)
@router.get("/sales_summary", response_model=SalesSummary)
def get_sales_summary(
    current_user: Annotated[User, Depends(check_role("manager"))],
    start_date: date = date.today() - timedelta(days=30), 
    end_date: date = date.today()
):
    conn = None
    sql = """
    SELECT 
        COUNT(id) as total_orders,
        SUM(total_amount) as total_sales_value
    FROM sales_orders
    WHERE 
        status = 'completed'
        AND DATE(order_timestamp) BETWEEN %s AND %s;
    """
    try:
        conn = get_db_connection()
        if conn is None:
            raise HTTPException(status_code=500, detail="Database connection failed")
        
        cur = conn.cursor()
        cur.execute(sql, (start_date, end_date))
        data = cur.fetchone()
        cur.close()
        
        total_orders = data[0] or 0
        total_sales = data[1] or 0.0
        
        return SalesSummary(
            total_sales_value=float(total_sales),
            total_orders=total_orders,
            start_date=start_date,
            end_date=end_date
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

# 3. View Audit Logs (IT Admin only)
@router.get("/audit_logs", response_model=List[AuditLogEntry])
def get_audit_logs(
    current_user: Annotated[User, Depends(check_role("it_admin"))],
    limit: int = 100 
):
    conn = None
    sql = """
    SELECT id, user_id, username, action, target_table, target_id, ip_address, timestamp, details
    FROM audit_logs
    ORDER BY timestamp DESC
    LIMIT %s;
    """
    try:
        conn = get_db_connection()
        if conn is None:
            raise HTTPException(status_code=500, detail="Database connection failed")
        
        cur = conn.cursor()
        cur.execute(sql, (limit,))
        logs = cur.fetchall()
        cur.close()
        
        log_list = []
        for log in logs:
            log_list.append(AuditLogEntry(
                id=log[0],
                user_id=log[1],
                username=log[2],
                action=log[3],
                target_table=log[4],
                target_id=log[5],
                ip_address=log[6],
                timestamp=log[7],
                details=log[8]
            ))
        return log_list
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

# --- API Endpoints for Analytics (V2 - NEW) ---

# 4. Get Total Inventory Valuation (Manager only)
@router.get("/inventory_valuation", response_model=InventoryValuation)
def get_inventory_valuation(
    current_user: Annotated[User, Depends(check_role("manager"))]
):
    """
    Calculates the total value (at cost) of all stock on hand.
    This is a critical KPI for the Manager.
    """
    conn = None
    # UPDATED: Changed 'cost_price' to 'unit_cost'
    sql = """
    SELECT 
        SUM(unit_cost * quantity) as total_valuation,
        SUM(quantity) as total_items,
        COUNT(DISTINCT product_id) as distinct_products
    FROM inventory_batches
    WHERE quantity > 0;
    """
    try:
        conn = get_db_connection()
        if conn is None:
            raise HTTPException(status_code=500, detail="Database connection failed")
        
        cur = conn.cursor()
        cur.execute(sql)
        data = cur.fetchone()
        cur.close()
        
        return InventoryValuation(
            total_valuation=float(data[0] or 0.0),
            total_items=int(data[1] or 0),
            distinct_products=int(data[2] or 0)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

# 5. Get Top Selling Products (Manager only)
@router.get("/top_selling_products", response_model=List[TopSeller])
def get_top_selling_products(
    current_user: Annotated[User, Depends(check_role("manager"))],
    limit: int = 20,
    start_date: Optional[date] = None, 
    end_date: Optional[date] = None    
):
    """
    Finds the top N selling products by revenue within a date range.
    """
    conn = None
    
    # Default to last 30 days if dates aren't provided
    if not start_date:
        start_date = date.today() - timedelta(days=30)
    if not end_date:
        end_date = date.today()

    # UPDATED: Changed 'price_at_sale' to 'unit_price'
    sql = """
    SELECT 
        p.id as product_id,
        p.sku,
        p.name as product_name,
        SUM(soi.quantity) as total_units_sold,
        SUM(soi.quantity * soi.unit_price) as total_revenue
    FROM sales_order_items soi
    JOIN products p ON soi.product_id = p.id
    JOIN sales_orders so ON soi.order_id = so.id
    WHERE 
        so.status = 'completed'
        AND DATE(so.order_timestamp) BETWEEN %s AND %s 
    GROUP BY p.id, p.sku, p.name
    ORDER BY total_revenue DESC
    LIMIT %s;
    """
    try:
        conn = get_db_connection()
        if conn is None:
            raise HTTPException(status_code=500, detail="Database connection failed")
        
        cur = conn.cursor()
        # Pass the dates before the limit
        cur.execute(sql, (start_date, end_date, limit)) 
        items = cur.fetchall()
        cur.close()
        
        top_sellers = []
        for item in items:
            top_sellers.append(TopSeller(
                product_id=item[0],
                sku=item[1],
                product_name=item[2],
                total_units_sold=int(item[3]),
                total_revenue=float(item[4] or 0.0)
            ))
        return top_sellers
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

# 6. Get Write-Off Summary (Manager only)
@router.get("/write_off_summary", response_model=List[WriteOffSummaryItem])
def get_write_off_summary(
    current_user: Annotated[User, Depends(check_role("manager"))],
    start_date: Optional[date] = None,
    end_date: Optional[date] = None
):
    """
    Aggregates all write-offs by their reason within a date range.
    """
    conn = None
    
    # Default to last 30 days if not provided
    if not start_date:
        start_date = date.today() - timedelta(days=30)
    if not end_date:
        end_date = date.today()

    # UPDATED: Query operations_log instead of audit_logs
    sql = """
    SELECT 
        ol.reason,
        COUNT(ol.id) as total_count,
        SUM( ol.quantity::numeric * ib.unit_cost ) as total_value_lost
    FROM operations_log ol
    JOIN inventory_batches ib ON ol.target_id = ib.id
    WHERE ol.operation_type = 'write_off'
      AND DATE(ol.created_at) BETWEEN %s AND %s 
    GROUP BY ol.reason
    ORDER BY total_value_lost DESC;
    """
    try:
        conn = get_db_connection()
        if conn is None:
            raise HTTPException(status_code=500, detail="Database connection failed")
        
        cur = conn.cursor()
        cur.execute(sql, (start_date, end_date)) 
        items = cur.fetchall()
        cur.close()
        
        summary = []
        for item in items:
            summary.append(WriteOffSummaryItem(
                reason=item[0],
                total_count=int(item[1]),
                total_value_lost=float(item[2] or 0.0)
            ))
        return summary
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

@router.get("/sales_trends", response_model=List[SalesTrendItem])
def get_sales_trends(
    current_user: Annotated[User, Depends(check_role("manager"))],
    start_date: Optional[date] = None,
    end_date: Optional[date] = None
):
    """
    Returns daily sales totals between start_date and end_date.
    Defaults to last 7 days if not provided.
    """
    conn = None
    
    # Default to last 7 days if no dates provided
    if not end_date:
        end_date = date.today()
    if not start_date:
        start_date = end_date - timedelta(days=6)

    # Use generate_series to ensure days with $0 sales are included
    sql = """
    SELECT 
        series_date::date as date,
        COALESCE(SUM(so.total_amount), 0) as total_sales
    FROM generate_series(
        %s::date,
        %s::date,
        '1 day'
    ) as series_date
    LEFT JOIN sales_orders so 
        ON DATE(so.order_timestamp) = series_date::date 
        AND so.status = 'completed'
    GROUP BY series_date
    ORDER BY series_date ASC;
    """
    try:
        conn = get_db_connection()
        if conn is None:
            raise HTTPException(status_code=500, detail="Database connection failed")
        
        cur = conn.cursor()
        cur.execute(sql, (start_date, end_date))
        rows = cur.fetchall()
        cur.close()
        
        results = []
        for row in rows:
            results.append(SalesTrendItem(
                date=row[0],
                total_sales=float(row[1] or 0.0)
            ))
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()