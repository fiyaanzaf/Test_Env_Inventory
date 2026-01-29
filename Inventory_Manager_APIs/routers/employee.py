from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Annotated, List, Optional
from datetime import datetime, date
import os
from dotenv import load_dotenv

from security import check_role, User, get_db_connection, get_current_user

router = APIRouter(
    prefix="/api/v1/employee",
    tags=["Employee"]
)

load_dotenv()

# --- Models ---

class ShiftSummary(BaseModel):
    sales_count: int
    revenue_today: float
    products_processed: int
    transfers_done: int
    date: str

class ActivityItem(BaseModel):
    id: int
    type: str  # 'sale', 'transfer', 'receive', 'bulk_receive'
    description: str
    timestamp: datetime
    quantity: Optional[int] = None

# --- Endpoints ---

@router.get("/shift_summary", response_model=ShiftSummary)
def get_shift_summary(
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    """
    Get today's work summary for the logged-in employee.
    Returns sales count, revenue, products processed, and transfers done.
    """
    conn = None
    try:
        conn = get_db_connection()
        if conn is None:
            raise HTTPException(status_code=500, detail="Database connection failed")
        
        cur = conn.cursor()
        cur = conn.cursor()
        
        # 1. Get sales count and revenue for today (Store-wide, as per current limit)
        # Note: sales_orders currently tracks customer user_id, not employee.
        # Showing store-wide totals is better than 0.
        cur.execute("""
            SELECT 
                COUNT(*) as sales_count,
                COALESCE(SUM(total_amount), 0) as revenue
            FROM sales_orders
            WHERE DATE(order_timestamp) = CURRENT_DATE
        """)
        sales_row = cur.fetchone()
        sales_count = sales_row[0] or 0
        revenue_today = float(sales_row[1] or 0)
        
        # 2. Get products processed today (items sold store-wide)
        cur.execute("""
            SELECT COALESCE(SUM(soi.quantity), 0)
            FROM sales_order_items soi
            JOIN sales_orders so ON soi.order_id = so.id
            WHERE DATE(so.order_timestamp) = CURRENT_DATE
        """)
        products_row = cur.fetchone()
        products_processed = products_row[0] or 0
        
        # 3. Get transfers done today by this user (Query by ID is safer)
        cur.execute("""
            SELECT COUNT(*)
            FROM operations_log
            WHERE user_id = %s
            AND operation_type = 'transfer'
            AND DATE(created_at) = CURRENT_DATE
        """, (current_user.id,))
        transfers_row = cur.fetchone()
        transfers_done = transfers_row[0] or 0
        
        cur.close()
        
        return ShiftSummary(
            sales_count=sales_count,
            revenue_today=revenue_today,
            products_processed=products_processed,
            transfers_done=transfers_done,
            date=date.today().isoformat()
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


@router.get("/my_activity", response_model=List[ActivityItem])
def get_my_activity(
    current_user: Annotated[User, Depends(check_role("employee"))],
    limit: int = 10
):
    """
    Get recent activity for the logged-in employee.
    Returns the last N operations (sales, transfers, receives) performed by this user.
    """
    conn = None
    try:
        conn = get_db_connection()
        if conn is None:
            raise HTTPException(status_code=500, detail="Database connection failed")
        
        cur = conn.cursor()
        
        # Combined query for operations_log entries by this user
        # UNION with sales by this user (we don't track sales in operations_log)
        cur.execute("""
            SELECT 
                ol.id,
                ol.operation_type as type,
                ol.reason as description,
                ol.created_at as timestamp,
                ol.quantity
            FROM operations_log ol
            WHERE ol.user_id = %s
            AND ol.operation_type IN ('transfer', 'receive', 'bulk_receive', 'write_off')
            ORDER BY ol.created_at DESC
            LIMIT %s
        """, (current_user.id, limit))
        
        rows = cur.fetchall()
        cur.close()
        
        activities = []
        for row in rows:
            activities.append(ActivityItem(
                id=row[0],
                type=row[1],
                description=row[2] or "No description",
                timestamp=row[3],
                quantity=row[4]
            ))
        
        return activities
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


@router.get("/pending_alerts_count")
def get_pending_alerts_count(
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    """
    Get count of pending operational alerts for badge display.
    """
    conn = None
    try:
        conn = get_db_connection()
        if conn is None:
            raise HTTPException(status_code=500, detail="Database connection failed")
        
        cur = conn.cursor()
        
        cur.execute("""
            SELECT COUNT(*)
            FROM system_alerts
            WHERE is_resolved = FALSE
            AND (
                message LIKE 'SHELF RESTOCK%'
                OR message LIKE 'LOW STOCK%'
            )
        """)
        
        count = cur.fetchone()[0] or 0
        cur.close()
        
        return {"count": count}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()
