from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from typing import Annotated, List, Optional
import psycopg2
import os
from dotenv import load_dotenv
from datetime import datetime

# --- New Imports for Security ---
from security import check_role, User, get_db_connection, get_current_user, create_audit_log

router = APIRouter(
    prefix="/api/v1/locations",
    tags=["Locations"]
)

# --- Load Environment Variables ---
load_dotenv()
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASS = os.getenv("DB_PASS")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")

# --- Pydantic Data Models ---

# Input model (what the user sends)
class Location(BaseModel):
    name: str
    description: str | None = None
    location_type: str = "warehouse" # Default to warehouse if not specified

# Output model (what we send back)
class LocationOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    location_type: str # <--- Added this field
    created_at: datetime

# --- API Endpoints for Locations ---

# 1. Create a New Location (SECURED: Manager Only)
@router.post("/", response_model=LocationOut)
def create_location(
    location: Location,
    request: Request,
    current_user: Annotated[User, Depends(check_role("manager"))]
):
    conn = None
    # UPDATED: Added location_type
    sql = """
    INSERT INTO locations (name, description, location_type) 
    VALUES (%s, %s, %s) 
    RETURNING id, name, description, location_type, created_at;
    """
    try:
        conn = get_db_connection()
        if conn is None:
            raise HTTPException(status_code=500, detail="Database connection failed")
        
        cur = conn.cursor()
        cur.execute(sql, (location.name, location.description, location.location_type))
        new_location = cur.fetchone()
        conn.commit()
        
        new_location_id = new_location[0]
        
        # --- AUDIT LOGGING ---
        create_audit_log(
            user=current_user,
            action="CREATE_LOCATION",
            request=request,
            target_table="locations",
            target_id=new_location_id,
            details={"new_name": location.name, "type": location.location_type}
        )
        
        cur.close()
        
        return LocationOut(
            id=new_location[0],
            name=new_location[1],
            description=new_location[2],
            location_type=new_location[3],
            created_at=new_location[4]
        )
    except Exception as e:
        if conn:
            conn.rollback()
        if "unique constraint" in str(e):
            raise HTTPException(status_code=409, detail="A location with this name already exists.")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

# 2. Get All Locations (PUBLIC)
@router.get("/", response_model=List[LocationOut])
def get_all_locations():
    # This endpoint is public for customers/employees to browse
    conn = None
    # UPDATED: Added location_type
    sql = "SELECT id, name, description, location_type, created_at FROM locations ORDER BY name ASC"
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(sql)
        locations = cur.fetchall()
        cur.close()
        
        locations_list = []
        for loc in locations:
            locations_list.append(LocationOut(
                id=loc[0],
                name=loc[1],
                description=loc[2],
                location_type=loc[3],
                created_at=loc[4]
            ))
        return locations_list
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

# 3. Get a Single Location by ID (PUBLIC)
@router.get("/{location_id}", response_model=LocationOut)
def get_location_by_id(location_id: int):
    # This endpoint is public
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        # UPDATED: Added location_type
        cur.execute("SELECT id, name, description, location_type, created_at FROM locations WHERE id = %s", (location_id,))
        loc = cur.fetchone()
        cur.close()
        
        if not loc:
            raise HTTPException(status_code=404, detail="Location not found")
            
        return LocationOut(
            id=loc[0],
            name=loc[1],
            description=loc[2],
            location_type=loc[3],
            created_at=loc[4]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

# 4. Update a Location (SECURED: Manager Only)
@router.put("/{location_id}", response_model=LocationOut)
def update_location(
    location_id: int,
    location: Location,
    request: Request,
    current_user: Annotated[User, Depends(check_role("manager"))]
):
    conn = None
    # UPDATED: Added location_type to update logic
    sql = """
    UPDATE locations 
    SET name = %s, description = %s, location_type = %s
    WHERE id = %s 
    RETURNING id, name, description, location_type, created_at;
    """
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(sql, (location.name, location.description, location.location_type, location_id))
        updated_loc = cur.fetchone()
        
        if updated_loc is None:
            raise HTTPException(status_code=404, detail="Location not found")
        
        conn.commit()
        
        # --- AUDIT LOGGING ---
        create_audit_log(
            user=current_user,
            action="UPDATE_LOCATION",
            request=request,
            target_table="locations",
            target_id=location_id,
            details={"new_name": location.name, "new_type": location.location_type}
        )
        
        cur.close()
        
        return LocationOut(
            id=updated_loc[0],
            name=updated_loc[1],
            description=updated_loc[2],
            location_type=updated_loc[3],
            created_at=updated_loc[4]
        )
    except Exception as e:
        if conn:
            conn.rollback()
        if "unique constraint" in str(e):
            raise HTTPException(status_code=409, detail="A location with this name already exists.")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

# 5. Delete a Location (SECURED: IT Admin Only)
@router.delete("/{location_id}")
def delete_location(
    location_id: int,
    request: Request,
    current_user: Annotated[User, Depends(check_role("manager"))]
):
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("DELETE FROM locations WHERE id = %s RETURNING id, name", (location_id,))
        deleted_row = cur.fetchone()
        
        if deleted_row is None:
            raise HTTPException(status_code=404, detail="Location not found")
            
        conn.commit()
        
        # --- AUDIT LOGGING ---
        create_audit_log(
            user=current_user,
            action="DELETE_LOCATION",
            request=request,
            target_table="locations",
            target_id=deleted_row[0],
            details={"deleted_name": deleted_row[1]}
        )
        
        cur.close()
        
        return {"status": "success", "message": "Location deleted successfully"}
    except HTTPException as e:
        raise e
    except Exception as e:
        if conn:
            conn.rollback()
        # This will catch our "ON DELETE RESTRICT" error from inventory_batches
        if "foreign key constraint" in str(e):
            raise HTTPException(status_code=400, detail="Cannot delete location: it is still in use by inventory batches.")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()