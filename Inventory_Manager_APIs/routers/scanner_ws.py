from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Set
import json
import psycopg2
from security import get_db_connection

router = APIRouter(tags=["Scanner WebSocket"])

# ── Connection Manager ────────────────────────────────────────────────────────
class ScannerConnectionManager:
    """Manages phone (scanner) and desktop (billing) WebSocket connections."""
    
    def __init__(self):
        self.phones: Set[WebSocket] = set()
        self.desktops: Set[WebSocket] = set()
    
    async def connect(self, ws: WebSocket, role: str):
        await ws.accept()
        if role == "desktop":
            self.desktops.add(ws)
        else:
            self.phones.add(ws)
        print(f"[Scanner WS] {role} connected. Phones: {len(self.phones)}, Desktops: {len(self.desktops)}")
    
    def disconnect(self, ws: WebSocket, role: str):
        if role == "desktop":
            self.desktops.discard(ws)
        else:
            self.phones.discard(ws)
        print(f"[Scanner WS] {role} disconnected. Phones: {len(self.phones)}, Desktops: {len(self.desktops)}")
    
    async def broadcast_to_desktops(self, message: dict):
        """Send scan result to ALL connected desktop billing pages."""
        dead = []
        for desktop in self.desktops:
            try:
                await desktop.send_json(message)
            except Exception:
                dead.append(desktop)
        for d in dead:
            self.desktops.discard(d)

manager = ScannerConnectionManager()

# ── Barcode Lookup ────────────────────────────────────────────────────────────
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

# ── WebSocket Endpoint ────────────────────────────────────────────────────────
@router.websocket("/ws/scanner")
async def scanner_websocket(ws: WebSocket, role: str = "phone"):
    """
    WebSocket endpoint for wireless barcode scanning.
    
    Query params:
        role: "phone" (sends scans) or "desktop" (receives scans)
    
    Phone sends:   {"barcode": "8901234567890"}
    Desktop gets:  {"type": "scan", "barcode": "...", "product": {...}} or {"type": "scan_error", ...}
    Phone gets:    {"status": "found", "product_name": "..."} or {"status": "not_found", ...}
    """
    await manager.connect(ws, role)
    
    try:
        while True:
            data = await ws.receive_text()
            
            if role == "phone":
                # Phone sent a barcode scan
                try:
                    msg = json.loads(data)
                    barcode = msg.get("barcode", "").strip()
                except json.JSONDecodeError:
                    barcode = data.strip()
                
                if not barcode:
                    await ws.send_json({"status": "error", "message": "Empty barcode"})
                    continue
                
                # Look up in database
                product = lookup_product_by_barcode(barcode)
                
                if product:
                    # Send to all desktops
                    await manager.broadcast_to_desktops({
                        "type": "scan",
                        "barcode": barcode,
                        "product": product
                    })
                    # Ack to phone
                    await ws.send_json({
                        "status": "found",
                        "product_name": product["name"],
                        "product_price": product["price"],
                        "stock_quantity": product["stock_quantity"]
                    })
                else:
                    # Notify phone of miss
                    await ws.send_json({
                        "status": "not_found",
                        "barcode": barcode,
                        "message": f"No product with barcode '{barcode}'"
                    })
                    # Also tell desktops about the miss
                    await manager.broadcast_to_desktops({
                        "type": "scan_error",
                        "barcode": barcode,
                        "message": f"Barcode '{barcode}' not found in database"
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
        manager.disconnect(ws, role)
    except Exception as e:
        print(f"[Scanner WS] Error: {e}")
        manager.disconnect(ws, role)
