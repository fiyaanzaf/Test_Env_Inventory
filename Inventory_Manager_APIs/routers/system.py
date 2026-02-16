from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from typing import Annotated, List, Optional
from datetime import datetime, timedelta
import subprocess
import os
import glob
import time
import socket
from apscheduler.schedulers.background import BackgroundScheduler
from dotenv import load_dotenv
from security import check_role, User, get_db_connection, create_audit_log, create_operation_log, get_current_user

# --- 1. Load Environment Variables ---
load_dotenv()

router = APIRouter(
    prefix="/api/v1/system",
    tags=["System"]
)

# --- CONFIGURATION ---
BACKUP_DIR = "./backups" 
CONTAINER_NAME = "inventory-db"  
DB_USER = "postgres"
DB_NAME = "postgres"

# Ensure backup directory exists
os.makedirs(BACKUP_DIR, exist_ok=True)


# --- HEALTH / LAN IP ENDPOINT (no auth required) ---
def _get_lan_ip() -> str:
    """Detect the machine's LAN IP reliably."""
    try:
        # Connect to a public DNS to find which interface is used for LAN
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(2)
        s.connect(("8.8.8.8", 80))       # doesn't actually send data
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        pass
    # Fallback: scan all interfaces
    try:
        hostname = socket.gethostname()
        addrs = socket.getaddrinfo(hostname, None, socket.AF_INET)
        for addr in addrs:
            ip = addr[4][0]
            if ip and not ip.startswith("127."):
                return ip
    except Exception:
        pass
    return "127.0.0.1"


@router.get("/health")
def health_check():
    """Health check + LAN IP — no auth needed. Used by Mobile Connect."""
    return {
        "status": "ok",
        "lan_ip": _get_lan_ip(),
        "backend_url": f"http://{_get_lan_ip()}:8000",
        "timestamp": datetime.now().isoformat(),
    }


# --- MODELS ---
class AlertOut(BaseModel):
    id: int
    severity: str
    message: str
    is_resolved: bool
    status: str          # 'open', 'pending_user', 'resolved'
    created_at: datetime
    user_id: Optional[int] = None
    username: Optional[str] = None

class CreateAlert(BaseModel):
    severity: str = "medium"
    message: str

class BackupFile(BaseModel):
    filename: str
    created_at: str
    size_mb: float
    type: str  # 'manual' or 'auto'

# --- AUTOMATIC BACKUP LOGIC ---

def run_auto_backup():
    """
    Runs daily. Creates backup and deletes files older than 7 days.
    """
    # REMOVED EMOJI HERE
    print("Starting Automatic Daily Backup...") 
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"backup_auto_{timestamp}.sql"
    filepath = os.path.join(BACKUP_DIR, filename)
    
    try:
        # 1. Create Backup
        cmd = ["docker", "exec", "-t", CONTAINER_NAME, "pg_dump", "-U", DB_USER, "--clean", "--if-exists", DB_NAME]
        with open(filepath, "w") as outfile:
            subprocess.run(cmd, stdout=outfile, stderr=subprocess.PIPE, text=True)
            
        # REMOVED EMOJI HERE
        print(f"Auto Backup Created: {filename}") 

        # 2. Cleanup Old Auto Backups (7 Days Retention)
        retention_period = 7 * 24 * 60 * 60
        now = time.time()
        
        for f in glob.glob(os.path.join(BACKUP_DIR, "backup_auto_*.sql")):
            if os.stat(f).st_mtime < (now - retention_period):
                os.remove(f)
                # REMOVED EMOJI HERE
                print(f"Deleted old backup: {f}")

    except Exception as e:
        # REMOVED EMOJI HERE
        print(f"Auto Backup Failed: {e}")

# --- THRESHOLD CONSTANTS (defaults, overridden by per-product settings) ---
SHELF_RESTOCK_THRESHOLD = 5   # Default when product has no custom threshold
LOW_STOCK_THRESHOLD = 20      # Default when product has no custom threshold

# --- SHELF RESTOCK CHECK (Independent) ---
def run_shelf_restock_check():
    """
    Runs every 10 minutes. Checks for products with shelf stock < their shelf_restock_threshold.
    Creates SHELF RESTOCK alerts - completely independent from low stock logic.
    Uses per-product thresholds from the products table.
    """
    print("Running Shelf Restock Check...")
    conn = None
    try:
        conn = get_db_connection()
        if conn is None:
            print("Shelf Restock Check: Database connection failed")
            return
        
        cur = conn.cursor()
        
        # Find products with shelf stock below their per-product threshold
        cur.execute("""
            SELECT 
                p.id, 
                p.name, 
                COALESCE(shelf.qty, 0) as shelf_stock,
                COALESCE(warehouse.qty, 0) as warehouse_stock,
                p.shelf_restock_threshold
            FROM products p
            LEFT JOIN (
                SELECT b.product_id, SUM(b.quantity) as qty
                FROM inventory_batches b
                INNER JOIN locations l ON b.location_id = l.id
                WHERE l.location_type = 'store'
                GROUP BY b.product_id
            ) shelf ON shelf.product_id = p.id
            LEFT JOIN (
                SELECT b.product_id, SUM(b.quantity) as qty
                FROM inventory_batches b
                INNER JOIN locations l ON b.location_id = l.id
                WHERE l.location_type = 'warehouse'
                GROUP BY b.product_id
            ) warehouse ON warehouse.product_id = p.id
            WHERE COALESCE(shelf.qty, 0) < p.shelf_restock_threshold
        """)
        
        low_shelf_products = cur.fetchall()
        alerts_created = 0
        
        for product in low_shelf_products:
            product_id, product_name, shelf_stock, warehouse_stock, threshold = product
            
            # Check if alert already exists
            cur.execute("""
                SELECT id FROM system_alerts 
                WHERE message LIKE %s AND is_resolved = FALSE
            """, (f"%SHELF RESTOCK NEEDED: '{product_name}'%",))
            
            if not cur.fetchone():
                cur.execute("""
                    INSERT INTO system_alerts (severity, message, created_at, is_resolved, status)
                    VALUES ('warning', %s, NOW(), FALSE, 'active')
                """, (f"SHELF RESTOCK NEEDED: '{product_name}' has only {shelf_stock} units on shelf. Warehouse has {warehouse_stock} units available.",))
                alerts_created += 1
        
        # AUTO-RESOLVE: Products now at or above their shelf threshold
        cur.execute("""
            SELECT p.id, p.name, p.shelf_restock_threshold
            FROM products p
            LEFT JOIN (
                SELECT b.product_id, SUM(b.quantity) as qty
                FROM inventory_batches b
                INNER JOIN locations l ON b.location_id = l.id
                WHERE l.location_type = 'store'
                GROUP BY b.product_id
            ) shelf ON shelf.product_id = p.id
            WHERE COALESCE(shelf.qty, 0) >= p.shelf_restock_threshold
        """)
        
        restocked_products = cur.fetchall()
        alerts_resolved = 0
        
        for product in restocked_products:
            product_id, product_name, threshold = product
            cur.execute("""
                UPDATE system_alerts 
                SET is_resolved = TRUE, status = 'resolved'
                WHERE message LIKE %s AND is_resolved = FALSE
            """, (f"%SHELF RESTOCK NEEDED: '{product_name}'%",))
            alerts_resolved += cur.rowcount
        
        conn.commit()
        cur.close()
        
        if alerts_created > 0 or alerts_resolved > 0:
            print(f"Shelf Restock Check: Created={alerts_created}, Resolved={alerts_resolved}")
        else:
            print("Shelf Restock Check: No changes needed")
            
    except Exception as e:
        print(f"Shelf Restock Check Failed: {e}")
        if conn:
            conn.rollback()
    finally:
        if conn:
            conn.close()

# --- LOW STOCK CHECK (Independent) ---
def run_low_stock_check():
    """
    Runs every 10 minutes. Checks for products with total stock (warehouse + store) < their low_stock_threshold.
    Creates LOW STOCK alerts - completely independent from shelf restock logic.
    Uses per-product thresholds from the products table.
    """
    print("Running Low Stock Check...")
    conn = None
    try:
        conn = get_db_connection()
        if conn is None:
            print("Low Stock Check: Database connection failed")
            return
        
        cur = conn.cursor()
        
        # Find products with total stock below their per-product threshold
        cur.execute("""
            SELECT 
                p.id, 
                p.name, 
                COALESCE(total.qty, 0) as total_stock,
                p.low_stock_threshold
            FROM products p
            LEFT JOIN (
                SELECT b.product_id, SUM(b.quantity) as qty
                FROM inventory_batches b
                GROUP BY b.product_id
            ) total ON total.product_id = p.id
            WHERE COALESCE(total.qty, 0) < p.low_stock_threshold
        """)
        
        low_stock_products = cur.fetchall()
        alerts_created = 0
        
        for product in low_stock_products:
            product_id, product_name, total_stock, threshold = product
            
            # Check if alert already exists
            cur.execute("""
                SELECT id FROM system_alerts 
                WHERE (message LIKE %s OR message LIKE %s)
                AND is_resolved = FALSE
            """, (f"%LOW STOCK: '{product_name}'%", f"%ADDED TO ORDER: {product_name}%"))
            
            if not cur.fetchone():
                cur.execute("""
                    INSERT INTO system_alerts (severity, message, created_at, is_resolved, status)
                    VALUES ('critical', %s, NOW(), FALSE, 'active')
                """, (f"LOW STOCK: '{product_name}' has only {total_stock} units total. ORDER FROM SUPPLIER needed.",))
                alerts_created += 1
        
        # AUTO-RESOLVE: Products now at or above their low stock threshold
        cur.execute("""
            SELECT p.id, p.name, p.low_stock_threshold
            FROM products p
            LEFT JOIN (
                SELECT b.product_id, SUM(b.quantity) as qty
                FROM inventory_batches b
                GROUP BY b.product_id
            ) total ON total.product_id = p.id
            WHERE COALESCE(total.qty, 0) >= p.low_stock_threshold
        """)
        
        restocked_products = cur.fetchall()
        alerts_resolved = 0
        
        for product in restocked_products:
            product_id, product_name, threshold = product
            cur.execute("""
                UPDATE system_alerts 
                SET is_resolved = TRUE, status = 'resolved'
                WHERE message LIKE %s AND is_resolved = FALSE
            """, (f"%LOW STOCK: '{product_name}'%",))
            alerts_resolved += cur.rowcount
        
        conn.commit()
        cur.close()
        
        if alerts_created > 0 or alerts_resolved > 0:
            print(f"Low Stock Check: Created={alerts_created}, Resolved={alerts_resolved}")
        else:
            print("Low Stock Check: No changes needed")
            
    except Exception as e:
        print(f"Low Stock Check Failed: {e}")
        if conn:
            conn.rollback()
    finally:
        if conn:
            conn.close()

# --- COMBINED STOCK CHECK (Runs both independently) ---
def run_stock_checks():
    """
    Master function that runs both shelf restock and low stock checks.
    They are completely independent - no cross-dependency between them.
    """
    run_shelf_restock_check()
    run_low_stock_check()

# --- SCHEDULER ---
scheduler = BackgroundScheduler()

# Auto Backup - Run every day at 12:00 PM (Server Time)
scheduler.add_job(run_auto_backup, 'cron', hour=12, minute=0)

# Stock Checks - Every 10 minutes (runs both shelf restock and low stock checks independently)
scheduler.add_job(run_stock_checks, 'interval', minutes=10)

scheduler.start()


# --- ENDPOINTS ---

# 0. Admin: Get Alert Count
@router.get("/alerts/count")
def get_alert_count(current_user: Annotated[User, Depends(check_role("it_admin"))]):
    """
    Returns the count of unresolved system alerts for notification badges.
    """
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT COUNT(*) FROM system_alerts WHERE is_resolved = FALSE")
        count = cur.fetchone()[0]
        return {"count": count}
    except Exception as e:
        print(f"Error fetching alert count: {e}")
        return {"count": 0}
    finally:
        cur.close()
        conn.close()

# 1. Admin: Get All Alerts (excluding operational/stock alerts - those belong in Stock Alerts page)
@router.get("/alerts", response_model=List[AlertOut])
def get_system_alerts(current_user: Annotated[User, Depends(check_role("it_admin"))]):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT a.id, a.severity, a.message, a.is_resolved, a.status, a.created_at, a.user_id, u.username 
        FROM system_alerts a
        LEFT JOIN users u ON a.user_id = u.id
        WHERE a.message NOT LIKE '%ADDED TO ORDER%'
          AND a.message NOT LIKE '%SHELF RESTOCK NEEDED%'
          AND a.message NOT LIKE '%LOW STOCK%'
        ORDER BY 
            CASE WHEN a.status = 'active' THEN 1 
                 WHEN a.status = 'pending_user' THEN 2 
                 ELSE 3 END, 
            a.created_at DESC
    """)
    rows = cur.fetchall()
    cur.close()
    conn.close()
    
    return [
        AlertOut(
            id=r[0], 
            severity=r[1], 
            message=r[2], 
            is_resolved=r[3], 
            status=r[4] or 'active', 
            created_at=r[5], 
            user_id=r[6], 
            username=r[7]
        ) 
        for r in rows
    ]

# 1b. Operational Alerts (for managers/employees/owners)
@router.get("/alerts/operational", response_model=List[AlertOut])
def get_operational_alerts(current_user: Annotated[User, Depends(check_role("employee"))]):
    """Get only operational alerts (Shelf Restock, Low Stock, Added to Order) - accessible to all staff roles."""
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT a.id, a.severity, a.message, a.is_resolved, a.status, a.created_at, a.user_id, u.username 
        FROM system_alerts a
        LEFT JOIN users u ON a.user_id = u.id
        WHERE (a.message LIKE '%SHELF RESTOCK NEEDED%' OR a.message LIKE '%LOW STOCK%' OR a.message LIKE '%ADDED TO ORDER%')
        ORDER BY 
            CASE WHEN a.status = 'active' THEN 1 
                 WHEN a.status = 'pending_user' THEN 2 
                 ELSE 3 END, 
            a.created_at DESC
    """)
    rows = cur.fetchall()
    cur.close()
    conn.close()
    
    return [
        AlertOut(
            id=r[0], 
            severity=r[1], 
            message=r[2], 
            is_resolved=r[3], 
            status=r[4] or 'active', 
            created_at=r[5], 
            user_id=r[6], 
            username=r[7]
        ) 
        for r in rows
    ]

# 1b. Staff: Get Shelf Restock Alerts (for Dashboard)
@router.get("/alerts/shelf-restock")
def get_shelf_restock_alerts(current_user: Annotated[User, Depends(get_current_user)]):
    """
    Returns unresolved shelf restock alerts. 
    Accessible to owner, manager, and employee roles for dashboard notifications.
    """
    ALLOWED_ROLES = ["owner", "manager", "employee"]
    if not any(role in current_user.roles for role in ALLOWED_ROLES):
        raise HTTPException(status_code=403, detail="Not authorized to view shelf restock alerts")
    
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT id, severity, message, is_resolved, status, created_at
            FROM system_alerts 
            WHERE is_resolved = FALSE 
              AND message LIKE '%SHELF RESTOCK%'
            ORDER BY created_at DESC
        """)
        rows = cur.fetchall()
        
        return [
            {
                "id": r[0],
                "severity": r[1],
                "message": r[2],
                "is_resolved": r[3],
                "status": r[4] or 'active',
                "created_at": r[5]
            }
            for r in rows
        ]
    finally:
        cur.close()
        conn.close()

# 2. User: Report Issue
@router.post("/alerts/report")
def report_issue(
    alert: CreateAlert,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)]
):
    conn = get_db_connection()
    cur = conn.cursor()
    
    full_message = f"[{current_user.username}] Reported: {alert.message}"
    
    cur.execute(
        "INSERT INTO system_alerts (severity, message, is_resolved, status, user_id) VALUES (%s, %s, FALSE, 'active', %s) RETURNING id",
        (alert.severity, full_message, current_user.id)
    )
    new_id = cur.fetchone()[0]
    conn.commit()
    
    create_audit_log(current_user, "REPORT_ISSUE", request, "system_alerts", new_id, {"message": alert.message})
    
    cur.close()
    conn.close()
    return {"status": "success", "message": "Issue reported. Track it in your Support History."}

# 3. User: Get My History
@router.get("/alerts/my", response_model=List[AlertOut])
def get_my_alerts(current_user: Annotated[User, Depends(get_current_user)]):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, severity, message, is_resolved, status, created_at, user_id 
        FROM system_alerts 
        WHERE user_id = %s 
        ORDER BY created_at DESC
    """, (current_user.id,))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    
    return [
        AlertOut(
            id=r[0], severity=r[1], message=r[2], is_resolved=r[3], status=r[4] or 'open', 
            created_at=r[5], user_id=r[6], username=current_user.username
        ) 
        for r in rows
    ]

# 4. Admin: Request Closure
@router.put("/alerts/{alert_id}/request_closure")
def request_alert_closure(
    alert_id: int,
    request: Request,
    current_user: Annotated[User, Depends(check_role("it_admin"))]
):
    conn = get_db_connection()
    cur = conn.cursor()
    
    cur.execute("UPDATE system_alerts SET status = 'pending_user' WHERE id = %s RETURNING id", (alert_id,))
    if not cur.fetchone():
        conn.close()
        raise HTTPException(404, "Alert not found")
        
    conn.commit()
    create_audit_log(current_user, "REQ_CLOSURE", request, "system_alerts", alert_id, {"status": "pending_user"})
    
    cur.close()
    conn.close()
    return {"status": "success", "message": "User has been notified to confirm the fix."}

# 5. User: Confirm Fix
@router.put("/alerts/{alert_id}/confirm_fix")
def confirm_alert_fix(
    alert_id: int,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)]
):
    conn = get_db_connection()
    cur = conn.cursor()
    
    cur.execute("SELECT user_id FROM system_alerts WHERE id = %s", (alert_id,))
    res = cur.fetchone()
    if not res:
        conn.close()
        raise HTTPException(404, "Alert not found")
    
    is_owner = res[0] == current_user.id
    is_admin = "it_admin" in current_user.roles
    
    if not (is_owner or is_admin):
         conn.close()
         raise HTTPException(403, "You cannot close someone else's ticket.")

    cur.execute("UPDATE system_alerts SET status = 'resolved', is_resolved = TRUE WHERE id = %s", (alert_id,))
    conn.commit()
    
    create_audit_log(current_user, "CONFIRM_FIX", request, "system_alerts", alert_id, {"status": "resolved"})
    
    cur.close()
    conn.close()
    return {"status": "success", "message": "Ticket closed. Thank you!"}

# 5b. Admin: Direct Resolve Alert
@router.patch("/alerts/{alert_id}/resolve")
def resolve_alert(
    alert_id: int,
    request: Request,
    current_user: Annotated[User, Depends(check_role("it_admin"))]
):
    """
    IT Admin can directly mark any alert as resolved.
    """
    conn = get_db_connection()
    cur = conn.cursor()
    
    cur.execute(
        "UPDATE system_alerts SET status = 'resolved', is_resolved = TRUE WHERE id = %s RETURNING id", 
        (alert_id,)
    )
    if not cur.fetchone():
        conn.close()
        raise HTTPException(404, "Alert not found")
        
    conn.commit()
    create_audit_log(current_user, "RESOLVE_ALERT", request, "system_alerts", alert_id, {"action": "direct_resolve"})
    
    cur.close()
    conn.close()
    return {"status": "success", "message": "Alert marked as resolved."}

# 6. Trigger Manual Backup (UPDATED for 'manual' prefix)
@router.post("/backup")
def create_manual_backup(
    request: Request,
    current_user: Annotated[User, Depends(check_role("it_admin"))]
):
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"backup_manual_{timestamp}.sql" # Prefix ensures it's distinct
    filepath = os.path.join(BACKUP_DIR, filename)
    
    try:
        # Include --clean --if-exists for safe restores
        cmd = [
            "docker", "exec", "-t", CONTAINER_NAME, 
            "pg_dump", 
            "-U", DB_USER, 
            "--clean",
            "--if-exists",
            DB_NAME
        ]
        
        with open(filepath, "w") as outfile:
            process = subprocess.run(
                cmd,
                stdout=outfile,
                stderr=subprocess.PIPE,
                text=True 
            )
            
        if process.returncode != 0:
            raise Exception(f"Backup failed. Docker Error: {process.stderr.strip()}")

        # Log backup creation to operations_log
        create_operation_log(
            user=current_user,
            operation_type="backup",
            request=request,
            sub_type="create",
            file_name=filename,
            details={"path": os.path.abspath(filepath), "size_mb": round(os.path.getsize(filepath) / (1024*1024), 2)}
        )

        return {
            "status": "success", 
            "message": "Manual backup created successfully",
            "file": filename,
            "path": os.path.abspath(filepath)
        }

    except Exception as e:
        error_message = str(e)
        conn = get_db_connection()
        if conn:
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO system_alerts (severity, message, is_resolved, status) VALUES (%s, %s, FALSE, 'active')",
                ("critical", f"Backup Process Error: {error_message}")
            )
            conn.commit()
            conn.close()
            
        raise HTTPException(status_code=500, detail=error_message)

# 7. List Backups (Categorized)
@router.get("/backups", response_model=List[BackupFile])
def list_backups(current_user: Annotated[User, Depends(check_role("it_admin"))]):
    try:
        files = glob.glob(os.path.join(BACKUP_DIR, "*.sql"))
        backup_list = []

        for f in files:
            stats = os.stat(f)
            created_at = datetime.fromtimestamp(stats.st_mtime).strftime('%Y-%m-%d %H:%M:%S')
            size_mb = round(stats.st_size / (1024 * 1024), 2)
            fname = os.path.basename(f)
            
            # Determine type based on filename prefix
            b_type = "auto" if "backup_auto_" in fname else "manual"

            backup_list.append(BackupFile(
                filename=fname,
                created_at=created_at,
                size_mb=size_mb,
                type=b_type
            ))

        backup_list.sort(key=lambda x: x.created_at, reverse=True)
        return backup_list

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list backups: {str(e)}")

# 8. Restore Backup (True Clean Slate)
@router.post("/restore/{filename}")
def restore_backup(
    filename: str, 
    request: Request,
    current_user: Annotated[User, Depends(check_role("it_admin"))]
):
    # Security Check
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    filepath = os.path.join(BACKUP_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Backup file not found")

    try:
        print(f"Starting Clean Restore from {filename}...")

        # STEP 1: WIPE THE DATABASE (The "Clean Slate" Step)
        # This deletes ALL tables, sequences, and functions in the 'public' schema.
        wipe_cmd = [
            "docker", "exec", "-i", CONTAINER_NAME, 
            "psql", "-U", DB_USER, "-d", DB_NAME, 
            "-c", "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres; GRANT ALL ON SCHEMA public TO public;"
        ]
        
        wipe_process = subprocess.run(
            wipe_cmd,
            capture_output=True,
            text=True
        )

        if wipe_process.returncode != 0:
            raise Exception(f"Wipe failed. Database might be locked. Error: {wipe_process.stderr}")

        # STEP 2: RESTORE THE BACKUP
        with open(filepath, "r") as infile:
            restore_cmd = ["docker", "exec", "-i", CONTAINER_NAME, "psql", "-U", DB_USER, "-d", DB_NAME]
            
            restore_process = subprocess.run(
                restore_cmd,
                stdin=infile,
                capture_output=True,
                text=True
            )
            
            if restore_process.returncode != 0:
                raise Exception(f"Restore failed. Docker/PSQL Error: {restore_process.stderr}")

        # Log success to operations_log
        create_operation_log(
            user=current_user,
            operation_type="backup",
            request=request,
            sub_type="restore",
            file_name=filename,
            details={"status": "success"}
        )

        return {"status": "success", "message": f"Database successfully wiped and restored from {filename}"}

    except Exception as e:
        print(f"Restore Failed: {str(e)}")
        
        # Log failure to operations_log
        create_operation_log(
            user=current_user,
            operation_type="backup",
            request=request,
            sub_type="restore_fail",
            file_name=filename,
            details={"error": str(e)}
        )
        
        raise HTTPException(status_code=500, detail=f"Restore failed: {str(e)}")

# 9. Delete Backup
@router.delete("/backups/{filename}")
def delete_backup(
    filename: str,
    current_user: Annotated[User, Depends(check_role("it_admin"))]
):
    # Security: Prevent path traversal
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    filepath = os.path.join(BACKUP_DIR, filename)
    
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Backup file not found")

    try:
        os.remove(filepath)
        return {"status": "success", "message": f"Backup {filename} deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete file: {str(e)}")

# ==========================================
# 10. AUDIT LOGS - IT Admin Investigation Tool
# ==========================================

class AuditLogOut(BaseModel):
    id: int
    timestamp: str  # Formatted as IST string
    username: str
    action: str
    target_table: Optional[str]
    target_id: Optional[int]
    ip_address: Optional[str]
    details: Optional[dict]

class AuditLogResponse(BaseModel):
    data: List[AuditLogOut]
    total: int
    page: int
    pages: int
    limit: int

@router.get("/audit-logs", response_model=AuditLogResponse)
def get_audit_logs(
    current_user: Annotated[User, Depends(check_role("it_admin"))],
    page: int = 1,
    limit: int = 50,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    username: Optional[str] = None,
    action: Optional[str] = None,
    search: Optional[str] = None
):
    """
    Paginated audit log viewer for IT admins.
    Supports filtering by date range, username, action type, and keyword search.
    """
    if page < 1:
        page = 1
    if limit < 1 or limit > 100:
        limit = 50
    
    offset = (page - 1) * limit
    
    conn = get_db_connection()
    cur = conn.cursor()
    
    try:
        # Build WHERE clause dynamically
        conditions = []
        params = []
        
        if start_date:
            conditions.append("timestamp >= %s")
            params.append(start_date)
        
        if end_date:
            conditions.append("timestamp <= %s::date + interval '1 day'")
            params.append(end_date)
        
        if username:
            conditions.append("username ILIKE %s")
            params.append(f"%{username}%")
        
        if action:
            conditions.append("action = %s")
            params.append(action)
        
        if search:
            conditions.append("(details::text ILIKE %s OR action ILIKE %s OR target_table ILIKE %s)")
            params.extend([f"%{search}%", f"%{search}%", f"%{search}%"])
        
        where_clause = ""
        if conditions:
            where_clause = "WHERE " + " AND ".join(conditions)
        
        # Get total count for pagination
        count_query = f"SELECT COUNT(*) FROM audit_logs {where_clause}"
        cur.execute(count_query, tuple(params))
        total = cur.fetchone()[0]
        
        # Get paginated data (convert timestamp to IST by adding 5:30)
        data_query = f"""
            SELECT 
                id, 
                (timestamp + INTERVAL '5 hours 30 minutes') as timestamp,
                username, 
                action, 
                target_table, 
                target_id, 
                ip_address, 
                details
            FROM audit_logs 
            {where_clause}
            ORDER BY timestamp DESC
            LIMIT %s OFFSET %s
        """
        cur.execute(data_query, tuple(params) + (limit, offset))
        rows = cur.fetchall()
        
        logs = [
            AuditLogOut(
                id=r[0],
                timestamp=r[1].strftime('%Y-%m-%d %H:%M:%S') if r[1] else '',
                username=r[2] or "System",
                action=r[3],
                target_table=r[4],
                target_id=r[5],
                ip_address=r[6],
                details=r[7] if r[7] else {}
            )
            for r in rows
        ]
        
        total_pages = (total + limit - 1) // limit  # Ceiling division
        
        return AuditLogResponse(
            data=logs,
            total=total,
            page=page,
            pages=total_pages,
            limit=limit
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@router.get("/audit-logs/actions")
def get_audit_log_actions(current_user: Annotated[User, Depends(check_role("it_admin"))]):
    """Get list of unique action types for filter dropdown."""
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT DISTINCT action FROM audit_logs ORDER BY action")
        actions = [r[0] for r in cur.fetchall()]
        return {"actions": actions}
    finally:
        cur.close()
        conn.close()


# ==========================================
# 11. OPERATIONS LOG - Write-offs & Backups History
# ==========================================

class OperationsLogOut(BaseModel):
    id: int
    timestamp: str
    username: Optional[str]
    operation_type: str
    sub_type: Optional[str]
    target_id: Optional[int]
    quantity: Optional[int]
    reason: Optional[str]
    file_name: Optional[str]
    ip_address: Optional[str]
    details: Optional[dict]

class OperationsLogResponse(BaseModel):
    data: List[OperationsLogOut]
    total: int
    page: int
    pages: int
    limit: int

@router.get("/operations-logs", response_model=OperationsLogResponse)
def get_operations_logs(
    current_user: Annotated[User, Depends(check_role("employee"))],
    page: int = 1,
    limit: int = 50,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    username: Optional[str] = None,
    operation_type: Optional[str] = None,
    search: Optional[str] = None
):
    """
    Paginated operations log viewer for staff.
    Shows write-offs and backup operations.
    Supports filtering by date range, username, operation type, and keyword search.
    """
    if page < 1:
        page = 1
    if limit < 1 or limit > 100:
        limit = 50
    
    offset = (page - 1) * limit
    
    conn = get_db_connection()
    cur = conn.cursor()
    
    try:
        # Build WHERE clause dynamically
        conditions = []
        params = []
        
        if start_date:
            conditions.append("created_at >= %s")
            params.append(start_date)
        
        if end_date:
            conditions.append("created_at <= %s::date + interval '1 day'")
            params.append(end_date)
        
        if username:
            conditions.append("username ILIKE %s")
            params.append(f"%{username}%")
        
        if operation_type:
            conditions.append("operation_type = %s")
            params.append(operation_type)
        
        if search:
            conditions.append("(reason ILIKE %s OR file_name ILIKE %s OR details::text ILIKE %s)")
            params.extend([f"%{search}%", f"%{search}%", f"%{search}%"])
        
        where_clause = ""
        if conditions:
            where_clause = "WHERE " + " AND ".join(conditions)
        
        # Get total count for pagination
        count_query = f"SELECT COUNT(*) FROM operations_log {where_clause}"
        cur.execute(count_query, tuple(params))
        total = cur.fetchone()[0]
        
        # Get paginated data (convert timestamp to IST by adding 5:30)
        data_query = f"""
            SELECT 
                id, 
                (created_at + INTERVAL '5 hours 30 minutes') as created_at,
                username, 
                operation_type, 
                sub_type,
                target_id,
                quantity,
                reason,
                file_name,
                ip_address,
                details
            FROM operations_log 
            {where_clause}
            ORDER BY created_at DESC
            LIMIT %s OFFSET %s
        """
        cur.execute(data_query, tuple(params) + (limit, offset))
        rows = cur.fetchall()
        
        logs = [
            OperationsLogOut(
                id=r[0],
                timestamp=r[1].strftime('%Y-%m-%d %H:%M:%S') if r[1] else '',
                username=r[2] or "System",
                operation_type=r[3],
                sub_type=r[4],
                target_id=r[5],
                quantity=r[6],
                reason=r[7],
                file_name=r[8],
                ip_address=r[9],
                details=r[10] if r[10] else {}
            )
            for r in rows
        ]
        
        total_pages = (total + limit - 1) // limit  # Ceiling division
        
        return OperationsLogResponse(
            data=logs,
            total=total,
            page=page,
            pages=total_pages,
            limit=limit
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@router.get("/operations-logs/types")
def get_operations_log_types(current_user: Annotated[User, Depends(check_role("employee"))]):
    """Get list of unique operation types for filter dropdown."""
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT DISTINCT operation_type FROM operations_log WHERE operation_type != 'alert_created' ORDER BY operation_type")
        types = [r[0] for r in cur.fetchall()]
        return {"types": types}
    finally:
        cur.close()
        conn.close()