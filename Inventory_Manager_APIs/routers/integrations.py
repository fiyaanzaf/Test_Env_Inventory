from fastapi import APIRouter, HTTPException, Depends, Header, Request
from pydantic import BaseModel
from typing import List, Optional
from security import get_db_connection, create_audit_log 
import os
from dotenv import load_dotenv

router = APIRouter(
    prefix="/api/v1/integrations",
    tags=["Third-Party Integrations"]
)

load_dotenv()
# Simple API Key security for webhooks
INTEGRATION_API_KEY = os.getenv("INTEGRATION_API_KEY", "my_secret_webhook_key_123")

async def verify_api_key(x_api_key: str = Header(...)):
    if x_api_key != INTEGRATION_API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API Key")
    return x_api_key

# --- Models for Incoming Webhooks ---
class ExternalItem(BaseModel):
    sku: str
    quantity: int
    price: float

class ExternalOrderWebhook(BaseModel):
    platform: str  # 'amazon', 'flipkart'
    order_id: str  # Their ID
    fulfillment_method: str # 'FBA' or 'FBM' (Merchant)
    customer_name: Optional[str] = "Online Guest"
    total_amount: float
    items: List[ExternalItem]

# --- The Webhook Endpoint ---
@router.post("/webhook/order")
def receive_external_order(
    webhook: ExternalOrderWebhook,
    request: Request,
    api_key: str = Depends(verify_api_key)
):
    """
    Receives orders from Amazon/Flipkart.
    Logic:
    - FBA: Deducts from 'external' location.
    - FBM: Deducts from 'warehouse' FIRST, then 'store'.
    - Profit: Records unit_cost at time of sale.
    """
    conn = None
    try:
        conn = get_db_connection()
        if conn is None:
             raise HTTPException(status_code=500, detail="Database connection failed")
        
        cur = conn.cursor()

        # 1. Idempotency Check (Did we already process this?)
        cur.execute("SELECT id FROM sales_orders WHERE external_order_id = %s", (webhook.order_id,))
        if cur.fetchone():
            return {"status": "ignored", "message": "Order already processed"}

        # 2. Resolve SKUs to Product IDs & Get Cost
        resolved_items = []
        for item in webhook.items:
            # UPDATED: Fetch average_cost so we can track profit
            cur.execute("SELECT id, name, average_cost FROM products WHERE sku = %s", (item.sku,))
            res = cur.fetchone()
            
            if not res:
                # In production, you might log this error instead of crashing
                raise HTTPException(status_code=400, detail=f"Unknown SKU: {item.sku}")
            
            resolved_items.append({
                "product_id": res[0],
                "quantity": item.quantity,
                "unit_price": item.price,
                "unit_cost": float(res[2] or 0) # Capture cost snapshot
            })

        # 3. Inventory Deduction Logic (The "Hub & Spoke" Logic)
        for r_item in resolved_items:
            qty_needed = r_item['quantity']
            
            # LOGIC: 
            # If FBA -> Deduct from 'external' location (Location Type 2 priority).
            # If FBM -> Deduct from 'warehouse' (0 priority) FIRST, then 'store' (1 priority).
            
            priority_case = ""
            if webhook.fulfillment_method == 'FBA':
                # Only look at external locations
                priority_case = "CASE WHEN l.location_type = 'external' THEN 0 ELSE 10 END"
            else: # FBM (We ship it)
                # Look at Warehouse (0), then Store (1), Avoid External (10)
                priority_case = "CASE WHEN l.location_type = 'warehouse' THEN 0 WHEN l.location_type = 'store' THEN 1 ELSE 10 END"

            sql_find_stock = f"""
                SELECT b.id, b.quantity
                FROM inventory_batches b
                JOIN locations l ON b.location_id = l.id
                WHERE b.product_id = %s AND b.quantity > 0
                ORDER BY {priority_case}, b.expiry_date ASC NULLS LAST
                FOR UPDATE
            """
            
            cur.execute(sql_find_stock, (r_item['product_id'],))
            batches = cur.fetchall()

            total_available = sum(b[1] for b in batches)
            if total_available < qty_needed:
                 raise HTTPException(status_code=400, detail=f"OOS for product {r_item['product_id']}. Needed: {qty_needed}, Have: {total_available}")

            for b_id, b_qty in batches:
                if qty_needed == 0: break
                take = min(qty_needed, b_qty)
                cur.execute("UPDATE inventory_batches SET quantity = quantity - %s WHERE id = %s", (take, b_id))
                qty_needed -= take

        # 4. Create Sales Order
        cur.execute(
            """
            INSERT INTO sales_orders 
            (customer_name, total_amount, sales_channel, status, external_order_id, fulfillment_method)
            VALUES (%s, %s, %s, 'completed', %s, %s)
            RETURNING id;
            """,
            (webhook.customer_name, webhook.total_amount, webhook.platform, webhook.order_id, webhook.fulfillment_method)
        )
        new_order_id = cur.fetchone()[0]

        # 5. Save Items (UPDATED: Saves unit_cost and unit_price)
        for r_item in resolved_items:
            cur.execute(
                """
                INSERT INTO sales_order_items 
                (order_id, product_id, quantity, unit_price, unit_cost) 
                VALUES (%s, %s, %s, %s, %s)
                """,
                (new_order_id, r_item['product_id'], r_item['quantity'], r_item['unit_price'], r_item['unit_cost'])
            )

        conn.commit()
        cur.close()
        return {"status": "success", "new_internal_id": new_order_id}

    except Exception as e:
        if conn: conn.rollback()
        if "OOS" in str(e): raise HTTPException(status_code=400, detail=str(e))
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn: conn.close()