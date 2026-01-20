from fastapi import APIRouter, HTTPException, Depends, Response, Query
from fastapi.responses import StreamingResponse
from typing import Annotated, Literal, Optional
import pandas as pd
import io
from datetime import datetime
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool
import os
from dotenv import load_dotenv

# ReportLab imports for PDF generation
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

try:
    from security import check_role, User
except ImportError:
    import sys
    import os
    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from security import check_role, User

load_dotenv()

router = APIRouter(
    prefix="/api/v1/reports",
    tags=["Reports"]
)

# ==========================================
# SQLAlchemy Engine Setup
# ==========================================

def get_sqlalchemy_engine():
    db_url = os.getenv('DATABASE_URL')
    if not db_url:
        db_user = os.getenv("DB_USER", "postgres")
        db_pass = os.getenv("DB_PASS", "password")
        db_host = os.getenv("DB_HOST", "localhost")
        db_port = os.getenv("DB_PORT", "5432")
        db_name = os.getenv("DB_NAME", "postgres")
        db_url = f"postgresql+psycopg2://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}"
    
    if db_url.startswith('postgresql://'):
        db_url = db_url.replace('postgresql://', 'postgresql+psycopg2://', 1)
    elif db_url.startswith('postgres://'):
        db_url = db_url.replace('postgres://', 'postgresql+psycopg2://', 1)
    
    engine = create_engine(db_url, poolclass=NullPool)
    return engine

# ==========================================
# 🛠️ HELPER: DATA FORMATTING & EXPORT (FIXED)
# ==========================================

def _format_dataframe_for_export(df: pd.DataFrame, for_csv: bool = False) -> pd.DataFrame:
    """
    Safely converts date objects to string YYYY-MM-DD.
    Formats currency columns with ₹ symbol.
    Handles NaT/NaN gracefully to avoid 'Invalid Date' on frontend.
    """
    df_formatted = df.copy()
    
    # Currency column identifiers - expanded list to capture all monetary fields
    currency_keywords = ['cost', 'amount', 'value', 'price', 'profit', 'revenue', 'margin', 'total', 'sales', 'worth', 'lost', 'expense', 'earning', 'fee', 'charge', 'valuation']
    
    for col in df_formatted.columns:
        col_lower = col.lower()
        
        # Identify date columns
        if any(x in col_lower for x in ['date', 'received_at', 'timestamp', 'expiry', 'inward', 'created_at']):
            try:
                # Convert to datetime, coercing errors to NaT
                df_formatted[col] = pd.to_datetime(df_formatted[col], errors='coerce')
                
                # Format as string YYYY-MM-DD
                if for_csv:
                    # Add space for CSV to prevent Excel auto-formatting
                    df_formatted[col] = df_formatted[col].dt.strftime(' %Y-%m-%d')
                else:
                    df_formatted[col] = df_formatted[col].dt.strftime('%Y-%m-%d')
                
                # Replace NaT/NaN with empty string
                df_formatted[col] = df_formatted[col].fillna('')
                df_formatted[col] = df_formatted[col].astype(str).replace('NaT', '').replace('nan', '')
            except Exception:
                # If conversion fails, just leave it as string but ensure no NaN
                df_formatted[col] = df_formatted[col].fillna('').astype(str)
        
        # Identify currency columns and format with ₹ symbol (only for PDF, not CSV)
        elif not for_csv and any(x in col_lower for x in currency_keywords) and pd.api.types.is_numeric_dtype(df_formatted[col]):
            df_formatted[col] = df_formatted[col].fillna(0).apply(lambda x: f"₹{x:,.2f}" if pd.notna(x) else "₹0.00")
        
        else:
            # Handle non-date columns: fill NaN with empty string or 0 depending on type
            if pd.api.types.is_numeric_dtype(df_formatted[col]):
                df_formatted[col] = df_formatted[col].fillna(0)
            else:
                df_formatted[col] = df_formatted[col].fillna('').astype(str)

    return df_formatted

def _export_pdf(df: pd.DataFrame, title: str, filename: str, orientation='portrait', filter_context: str = None) -> StreamingResponse:
    """Helper to export DataFrame as PDF with Smart Column Sizing"""
    buffer = io.BytesIO()
    
    # Register Unicode font for rupee symbol support
    try:
        import os.path as osp
        font_paths = [
            ('C:/Windows/Fonts/arial.ttf', 'C:/Windows/Fonts/arialbd.ttf'),
            ('C:/Windows/Fonts/segoeui.ttf', 'C:/Windows/Fonts/segoeuib.ttf'),
        ]
        for regular_path, bold_path in font_paths:
            if osp.exists(regular_path):
                pdfmetrics.registerFont(TTFont('UniFont', regular_path))
                if osp.exists(bold_path):
                    pdfmetrics.registerFont(TTFont('UniFont-Bold', bold_path))
                break
    except Exception as e:
        print(f"Could not register Unicode font: {e}")
    
    if orientation == 'landscape':
        pagesize = landscape(A4)
        page_width = A4[1] 
    else:
        pagesize = A4
        page_width = A4[0] 

    doc = SimpleDocTemplate(
        buffer, 
        pagesize=pagesize, 
        topMargin=0.5*inch, 
        bottomMargin=0.5*inch, 
        leftMargin=0.3*inch, 
        rightMargin=0.3*inch
    )
    elements = []
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=16,
        textColor=colors.HexColor('#1e293b'),
        spaceAfter=12,
        alignment=1 
    )
    
    elements.append(Paragraph(title, title_style))
    elements.append(Paragraph(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}", styles['Normal']))
    
    if filter_context:
        filter_style = ParagraphStyle(
            'FilterContext',
            parent=styles['Normal'],
            fontSize=9,
            textColor=colors.HexColor('#64748b'),
            spaceBefore=4
        )
        elements.append(Paragraph(f"<b>Parameters:</b> {filter_context}", filter_style))
    
    elements.append(Spacer(1, 0.3*inch))
    
    if df.empty:
        elements.append(Paragraph("No records found matching the criteria.", styles['Normal']))
    else:
        # Format dates before creating PDF table
        df = _format_dataframe_for_export(df, for_csv=False)
        columns = df.columns.tolist()
        
        # Convert all cells to Paragraphs to enable automatic text wrapping
        data = [columns] # Header row remains strings
        
        # Style for table content (smaller font for better fit, use UniFont for ₹ symbol)
        try:
            cell_style = ParagraphStyle(
                'CellStyle',
                parent=styles['Normal'],
                fontName='UniFont',
                fontSize=8,
                leading=10 # Line spacing
            )
        except:
            cell_style = ParagraphStyle(
                'CellStyle',
                parent=styles['Normal'],
                fontSize=8,
                leading=10
            )

        for row in df.values.tolist():
            # Convert each cell value to a Paragraph object for wrapping
            data.append([Paragraph(str(cell), cell_style) for cell in row])
        
        available_width = page_width - (0.6 * inch) 
        
        # Smart Column Width Calculation
        col_weights = []
        for col in columns:
            col_lower = col.lower()
            # FIX: Give 'details' columns massive weight so they get 50%+ of the width
            if 'details' in col_lower or 'description' in col_lower:
                col_weights.append(6.0) 
            elif 'product' in col_lower or 'name' in col_lower or 'supplier' in col_lower or 'reason' in col_lower:
                col_weights.append(2.5) 
            elif 'email' in col_lower or 'category' in col_lower or 'location' in col_lower:
                col_weights.append(2.0) 
            elif 'date' in col_lower or 'time' in col_lower or 'batch' in col_lower or 'sku' in col_lower:
                col_weights.append(1.2) 
            elif 'qty' in col_lower or 'price' in col_lower or 'cost' in col_lower or 'id' in col_lower:
                col_weights.append(0.8) 
            else:
                col_weights.append(1.0) 
        
        total_weight = sum(col_weights)
        col_widths = [(w / total_weight) * available_width for w in col_weights]
        
        table = Table(data, colWidths=col_widths, repeatRows=1)
        
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3b82f6')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'), # Align top for wrapped text
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 8),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.whitesmoke, colors.HexColor('#f8fafc')]),
        ]))
        
        elements.append(table)

    doc.build(elements)
    
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}_{datetime.now().strftime('%Y%m%d')}.pdf"}
    )
def _export_csv(df: pd.DataFrame, filename: str) -> StreamingResponse:
    """Helper to export DataFrame as CSV"""
    df = _format_dataframe_for_export(df, for_csv=True)
    stream = io.StringIO()
    df.to_csv(stream, index=False)
    return StreamingResponse(
        iter([stream.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}_{datetime.now().strftime('%Y%m%d')}.csv"}
    )

# ==========================================
# CATEGORY 1: CURRENT STOCK STATUS
# ==========================================

@router.get("/stock_summary")
def stock_summary_report(
    current_user: Annotated[User, Depends(check_role("employee"))],
    format: Literal['csv', 'pdf', 'json'] = 'csv',
    category: Optional[str] = None,
    supplier: Optional[str] = None,
    stock_status: Optional[str] = Query('all', regex="^(all|in_stock|out_of_stock)$"),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    filter_summary: Optional[str] = None
):
    try:
        engine = get_sqlalchemy_engine()
        
        query_base = """
        SELECT 
            p.sku,
            p.name as product_name,
            p.category,
            s.name as supplier_name,
            COALESCE(SUM(ib.quantity), 0) as total_quantity,
            p.unit_of_measure,
            COALESCE(SUM(ib.quantity * (
                CASE 
                    WHEN COALESCE(ib.unit_cost, 0) > 0 THEN ib.unit_cost 
                    ELSE COALESCE(p.average_cost, 0) 
                END
            )), 0) as current_valuation
        FROM products p
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        LEFT JOIN inventory_batches ib ON p.id = ib.product_id
        """
        
        where_conditions = []
        if category:
            where_conditions.append(f"p.category ILIKE '%%{category}%%'")
        if supplier:
            where_conditions.append(f"s.name ILIKE '%%{supplier}%%'")
        if start_date:
            where_conditions.append(f"ib.received_at >= '{start_date}'")
        if end_date:
            where_conditions.append(f"ib.received_at <= '{end_date}'")
            
        where_clause = "WHERE " + " AND ".join(where_conditions) if where_conditions else ""
        
        having_clause = ""
        if stock_status == 'in_stock':
            having_clause = "HAVING COALESCE(SUM(ib.quantity), 0) > 0"
        elif stock_status == 'out_of_stock':
            having_clause = "HAVING COALESCE(SUM(ib.quantity), 0) = 0"
        
        # UPDATED ORDER BY: Sort by valuation descending
        full_query = f"""
        {query_base}
        {where_clause}
        GROUP BY p.id, p.sku, p.name, p.category, s.name, p.unit_of_measure, p.average_cost
        {having_clause}
        ORDER BY current_valuation DESC, p.name
        """
        
        df = pd.read_sql_query(full_query, engine)
        if not df.empty:
            df['current_valuation'] = df['current_valuation'].round(2)
        
        filename = "stock_summary"
        if stock_status != 'all':
            filename += f"_{stock_status}"
        
        if format == 'csv': return _export_csv(df, filename)
        if format == 'json':
            df_preview = _format_dataframe_for_export(df, for_csv=False)
            return df_preview.to_dict(orient="records")
        else: return _export_pdf(df, "Stock Summary Report", filename, orientation='landscape', filter_context=filter_summary)
    except Exception as e:
        print(f"REPORT ERROR (Stock Summary): {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/location_summary")
def location_summary_report(
    current_user: Annotated[User, Depends(check_role("employee"))],
    format: Literal['csv', 'pdf', 'json'] = 'csv',
    filter_summary: Optional[str] = None
):
    try:
        engine = get_sqlalchemy_engine()
        query = """
        SELECT 
            l.name as location_name,
            p.name as product_name,
            p.sku,
            SUM(ib.quantity) as quantity_at_location
        FROM inventory_batches ib
        JOIN products p ON ib.product_id = p.id
        JOIN locations l ON ib.location_id = l.id
        WHERE ib.quantity > 0
        GROUP BY l.id, l.name, p.id, p.name, p.sku
        ORDER BY l.name, p.name
        """
        df = pd.read_sql_query(query, engine)
        if format == 'csv': return _export_csv(df, "location_summary")
        if format == 'json':
            df_preview = _format_dataframe_for_export(df, for_csv=False)
            return df_preview.to_dict(orient="records")
        else: return _export_pdf(df, "Location/Godown Summary Report", "location_summary", orientation='landscape', filter_context=filter_summary)
    except Exception as e:
        print(f"REPORT ERROR (Location Summary): {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/batch_wise_stock")
def batch_wise_stock_report(
    current_user: Annotated[User, Depends(check_role("employee"))],
    format: Literal['csv', 'pdf', 'json'] = 'csv',
    supplier: Optional[str] = None,
    filter_summary: Optional[str] = None
):
    try:
        engine = get_sqlalchemy_engine()
        
        query_base = """
        SELECT 
            p.name as product_name,
            s.name as supplier_name,
            ib.batch_code,
            ib.quantity,
            ib.expiry_date,
            ib.received_at::date as received_date
        FROM inventory_batches ib
        JOIN products p ON ib.product_id = p.id
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        """

        where_conditions = ["ib.quantity > 0"]
        
        if supplier:
            where_conditions.append(f"s.name ILIKE '%%{supplier}%%'")
            
        where_clause = "WHERE " + " AND ".join(where_conditions)

        full_query = f"""
        {query_base}
        {where_clause}
        ORDER BY p.name, ib.expiry_date ASC
        """

        df = pd.read_sql_query(full_query, engine)
        
        filename = "batch_wise_stock"
        if supplier:
            filename += f"_{supplier}"
        if format == 'json':
            df_preview = _format_dataframe_for_export(df, for_csv=False)
            return df_preview.to_dict(orient="records")
        if format == 'csv': 
            return _export_csv(df, filename)
        else: 
            return _export_pdf(df, "Batch-wise Stock Report", filename, orientation='landscape', filter_context=filter_summary)
            
    except Exception as e:
        print(f"REPORT ERROR (Batch Wise): {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
@router.get("/physical_stock_register")
def physical_stock_register(
    current_user: Annotated[User, Depends(check_role("employee"))],
    format: Literal['csv', 'pdf', 'json'] = 'csv',
    location: Optional[str] = None,
    category: Optional[str] = None,
    blind_mode: bool = False, 
    filter_summary: Optional[str] = None
):
    try:
        engine = get_sqlalchemy_engine()
        
        # UPDATED QUERY:
        # 1. COALESCE(l.name, 'Out of Stock') -> Replaces NULL location with "Out of Stock"
        # 2. We keep the LEFT JOIN logic so products with 0 stock still appear in the list.
        query_base = """
        SELECT 
            p.sku,
            p.name as product_name,
            COALESCE(l.name, 'Out of Stock') as location_name, 
            COALESCE(SUM(ib.quantity), 0) as system_quantity,
            '' as actual_count,
            '' as difference
        FROM products p
        LEFT JOIN inventory_batches ib ON p.id = ib.product_id AND ib.quantity > 0
        LEFT JOIN locations l ON ib.location_id = l.id
        """
        
        where_conditions = []
        if location:
            where_conditions.append(f"l.name ILIKE '%%{location}%%'")
        if category:
            where_conditions.append(f"p.category ILIKE '%%{category}%%'")
            
        where_clause = "WHERE " + " AND ".join(where_conditions) if where_conditions else ""
        
        # Updated GROUP BY to match the new SELECT
        full_query = f"""
        {query_base}
        {where_clause}
        GROUP BY p.id, p.sku, p.name, l.name
        ORDER BY 
            CASE WHEN l.name IS NULL THEN 1 ELSE 0 END, -- Put 'Out of Stock' items at the bottom
            l.name, 
            p.name
        """
        
        df = pd.read_sql_query(full_query, engine)
        
        if blind_mode:
            # If blind mode is on, hide the system quantity so auditors actually count
            # But if it's 'Out of Stock', we can leave it as 0 or show '-' to indicate "Skip this"
            df['system_quantity'] = df.apply(
                lambda row: "0" if row['location_name'] == 'Out of Stock' else "_______", 
                axis=1
            )
            
        title = "Physical Stock Audit Sheet"
        if blind_mode:
            title += " (BLIND COUNT)"
            
        if format == 'json':
            df_preview = _format_dataframe_for_export(df, for_csv=False)
            return df_preview.to_dict(orient="records")  
        if format == 'csv': 
            return _export_csv(df, "physical_stock_audit")
        else: 
            return _export_pdf(df, title, "physical_stock_audit", orientation='portrait', filter_context=filter_summary)
            
    except Exception as e:
        print(f"REPORT ERROR (Audit): {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# CATEGORY 2: INVENTORY HEALTH & ALERTS
# ==========================================

@router.get("/low_stock_reorder")
def low_stock_reorder_report(
    current_user: Annotated[User, Depends(check_role("employee"))],
    format: Literal['csv', 'pdf', 'json'] = 'csv', 
    reorder_threshold: int = Query(20),
    category: Optional[str] = None,
    location: Optional[str] = None,
    supplier: Optional[str] = None,
    filter_summary: Optional[str] = None
):
    try:
        engine = get_sqlalchemy_engine()
        
        params = {"threshold": reorder_threshold}
        
        filters = []
        if category:
            filters.append("p.category ILIKE :category")
            params["category"] = f"%{category}%"
        if supplier:
            filters.append("s.name ILIKE :supplier")
            params["supplier"] = f"%{supplier}%"
            
        loc_join_condition = ""
        if location:
            loc_join_condition = "AND ib.location_id IN (SELECT id FROM locations WHERE name ILIKE :location)"
            params["location"] = f"%{location}%"

        where_clause = ""
        if filters:
            where_clause = "AND " + " AND ".join(filters)

        # FIXED: Simplified draft_order_id query
        query_str = f"""
        SELECT 
            p.id as product_id,
            p.name as product_name,
            p.category,
            s.id as supplier_id,
            s.name as supplier_name,
            COALESCE(p.average_cost, 0) as average_cost,
            COALESCE(SUM(ib.quantity), 0) as current_stock,
            :threshold as reorder_level,
            GREATEST(:threshold - COALESCE(SUM(ib.quantity), 0), 0) as shortage,

            -- Incoming Stock (Status: 'placed')
            COALESCE((
                SELECT SUM(poi.quantity_ordered)
                FROM purchase_order_items poi
                JOIN purchase_orders po ON poi.po_id = po.id
                WHERE poi.product_id = p.id AND po.status = 'placed'
            ), 0) as quantity_on_order,
            
            -- Get the actual supplier name from placed orders
            (
                SELECT sup.name
                FROM purchase_orders po
                JOIN purchase_order_items poi ON poi.po_id = po.id
                JOIN suppliers sup ON po.supplier_id = sup.id
                WHERE po.status = 'placed'
                AND poi.product_id = p.id
                ORDER BY po.created_at DESC
                LIMIT 1
            ) as placed_supplier_name,

            -- Pending Drafts (Status: 'draft')
            COALESCE((
                SELECT SUM(poi.quantity_ordered)
                FROM purchase_order_items poi
                JOIN purchase_orders po ON poi.po_id = po.id
                WHERE poi.product_id = p.id AND po.status = 'draft'
            ), 0) as quantity_in_draft,
            
            -- Find draft order that actually contains this product (any supplier)
            (
                SELECT po.id
                FROM purchase_orders po
                JOIN purchase_order_items poi ON poi.po_id = po.id
                WHERE po.status = 'draft'
                AND poi.product_id = p.id
                ORDER BY po.created_at DESC
                LIMIT 1
            ) as draft_order_id,
            
            -- Get the actual supplier name from the draft order
            (
                SELECT sup.name
                FROM purchase_orders po
                JOIN purchase_order_items poi ON poi.po_id = po.id
                JOIN suppliers sup ON po.supplier_id = sup.id
                WHERE po.status = 'draft'
                AND poi.product_id = p.id
                ORDER BY po.created_at DESC
                LIMIT 1
            ) as draft_supplier_name

        FROM products p
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        LEFT JOIN inventory_batches ib ON p.id = ib.product_id {loc_join_condition}
        
        WHERE 1=1 {where_clause}
        
        GROUP BY p.id, p.name, p.category, s.id, s.name, p.average_cost
        HAVING COALESCE(SUM(ib.quantity), 0) < :threshold
        ORDER BY shortage DESC
        """
        
        query = text(query_str)
        
        with engine.connect() as conn:
            df = pd.read_sql_query(query, conn, params=params)
        
        title = f"Low Stock Report (< {reorder_threshold})"
        if location: title += f" - {location}"
        
        if format == 'json':
            df_preview = _format_dataframe_for_export(df, for_csv=False)
            return df_preview.to_dict(orient="records")  
        if format == 'csv': 
            return _export_csv(df, "low_stock_reorder")
        else: 
            return _export_pdf(df, title, "low_stock_reorder", orientation='landscape', filter_context=filter_summary)
            
    except Exception as e:
        print(f"REPORT ERROR (Low Stock): {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    
@router.get("/stock_ageing")
def stock_ageing_report(
    current_user: Annotated[User, Depends(check_role("employee"))],
    format: Literal['csv', 'pdf', 'json'] = 'csv',
    category: Optional[str] = None,
    location: Optional[str] = None,
    supplier: Optional[str] = None,
    filter_summary: Optional[str] = None
):
    try:
        engine = get_sqlalchemy_engine()
        
        query = """
        SELECT 
            p.name as product,
            p.category,
            s.name as supplier,
            SUM(CASE WHEN CURRENT_DATE - ib.received_at::date < 30 THEN ib.quantity ELSE 0 END) as "<30 Days",
            SUM(CASE WHEN CURRENT_DATE - ib.received_at::date BETWEEN 30 AND 60 THEN ib.quantity ELSE 0 END) as "30-60 Days",
            SUM(CASE WHEN CURRENT_DATE - ib.received_at::date > 60 THEN ib.quantity ELSE 0 END) as ">60 Days"
        FROM inventory_batches ib
        JOIN products p ON ib.product_id = p.id
        LEFT JOIN locations l ON ib.location_id = l.id
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        WHERE ib.quantity > 0
        """

        if category:
            query += f" AND p.category ILIKE '%%{category}%%'"
        if location:
            query += f" AND l.name ILIKE '%%{location}%%'"
        if supplier:
            query += f" AND s.name ILIKE '%%{supplier}%%'"

        query += """
        GROUP BY p.id, p.name, p.category, s.name
        ORDER BY p.name
        """

        df = pd.read_sql_query(query, engine)
        
        title = "Stock Ageing Analysis"
        if location:
            title += f" - {location}"
        if format == 'json':
            df_preview = _format_dataframe_for_export(df, for_csv=False)
            return df_preview.to_dict(orient="records")
        if format == 'csv': 
            return _export_csv(df, "stock_ageing")
        else: 
            return _export_pdf(df, title, "stock_ageing", orientation='landscape', filter_context=filter_summary)
            
    except Exception as e:
        print(f"REPORT ERROR (Ageing): {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/near_expiry")
def near_expiry_report(
    current_user: Annotated[User, Depends(check_role("employee"))],
    format: Literal['csv', 'pdf', 'json'] = 'csv',
    days_threshold: int = Query(30),
    category: Optional[str] = None,
    location: Optional[str] = None,
    supplier: Optional[str] = None,
    filter_summary: Optional[str] = None
):
    try:
        engine = get_sqlalchemy_engine()
        
        # FIX: Added 'ib.id as batch_id' so we can write them off from the UI
        query = f"""
        SELECT 
            ib.id as batch_id, 
            p.name as product_name,
            p.category,
            l.name as location,
            s.name as supplier,
            ib.batch_code,
            ib.expiry_date,
            (ib.expiry_date - CURRENT_DATE) as days_left,
            ib.quantity
        FROM inventory_batches ib
        JOIN products p ON ib.product_id = p.id
        LEFT JOIN locations l ON ib.location_id = l.id
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        WHERE ib.expiry_date IS NOT NULL 
        AND ib.expiry_date - CURRENT_DATE <= {days_threshold}
        AND ib.quantity > 0
        """

        if category:
            query += f" AND p.category ILIKE '%%{category}%%'"
        if location:
            query += f" AND l.name ILIKE '%%{location}%%'"
        if supplier:
            query += f" AND s.name ILIKE '%%{supplier}%%'"

        query += " ORDER BY days_left ASC, l.name, p.name"

        df = pd.read_sql_query(query, engine)
        
        title = f"Near Expiry (Next {days_threshold} Days)"
        if location:
            title += f" - {location}"
        if format == 'json':
            df_preview = _format_dataframe_for_export(df, for_csv=False)
            return df_preview.to_dict(orient="records")
        if format == 'csv': 
            return _export_csv(df, "near_expiry")
        else: 
            return _export_pdf(df, title, "near_expiry", orientation='landscape', filter_context=filter_summary)
            
    except Exception as e:
        print(f"REPORT ERROR (Expiry): {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/overstock_dormant")
def overstock_dormant_report(
    current_user: Annotated[User, Depends(check_role("employee"))],
    format: Literal['csv', 'pdf', 'json'] = 'csv',
    days_inactive: int = Query(90),
    category: Optional[str] = None,
    location: Optional[str] = None,
    supplier: Optional[str] = None,
    filter_summary: Optional[str] = None
):
    try:
        engine = get_sqlalchemy_engine()
        
        # UPDATED: Using 'unit_cost' and 'selling_price'
        query = f"""
        SELECT 
            p.name as product,
            p.category,
            l.name as location,
            ib.quantity,
            MAX(ib.received_at)::date as last_received,
            (CURRENT_DATE - MAX(ib.received_at)::date) as days_dormant
        FROM inventory_batches ib
        JOIN products p ON ib.product_id = p.id
        JOIN locations l ON ib.location_id = l.id
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        WHERE ib.quantity > 0
        """
        if category: query += f" AND p.category ILIKE '%%{category}%%'"
        if location: query += f" AND l.name ILIKE '%%{location}%%'"
        if supplier: query += f" AND s.name ILIKE '%%{supplier}%%'"

        query += f"""
        GROUP BY p.id, p.name, p.category, l.name, ib.quantity
        HAVING (CURRENT_DATE - MAX(ib.received_at)::date) >= {days_inactive}
        ORDER BY days_dormant DESC
        """
        
        df = pd.read_sql_query(query, engine)
        
        title = f"Dormant Stock (> {days_inactive} Days)"
        if location: title += f" - {location}"
        if format == 'json': return _format_dataframe_for_export(df, for_csv=False).to_dict(orient="records")
        if format == 'csv': return _export_csv(df, "overstock_dormant")
        else: return _export_pdf(df, title, "overstock_dormant", orientation='landscape', filter_context=filter_summary)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# CATEGORY 3: MOVEMENT & FINANCIALS
# ==========================================

@router.get("/item_profitability")
def item_profitability_report(
    current_user: Annotated[User, Depends(check_role("manager"))],
    format: Literal['csv', 'pdf', 'json'] = 'csv',
    category: Optional[str] = None,
    supplier: Optional[str] = None,
    filter_summary: Optional[str] = None
):
    try:
        engine = get_sqlalchemy_engine()
        
        # UPDATED: Using 'unit_cost' and 'selling_price'
        query = """
        SELECT 
            p.name as product,
            p.category,
            s.name as supplier,
            AVG(ib.unit_cost)::numeric(10,2) as avg_cost,
            p.selling_price as selling_price,
            (p.selling_price - AVG(ib.unit_cost))::numeric(10,2) as margin,
            CASE 
                WHEN p.selling_price > 0 THEN 
                    ROUND(((p.selling_price - AVG(ib.unit_cost)) / p.selling_price * 100)::numeric, 1) 
                ELSE 0 
            END as margin_percent
        FROM products p
        JOIN inventory_batches ib ON p.id = ib.product_id
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        WHERE 1=1
        """

        if category:
            query += f" AND p.category ILIKE '%%{category}%%'"
        if supplier:
            query += f" AND s.name ILIKE '%%{supplier}%%'"

        query += """
        GROUP BY p.id, p.name, p.category, p.selling_price, s.name
        ORDER BY margin DESC
        """

        df = pd.read_sql_query(query, engine)
        
        title = "Item Profitability Report"
        if category:
            title += f" ({category})"
        if format == 'json':
            df_preview = _format_dataframe_for_export(df, for_csv=False)
            return df_preview.to_dict(orient="records")
        if format == 'csv': 
            return _export_csv(df, "item_profitability")
        else: 
            return _export_pdf(df, title, "item_profitability", orientation='landscape', filter_context=filter_summary)
            
    except Exception as e:
        print(f"REPORT ERROR (Profitability): {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
@router.get("/stock_movement")
def stock_movement_report(
    current_user: Annotated[User, Depends(check_role("employee"))],
    format: Literal['csv', 'pdf', 'json'] = 'csv',
    days_back: int = Query(90),
    category: Optional[str] = None,
    supplier: Optional[str] = None,
    filter_summary: Optional[str] = None
):
    try:
        engine = get_sqlalchemy_engine()
        
        query = f"""
        SELECT 
            p.name as product,
            p.category,
            s.name as supplier,
            p.sku,
            COALESCE(SUM(soi.quantity), 0) as sold_qty,
            CASE 
                WHEN COALESCE(SUM(soi.quantity), 0) > 50 THEN 'Fast'
                WHEN COALESCE(SUM(soi.quantity), 0) > 10 THEN 'Medium'
                ELSE 'Slow'
            END as movement
        FROM products p
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        LEFT JOIN sales_order_items soi ON p.id = soi.product_id
        LEFT JOIN sales_orders so ON soi.order_id = so.id 
        AND so.order_timestamp >= CURRENT_DATE - {days_back}
        WHERE 1=1
        """

        if category:
            query += f" AND p.category ILIKE '%%{category}%%'"
        if supplier:
            query += f" AND s.name ILIKE '%%{supplier}%%'"

        query += """
        GROUP BY p.id, p.name, p.sku, p.category, s.name
        ORDER BY sold_qty DESC
        """

        df = pd.read_sql_query(query, engine)
        
        title = "Stock Movement Analysis"
        if category:
            title += f" ({category})"
        if format == 'json':
            df_preview = _format_dataframe_for_export(df, for_csv=False)
            return df_preview.to_dict(orient="records")
        if format == 'csv': 
            return _export_csv(df, "stock_movement")
        else: 
            return _export_pdf(df, title, "stock_movement", orientation='landscape', filter_context=filter_summary)
            
    except Exception as e:
        print(f"REPORT ERROR (Movement): {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
@router.get("/daily_transactions")
def daily_transactions_report(
    current_user: Annotated[User, Depends(check_role("manager"))],
    format: Literal['csv', 'pdf', 'json'] = 'csv',
    days_back: int = Query(30),
    sku: Optional[str] = None,
    username: Optional[str] = None,
    filter_summary: Optional[str] = None
):
    try:
        engine = get_sqlalchemy_engine()
        
        # UPDATED: Uses UNION to combine audit_logs with operations_log for write-offs
        query = f"""
        -- Regular stock operations from audit_logs
        SELECT 
            al.timestamp::date as date,
            al.timestamp::time(0) as time,
            al.username as performed_by,
            CASE 
                WHEN al.action = 'RECEIVE_STOCK' THEN 'Stock Received'
                WHEN al.action = 'STOCK_TRANSFER' THEN 'Internal Transfer'
                WHEN al.action = 'BULK_RECEIVE' THEN 'Bulk Inward'
                WHEN al.action = 'BULK_TRANSFER' THEN 'Bulk Transfer'
                ELSE al.action 
            END as activity_type,
            CASE 
                WHEN al.action = 'RECEIVE_STOCK' THEN 
                    'Received ' || COALESCE(al.details->>'added_qty', '0') || ' units of ' || 
                    COALESCE(p_direct.name, p_batch.name, 'Unknown Product') || 
                    ' (Batch: ' || COALESCE(al.details->>'batch_code', 'N/A') || ')'
                    
                WHEN al.action = 'STOCK_TRANSFER' THEN 
                    'Moved ' || COALESCE(al.details->>'qty_moved', '0') || ' units of ' || 
                    COALESCE(p_direct.name, p_batch.name, 'Unknown Product')
                    
                WHEN al.action = 'BULK_RECEIVE' THEN 
                    'Received ' || COALESCE(al.details->>'qty', '0') || ' units of ' || 
                    COALESCE(p_direct.name, p_batch.name, 'Unknown Product')
                    
                WHEN al.action = 'BULK_TRANSFER' THEN 
                    'Transferred ' || COALESCE(al.details->>'qty', '0') || ' units of ' || 
                    COALESCE(p_direct.name, p_batch.name, 'Unknown Product')
                    
                ELSE 'Details: ' || LEFT(al.details::text, 50)
            END as transaction_details
        FROM audit_logs al
        LEFT JOIN products p_direct ON (
            al.details->>'product_id' ~ '^[0-9]+$' 
            AND (al.details->>'product_id')::int = p_direct.id
        )
        LEFT JOIN inventory_batches ib ON (
            al.details->>'batch_id' ~ '^[0-9]+$' AND (al.details->>'batch_id')::int = ib.id
        )
        LEFT JOIN products p_batch ON ib.product_id = p_batch.id
        WHERE al.timestamp >= CURRENT_DATE - {days_back}
        AND al.action IN ('RECEIVE_STOCK', 'STOCK_TRANSFER', 'BULK_RECEIVE', 'BULK_TRANSFER')
        
        UNION ALL
        
        -- Write-offs from operations_log
        SELECT 
            ol.created_at::date as date,
            ol.created_at::time(0) as time,
            ol.username as performed_by,
            'Write-off (Loss)' as activity_type,
            'Removed ' || COALESCE(ol.quantity::text, '0') || ' units of ' || 
                COALESCE(p.name, 'Unknown Product') || '. Reason: ' || COALESCE(ol.reason, 'N/A') 
                as transaction_details
        FROM operations_log ol
        LEFT JOIN inventory_batches ib ON ol.target_id = ib.id
        LEFT JOIN products p ON ib.product_id = p.id
        WHERE ol.operation_type = 'write_off'
        AND ol.created_at >= CURRENT_DATE - {days_back}
        """

        if username:
            query += f" AND ol.username ILIKE '%%{username}%%'"
            
        if sku:
            query += f" AND p.sku ILIKE '%%{sku}%%'"

        query += " ORDER BY date DESC, time DESC"

        df = pd.read_sql_query(query, engine)
        
        title = "Daily Stock Transaction Register"
        if username:
            title += f" (User: {username})"
        if sku:
            title += f" (SKU: {sku})"
            
        if format == 'json':
            df_preview = _format_dataframe_for_export(df, for_csv=False)
            return df_preview.to_dict(orient="records")
        if format == 'csv': 
            return _export_csv(df, "daily_transactions")
        else: 
            return _export_pdf(df, title, "daily_transactions", orientation='landscape', filter_context=filter_summary)
            
    except Exception as e:
        print(f"REPORT ERROR (Transactions): {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
@router.get("/supplier_performance")
def supplier_performance_report(
    current_user: Annotated[User, Depends(check_role("manager"))],
    format: Literal['csv', 'pdf', 'json'] = 'csv',
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    category: Optional[str] = None,
    location: Optional[str] = None,
    filter_summary: Optional[str] = None
):
    try:
        engine = get_sqlalchemy_engine()
        
        # UPDATED: Using 'unit_cost' and 'selling_price'
        query = """
        SELECT 
            s.name as supplier,
            COUNT(ib.id) as batches_supplied,
            SUM(ib.quantity) as total_units,
            SUM(ib.quantity * (
                CASE 
                    WHEN COALESCE(ib.unit_cost, 0) > 0 THEN ib.unit_cost 
                    ELSE COALESCE(p.selling_price, 0) 
                END
            )) as total_value
        FROM suppliers s
        JOIN products p ON s.id = p.supplier_id
        JOIN inventory_batches ib ON p.id = ib.product_id
        LEFT JOIN locations l ON ib.location_id = l.id
        WHERE 1=1
        """

        if start_date:
            query += f" AND ib.received_at >= '{start_date}'"
        if end_date:
            query += f" AND ib.received_at <= '{end_date}'"
            
        if category:
            query += f" AND p.category ILIKE '%%{category}%%'"
        if location:
            query += f" AND l.name ILIKE '%%{location}%%'"

        query += """
        GROUP BY s.id, s.name
        ORDER BY total_value DESC
        """

        df = pd.read_sql_query(query, engine)
        
        if not df.empty:
             df['total_value'] = df['total_value'].round(2)
             
        title = "Supplier Performance"
        if location:
            title += f" ({location})"
        
        if format == 'json':
            df_preview = _format_dataframe_for_export(df, for_csv=False)
            return df_preview.to_dict(orient="records")   
        if format == 'csv': 
            return _export_csv(df, "supplier_performance")
        else: 
            return _export_pdf(df, title, "supplier_performance", orientation='landscape', filter_context=filter_summary)
            
    except Exception as e:
        print(f"REPORT ERROR (Supplier): {e}")
        raise HTTPException(status_code=500, detail=str(e))
