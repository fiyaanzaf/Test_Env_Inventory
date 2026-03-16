from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Set
import json
import psycopg2
from datetime import date, datetime, timedelta
from security import get_db_connection, create_operation_log

router = APIRouter(tags=["Scanner WebSocket"])

# -- Connection Manager --------------------------------------------------------
class ScannerConnectionManager:
    """Manages phone (scanner) and desktop (billing) WebSocket connections, grouped by room."""
    
    def __init__(self):
        # room -> set of websockets
        self.rooms: Dict[str, Dict[str, Set[WebSocket]]] = {}
    
    async def connect(self, ws: WebSocket, role: str, room: str):
        await ws.accept()
        if room not in self.rooms:
            self.rooms[room] = {"phones": set(), "desktops": set()}
        
        if role == "desktop":
            self.rooms[room]["desktops"].add(ws)
        else:
            self.rooms[room]["phones"].add(ws)
        
        phone_count = len(self.rooms[room]["phones"])
        desktop_count = len(self.rooms[room]["desktops"])
        print(f"[Scanner WS] {role} connected to room '{room}'. Phones: {phone_count}, Desktops: {desktop_count}")
        
        # Notify desktops in this room about the phone connection
        if role == "phone":
            await self.broadcast_to_desktops(room, {
                "type": "phone_joined",
                "message": f"A scanner joined room '{room}'",
                "phone_count": phone_count
            })
    
    def disconnect(self, ws: WebSocket, role: str, room: str):
        if room in self.rooms:
            if role == "desktop":
                self.rooms[room]["desktops"].discard(ws)
            else:
                self.rooms[room]["phones"].discard(ws)
            
            # Clean up empty rooms
            if not self.rooms[room]["phones"] and not self.rooms[room]["desktops"]:
                del self.rooms[room]
            
            print(f"[Scanner WS] {role} disconnected from room '{room}'.")
    
    async def broadcast_to_desktops(self, room: str, message: dict):
        """Send scan result to desktops in the SAME room only."""
        if room not in self.rooms:
            return
        dead = []
        for desktop in self.rooms[room]["desktops"]:
            try:
                await desktop.send_json(message)
            except Exception:
                dead.append(desktop)
        for d in dead:
            self.rooms[room]["desktops"].discard(d)
    
    def get_room_info(self, room: str) -> dict:
        """Get info about a room."""
        if room not in self.rooms:
            return {"phones": 0, "desktops": 0}
        return {
            "phones": len(self.rooms[room]["phones"]),
            "desktops": len(self.rooms[room]["desktops"])
        }

manager = ScannerConnectionManager()

# -- Barcode Lookup ------------------------------------------------------------
def lookup_product_by_barcode(barcode: str) -> dict | None:
    """Look up a product by its barcode field (NOT sku)."""
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        sql = """
        SELECT 
            p.id, p.sku, p.name, p.selling_price, p.average_cost,
            p.category, p.barcode,
            COALESCE(SUM(ib.quantity), 0) as stock_quantity
        FROM products p
        LEFT JOIN inventory_batches ib ON p.id = ib.product_id
        WHERE p.barcode = %s
        GROUP BY p.id
        """
        
        cur.execute(sql, (barcode,))
        row = cur.fetchone()
        cur.close()
        
        if not row:
            return None
        
        return {
            "id": row[0],
            "sku": row[1],
            "name": row[2],
            "price": float(row[3] or 0),
            "average_cost": float(row[4] or 0),
            "category": row[5],
            "barcode": row[6],
            "stock_quantity": int(row[7])
        }
    except Exception as e:
        print(f"[Scanner WS] DB lookup error: {e}")
        return None
    finally:
        if conn:
            conn.close()

# -- Receive Stock via Scanner -------------------------------------------------
def receive_stock_by_scan(product_id: int, location_id: int, average_cost: float) -> dict | None:
    """
    Receive +1 unit of a product into inventory via scanner.
    
    Batch code = SCAN-RCV-YYYY-MM-DD (same day = same batch, new day = new batch).
    Uses ON CONFLICT to merge into existing batch if same product+location+batch_code.
    """
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Generate daily batch code
        batch_code = f"SCAN-RCV-{date.today().isoformat()}"
        
        # Default expiry: 1 year from now
        expiry = (datetime.now() + timedelta(days=365)).date()
        
        # Upsert: insert new batch or add +1 to existing batch
        sql = """
        INSERT INTO inventory_batches (product_id, location_id, batch_code, quantity, expiry_date, unit_cost, received_at)
        VALUES (%s, %s, %s, 1, %s, %s, CURRENT_TIMESTAMP)
        ON CONFLICT (product_id, location_id, batch_code)
        DO UPDATE SET 
            quantity = inventory_batches.quantity + 1,
            received_at = CURRENT_TIMESTAMP
        RETURNING id, quantity, batch_code;
        """
        
        cur.execute(sql, (product_id, location_id, batch_code, expiry, average_cost))
        result = cur.fetchone()
        
        # Get total stock across all locations
        cur.execute("""
            SELECT COALESCE(SUM(quantity), 0)
            FROM inventory_batches
            WHERE product_id = %s
        """, (product_id,))
        total_stock = cur.fetchone()[0]
        
        # Get location name
        cur.execute("SELECT name FROM locations WHERE id = %s", (location_id,))
        loc_row = cur.fetchone()
        location_name = loc_row[0] if loc_row else "Unknown"
        
        # Get product name for log
        cur.execute("SELECT name FROM products WHERE id = %s", (product_id,))
        prod_row = cur.fetchone()
        product_name = prod_row[0] if prod_row else f"Product {product_id}"
        
        # Create operation log for audit trail
        # Using a simple dict as a mock user for scanner operations
        class ScannerUser:
            def __init__(self):
                self.id = None
                self.username = "scanner"
                self.roles = ["employee"]
        
        scanner_user = ScannerUser()
        
        try:
            create_operation_log(
                user=scanner_user,
                operation_type="receive",
                request=None,
                target_id=result[0],
                quantity=1,
                reason=f"[SCAN] {product_name} received at {location_name}",
                details={"batch_code": batch_code, "product_id": product_id, "location": location_name, "method": "scanner"}
            )
        except Exception as log_err:
            print(f"[Scanner WS] Operation log error (non-fatal): {log_err}")
        
        # Resolve alerts if stock is now above thresholds
        cur.execute("SELECT low_stock_threshold, shelf_restock_threshold FROM products WHERE id = %s", (product_id,))
        thresholds = cur.fetchone()
        if thresholds:
            low_threshold, shelf_threshold = thresholds
            
            if total_stock >= (low_threshold or 20):
                cur.execute("""
                    UPDATE system_alerts 
                    SET is_resolved = TRUE, status = 'resolved'
                    WHERE message LIKE %s AND is_resolved = FALSE
                """, (f"%LOW STOCK: '{product_name}'%",))
        
        conn.commit()
        cur.close()
        
        return {
            "batch_id": result[0],
            "batch_quantity": result[1],
            "batch_code": result[2],
            "total_stock": total_stock,
            "location_name": location_name,
        }
    except Exception as e:
        if conn:
            conn.rollback()
        print(f"[Scanner WS] Receive error: {e}")
        return None
    finally:
        if conn:
            conn.close()

# -- WebSocket Endpoint --------------------------------------------------------
@router.websocket("/ws/scanner")
async def scanner_websocket(ws: WebSocket, role: str = "phone", room: str = "default"):
    """
    WebSocket endpoint for wireless barcode scanning.
    
    Query params:
        role: "phone" (sends scans) or "desktop" (receives scans)
        room: room/desk identifier for multi-cashier pairing (e.g. "DESK-1")
    
    BILLING MODE (default):
        Phone sends:   {"barcode": "8901234567890"}
        Desktop gets:  {"type": "scan", "barcode": "...", "product": {...}}
        Phone gets:    {"status": "found", "product_name": "..."}
    
    RECEIVE MODE:
        Phone sends:   {"barcode": "8901234567890", "mode": "receive", "location_id": 1}
        Phone gets:    {"status": "received", "product_name": "...", "batch_quantity": 5, ...}
        Desktop gets:  {"type": "receive", "product_name": "...", "batch_code": "SCAN-RCV-2026-02-19"}
    """
    await manager.connect(ws, role, room)
    
    try:
        while True:
            data = await ws.receive_text()
            
            if role == "phone":
                try:
                    msg = json.loads(data)
                    barcode = msg.get("barcode", "").strip()
                    mode = msg.get("mode", "billing")
                    location_id = msg.get("location_id")
                except json.JSONDecodeError:
                    barcode = data.strip()
                    mode = "billing"
                    location_id = None
                
                if not barcode:
                    await ws.send_json({"status": "error", "message": "Empty barcode"})
                    continue
                
                # Look up product
                product = lookup_product_by_barcode(barcode)
                
                if not product:
                    await ws.send_json({
                        "status": "not_found",
                        "barcode": barcode,
                        "message": f"No product with barcode '{barcode}'"
                    })
                    await manager.broadcast_to_desktops(room, {
                        "type": "scan_error",
                        "barcode": barcode,
                        "message": f"Barcode '{barcode}' not found in database"
                    })
                    continue
                
                # ── RECEIVE MODE ──
                if mode == "receive":
                    if not location_id:
                        await ws.send_json({
                            "status": "error",
                            "message": "Please select a location first"
                        })
                        continue
                    
                    result = receive_stock_by_scan(
                        product_id=product["id"],
                        location_id=location_id,
                        average_cost=product["average_cost"]
                    )
                    
                    if result:
                        await ws.send_json({
                            "status": "received",
                            "product_name": product["name"],
                            "product_price": product["price"],
                            "batch_quantity": result["batch_quantity"],
                            "total_stock": result["total_stock"],
                            "batch_code": result["batch_code"],
                            "location_name": result["location_name"],
                            "barcode": barcode,
                        })
                        await manager.broadcast_to_desktops(room, {
                            "type": "receive",
                            "product_name": product["name"],
                            "batch_code": result["batch_code"],
                            "batch_quantity": result["batch_quantity"],
                            "location_name": result["location_name"],
                        })
                    else:
                        await ws.send_json({
                            "status": "error",
                            "message": f"Failed to receive '{product['name']}' into inventory"
                        })
                
                # ── BILLING MODE (default) ──
                else:
                    # Block out-of-stock products before they reach the cart
                    if product["stock_quantity"] <= 0:
                        await ws.send_json({
                            "status": "out_of_stock",
                            "product_name": product["name"],
                            "barcode": barcode,
                            "message": f"'{product['name']}' is out of stock"
                        })
                        await manager.broadcast_to_desktops(room, {
                            "type": "scan_error",
                            "barcode": barcode,
                            "message": f"Out of Stock: {product['name']}"
                        })
                        continue

                    # Send to desktops in the SAME room only
                    await manager.broadcast_to_desktops(room, {
                        "type": "scan",
                        "barcode": barcode,
                        "product": product
                    })
                    # Ack to phone
                    await ws.send_json({
                        "status": "found",
                        "product_name": product["name"],
                        "product_price": product["price"],
                        "stock_quantity": product["stock_quantity"],
                        "barcode": barcode,
                    })
            
            elif role == "desktop":
                # Desktop might send pings or control messages
                try:
                    msg = json.loads(data)
                    if msg.get("type") == "ping":
                        await ws.send_json({"type": "pong"})
                except Exception:
                    pass
    
    except WebSocketDisconnect:
        manager.disconnect(ws, role, room)
    except Exception as e:
        print(f"[Scanner WS] Error: {e}")
        manager.disconnect(ws, role, room)

