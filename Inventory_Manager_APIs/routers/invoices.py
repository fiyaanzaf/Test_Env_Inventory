"""
Invoice Management Router
- Invoice settings management
- A4 GST invoice PDF generation matching professional Indian invoice design
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Annotated, List, Optional, Dict
import os
from dotenv import load_dotenv
from datetime import datetime, timedelta
import io
import base64

# ReportLab imports for PDF generation
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader

from security import get_current_user, check_role, User, get_db_connection, create_audit_log

router = APIRouter(
    prefix="/api/v1/invoices",
    tags=["Invoices"]
)

load_dotenv()

# ============================================================================
# MODELS
# ============================================================================

class InvoiceSettingsUpdate(BaseModel):
    settings: Dict[str, str]

class InvoiceSettingsRequest(BaseModel):
    settings: Dict[str, str]

class InvoiceSettingsResponse(BaseModel):
    settings: Dict[str, str]

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def hex_to_rgb(hex_str: str) -> tuple:
    """Convert hex color to RGB tuple (0-255 range)."""
    hex_str = hex_str.lstrip('#')
    return tuple(int(hex_str[i:i+2], 16) for i in (0, 2, 4))

def hex_to_color(hex_str: str):
    """Convert hex color to reportlab Color object."""
    r, g, b = hex_to_rgb(hex_str)
    return colors.Color(r/255, g/255, b/255)

def get_invoice_settings(cur) -> Dict[str, str]:
    """Get all invoice-related settings as dictionary."""
    cur.execute("""
        SELECT key, value FROM business_settings 
        WHERE key LIKE 'invoice_%' OR key LIKE 'business_%' OR key LIKE 'upi_%';
    """)
    rows = cur.fetchall()
    return {row[0]: row[1] or '' for row in rows} if rows else {}

def number_to_words(num: float) -> str:
    """Convert number to Indian currency words."""
    ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
            'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
            'Seventeen', 'Eighteen', 'Nineteen']
    tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
    
    def convert_chunk(n):
        if n < 20:
            return ones[n]
        elif n < 100:
            return tens[n // 10] + ((' ' + ones[n % 10]) if n % 10 else '')
        else:
            return ones[n // 100] + ' Hundred' + ((' and ' + convert_chunk(n % 100)) if n % 100 else '')
    
    if num == 0:
        return 'Zero Rupees Only'
    
    rupees = int(num)
    paise = int(round((num - rupees) * 100))
    
    result = []
    
    if rupees >= 10000000:  # Crore
        result.append(convert_chunk(rupees // 10000000) + ' Crore')
        rupees %= 10000000
    
    if rupees >= 100000:  # Lakh
        result.append(convert_chunk(rupees // 100000) + ' Lakh')
        rupees %= 100000
    
    if rupees >= 1000:  # Thousand
        result.append(convert_chunk(rupees // 1000) + ' Thousand')
        rupees %= 1000
    
    if rupees > 0:
        result.append(convert_chunk(rupees))
    
    text = ' '.join(result) + ' Rupees'
    
    if paise:
        text += ' and ' + convert_chunk(paise) + ' Paise'
    
    return text + ' Only'

def create_invoice_pdf(buffer, order, items, settings):
    """Generate A4 GST invoice PDF into the provided buffer."""
    
    # A4 dimensions: 210 x 297 mm
    page_width, page_height = A4
    margin = 15 * mm
    content_width = page_width - (2 * margin)
    
    # Create canvas
    c = canvas.Canvas(buffer, pagesize=A4)
    
    # Register fonts
    try:
        font_paths = [
            ('C:/Windows/Fonts/arial.ttf', 'C:/Windows/Fonts/arialbd.ttf'),
            ('C:/Windows/Fonts/segoeui.ttf', 'C:/Windows/Fonts/segoeuib.ttf'),
        ]
        for regular_path, bold_path in font_paths:
            if os.path.exists(regular_path) and os.path.exists(bold_path):
                pdfmetrics.registerFont(TTFont('InvoiceFont', regular_path))
                pdfmetrics.registerFont(TTFont('InvoiceFont-Bold', bold_path))
                break
    except:
        pass
    
    # Colors from settings or defaults
    primary_color = settings.get('invoice_primary_color', '#1a56db')
    accent_color = settings.get('invoice_accent_color', '#f97316')
    
    primary_rgb = hex_to_rgb(primary_color)
    accent_rgb = hex_to_rgb(accent_color)
    
    # ========================================
    # HEADER - Blue gradient with logo and INVOICE text
    # ========================================
    header_height = 60
    header_y = page_height - margin - header_height
    
    # Draw blue header background with gradient effect
    c.setFillColorRGB(primary_rgb[0]/255, primary_rgb[1]/255, primary_rgb[2]/255)
    c.roundRect(margin, header_y, content_width, header_height, 8, fill=1, stroke=0)
    
    # Add diagonal accent stripe
    c.setFillColorRGB(min(1, primary_rgb[0]/255 + 0.15), min(1, primary_rgb[1]/255 + 0.15), min(1, primary_rgb[2]/255 + 0.15))
    c.saveState()
    path = c.beginPath()
    path.moveTo(margin, header_y)
    path.lineTo(margin + 120, header_y)
    path.lineTo(margin + 80, header_y + header_height)
    path.lineTo(margin, header_y + header_height)
    path.close()
    c.clipPath(path, stroke=0)
    c.roundRect(margin, header_y, content_width, header_height, 8, fill=1, stroke=0)
    c.restoreState()
    
    # Logo placeholder or actual logo
    logo_data = settings.get('invoice_logo', '')
    logo_rendered = False
    company_name = settings.get('invoice_company_name', settings.get('business_name', 'Your Company'))
    company_address = settings.get('invoice_address', '')
    company_gstin = settings.get('invoice_gstin', '')
    
    if logo_data and logo_data.startswith('data:image'):
        try:
            header_b64 = logo_data.split(',', 1)[1]
            logo_bytes = base64.b64decode(header_b64)
            logo_buffer = io.BytesIO(logo_bytes)
            logo_image = ImageReader(logo_buffer)
            c.drawImage(logo_image, margin + 15, header_y + 10, width=80, height=40, preserveAspectRatio=True, mask='auto')
            logo_rendered = True
        except Exception as e:
            print(f"Logo render error: {e}")
    
    if not logo_rendered:
        # Logo placeholder text - show company name in header
        c.setFillColorRGB(1, 1, 1)
        c.setFont('Helvetica-Bold', 14)
        c.drawString(margin + 15, header_y + 30, company_name[:25])
    
    # INVOICE text on right
    c.setFillColorRGB(1, 1, 1)
    c.setFont('Helvetica-Bold', 28)
    c.drawRightString(page_width - margin - 15, header_y + 22, "INVOICE")
    
    # ========================================
    # COMPANY INFO (below header, left aligned)
    # ========================================
    company_info_y = header_y - 15
    c.setFillColorRGB(0.2, 0.2, 0.2)
    
    # Company name (always show if logo was rendered, as logo replaces name in header)
    if logo_rendered:
        c.setFont('Helvetica-Bold', 12)
        c.drawString(margin, company_info_y, company_name)
        company_info_y -= 14
    
    # Address
    if company_address:
        c.setFont('Helvetica', 9)
        c.setFillColorRGB(0.4, 0.4, 0.4)
        # Handle multi-line address (split by comma or newline)
        address_lines = company_address.replace('\\n', ', ').split(', ')
        for line in address_lines[:2]:  # Max 2 lines
            if line.strip():
                c.drawString(margin, company_info_y, line.strip()[:50])
                company_info_y -= 12
    
    # GSTIN
    if company_gstin:
        c.setFont('Helvetica', 9)
        c.setFillColorRGB(0.3, 0.3, 0.3)
        c.drawString(margin, company_info_y, f"GSTIN: {company_gstin}")
        company_info_y -= 12
    
    # ========================================
    # INVOICE METADATA BOX (right aligned below header)
    # ========================================
    meta_y = header_y - 85
    meta_width = 180
    meta_x = page_width - margin - meta_width
    
    # Invoice number with configurable prefix
    invoice_prefix = settings.get('invoice_prefix', 'INV-')
    invoice_number = f"{invoice_prefix}{datetime.now().year}-{order[0]:06d}"
    invoice_date = order[1].strftime("%d/%m/%Y") if order[1] else datetime.now().strftime("%d/%m/%Y")
    due_date = (order[1] + timedelta(days=7)).strftime("%d/%m/%Y") if order[1] else (datetime.now() + timedelta(days=7)).strftime("%d/%m/%Y")
    
    # Check if due date should be shown
    show_due_date = settings.get('invoice_show_due_date', 'true').lower() == 'true'
    place_of_supply = settings.get('invoice_place_of_supply', '')
    
    # Calculate metadata box height based on content
    meta_lines = 2  # Invoice No + Date
    if show_due_date:
        meta_lines += 1
    if place_of_supply:
        meta_lines += 1
    meta_box_height = 15 + (meta_lines * 15)
    
    # Draw metadata box
    c.setStrokeColorRGB(0.85, 0.85, 0.85)
    c.setLineWidth(1)
    c.roundRect(meta_x, meta_y, meta_width, meta_box_height, 4, fill=0, stroke=1)
    
    # Metadata content
    line_y = meta_y + meta_box_height - 13
    c.setFillColorRGB(0.4, 0.4, 0.4)
    c.setFont('Helvetica', 9)
    c.drawString(meta_x + 8, line_y, "Invoice No:")
    c.setFillColorRGB(0.1, 0.1, 0.1)
    c.setFont('Helvetica-Bold', 9)
    c.drawRightString(meta_x + meta_width - 8, line_y, invoice_number)
    
    line_y -= 15
    c.setFillColorRGB(0.4, 0.4, 0.4)
    c.setFont('Helvetica', 9)
    c.drawString(meta_x + 8, line_y, "Date:")
    c.setFillColorRGB(0.1, 0.1, 0.1)
    c.setFont('Helvetica-Bold', 9)
    c.drawRightString(meta_x + meta_width - 8, line_y, invoice_date)
    
    if show_due_date:
        line_y -= 15
        c.setFillColorRGB(0.4, 0.4, 0.4)
        c.setFont('Helvetica', 9)
        c.drawString(meta_x + 8, line_y, "Due Date:")
        c.setFillColorRGB(0.1, 0.1, 0.1)
        c.setFont('Helvetica-Bold', 9)
        c.drawRightString(meta_x + meta_width - 8, line_y, due_date)
    
    if place_of_supply:
        line_y -= 15
        c.setFillColorRGB(0.4, 0.4, 0.4)
        c.setFont('Helvetica', 9)
        c.drawString(meta_x + 8, line_y, "Place of Supply:")
        c.setFillColorRGB(0.1, 0.1, 0.1)
        c.setFont('Helvetica-Bold', 9)
        c.drawRightString(meta_x + meta_width - 8, line_y, place_of_supply[:15])
    
    # ========================================
    # BILL TO / SHIP TO SECTION
    # ========================================
    section_y = meta_y - 20
    card_height = 75
    card_width = (content_width - 20) / 2
    
    # Bill To card
    bill_x = margin
    
    # Section header with rounded top
    c.setFillColorRGB(primary_rgb[0]/255, primary_rgb[1]/255, primary_rgb[2]/255)
    c.roundRect(bill_x, section_y - 20, card_width, 20, 4, fill=1, stroke=0)
    c.rect(bill_x, section_y - 20, card_width, 10, fill=1, stroke=0)  # Square bottom
    
    c.setFillColorRGB(1, 1, 1)
    c.setFont('Helvetica-Bold', 10)
    c.drawString(bill_x + 10, section_y - 15, "BILL TO")
    
    # Bill To content box
    c.setStrokeColorRGB(0.85, 0.85, 0.85)
    c.setFillColorRGB(1, 1, 1)
    c.rect(bill_x, section_y - 20 - card_height, card_width, card_height, fill=1, stroke=1)
    
    # Bill To content
    c.setFillColorRGB(0.1, 0.1, 0.1)
    c.setFont('Helvetica-Bold', 10)
    customer_name = order[2] or "Walk-in Customer"
    c.drawString(bill_x + 10, section_y - 40, customer_name[:30])
    
    c.setFont('Helvetica', 9)
    c.setFillColorRGB(0.3, 0.3, 0.3)
    if order[3]:  # Phone
        c.drawString(bill_x + 10, section_y - 55, f"Phone: {order[3]}")
    if order[4]:  # Email
        c.drawString(bill_x + 10, section_y - 70, order[4][:35])
    
    # Ship To card (only show if enabled in settings)
    show_ship_to = settings.get('invoice_show_ship_to', 'true').lower() == 'true'
    ship_x = margin + card_width + 20
    
    if show_ship_to:
        # Section header
        c.setFillColorRGB(primary_rgb[0]/255, primary_rgb[1]/255, primary_rgb[2]/255)
        c.roundRect(ship_x, section_y - 20, card_width, 20, 4, fill=1, stroke=0)
        c.rect(ship_x, section_y - 20, card_width, 10, fill=1, stroke=0)
        
        c.setFillColorRGB(1, 1, 1)
        c.setFont('Helvetica-Bold', 10)
        c.drawString(ship_x + 10, section_y - 15, "SHIP TO")
        
        # Ship To content box
        c.setStrokeColorRGB(0.85, 0.85, 0.85)
        c.setFillColorRGB(1, 1, 1)
        c.rect(ship_x, section_y - 20 - card_height, card_width, card_height, fill=1, stroke=1)
        
        # Ship To content (same as Bill To for now)
        c.setFillColorRGB(0.1, 0.1, 0.1)
        c.setFont('Helvetica-Bold', 10)
        c.drawString(ship_x + 10, section_y - 40, customer_name[:30])
        
        c.setFont('Helvetica', 9)
        c.setFillColorRGB(0.3, 0.3, 0.3)
        ship_address = settings.get('invoice_ship_to_address', '')
        if ship_address:
            c.drawString(ship_x + 10, section_y - 55, ship_address[:40])
    
    # ========================================
    # ITEMS TABLE (with multi-page support)
    # ========================================
    table_y = section_y - 20 - card_height - 25
    
    # Table configuration
    col_widths = [35, content_width - 35 - 50 - 70 - 80, 50, 70, 80]  # S.No, Description, Qty, Price, Amount
    table_header_height = 28
    row_height = 28
    
    # Page limits
    page_bottom_margin = 180  # Space needed for summary + footer
    continuation_top_margin = 50  # Top margin on continuation pages
    page_num = 1
    
    def draw_table_header(canvas_obj, y_pos):
        """Draw the table header at the given y position."""
        canvas_obj.setFillColorRGB(primary_rgb[0]/255, primary_rgb[1]/255, primary_rgb[2]/255)
        canvas_obj.roundRect(margin, y_pos - table_header_height, content_width, table_header_height, 4, fill=1, stroke=0)
        canvas_obj.rect(margin, y_pos - table_header_height, content_width, table_header_height/2, fill=1, stroke=0)
        
        canvas_obj.setFillColorRGB(1, 1, 1)
        canvas_obj.setFont('Helvetica-Bold', 9)
        
        x_pos = margin + 10
        canvas_obj.drawString(x_pos, y_pos - 18, "S.No")
        x_pos += col_widths[0]
        canvas_obj.drawString(x_pos, y_pos - 18, "Item Description")
        x_pos += col_widths[1]
        canvas_obj.drawCentredString(x_pos + col_widths[2]/2, y_pos - 18, "Qty")
        x_pos += col_widths[2]
        canvas_obj.drawRightString(x_pos + col_widths[3] - 5, y_pos - 18, "Price")
        x_pos += col_widths[3]
        canvas_obj.drawRightString(x_pos + col_widths[4] - 10, y_pos - 18, "Amount")
        
        return y_pos - table_header_height
    
    def draw_page_footer(canvas_obj, page_number, total_pages):
        """Draw page number at bottom."""
        canvas_obj.setFillColorRGB(0.5, 0.5, 0.5)
        canvas_obj.setFont('Helvetica', 8)
        canvas_obj.drawCentredString(page_width / 2, 20, f"Page {page_number} of {total_pages}")
    
    # Calculate total pages needed
    items_per_first_page = int((table_y - table_header_height - page_bottom_margin) / row_height)
    items_per_continuation = int((page_height - continuation_top_margin - page_bottom_margin) / row_height)
    
    total_items = len(items)
    if total_items <= items_per_first_page:
        total_pages = 1
    else:
        remaining = total_items - items_per_first_page
        total_pages = 1 + ((remaining + items_per_continuation - 1) // items_per_continuation)
    
    # Draw first page table header
    row_y = draw_table_header(c, table_y)
    
    # Table rows
    subtotal = 0
    current_item_idx = 0
    
    for idx, item in enumerate(items):
        # Check if we need a new page
        if row_y - row_height < page_bottom_margin and idx < len(items):
            # Draw page footer before creating new page
            draw_page_footer(c, page_num, total_pages)
            
            # Create new page
            c.showPage()
            page_num += 1
            
            # Reset position for new page
            row_y = page_height - continuation_top_margin
            
            # Draw continuation header
            c.setFillColorRGB(primary_rgb[0]/255, primary_rgb[1]/255, primary_rgb[2]/255)
            c.setFont('Helvetica-Bold', 12)
            c.drawString(margin, row_y, f"Invoice {invoice_number} (Continued)")
            row_y -= 25
            
            # Draw table header on new page
            row_y = draw_table_header(c, row_y)
        
        # Alternating row colors
        if idx % 2 == 0:
            c.setFillColorRGB(1, 1, 1)
        else:
            c.setFillColorRGB(0.98, 0.98, 0.98)
        
        c.rect(margin, row_y - row_height, content_width, row_height, fill=1, stroke=0)
        
        # Row border
        c.setStrokeColorRGB(0.9, 0.9, 0.9)
        c.line(margin, row_y - row_height, margin + content_width, row_y - row_height)
        
        # Row content
        c.setFillColorRGB(0.1, 0.1, 0.1)
        c.setFont('Helvetica-Bold', 10)
        
        x_pos = margin + 15
        c.drawString(x_pos, row_y - 18, f"{idx + 1}.")
        
        x_pos = margin + col_widths[0] + 5
        c.setFont('Helvetica', 9)
        c.drawString(x_pos, row_y - 18, item[0][:40])  # Item name
        
        x_pos = margin + col_widths[0] + col_widths[1]
        c.drawCentredString(x_pos + col_widths[2]/2, row_y - 18, str(item[1]))  # Qty
        
        x_pos += col_widths[2]
        c.drawRightString(x_pos + col_widths[3] - 5, row_y - 18, f"{float(item[2]):,.2f}")  # Price
        
        x_pos += col_widths[3]
        c.setFont('Helvetica-Bold', 9)
        c.drawRightString(x_pos + col_widths[4] - 10, row_y - 18, f"{float(item[3]):,.2f}")  # Amount
        
        subtotal += float(item[3])
        row_y -= row_height
    
    # Bottom border of table
    c.setStrokeColorRGB(0.85, 0.85, 0.85)
    c.line(margin, row_y, margin + content_width, row_y)
    
    # ========================================
    # SUMMARY SECTION (Subtotal, Discount, CGST, SGST, Total)
    # India-specific GST breakdown
    # ========================================
    summary_y = row_y - 25
    
    # Get configurable rates from settings
    cgst_rate = float(settings.get('invoice_cgst_rate', '9'))
    sgst_rate = float(settings.get('invoice_sgst_rate', '9'))
    discount_enabled = settings.get('invoice_discount_enabled', 'false').lower() == 'true'
    discount_percent = float(settings.get('invoice_discount_percent', '0')) if discount_enabled else 0
    
    # Calculate totals
    discount_amount = round(subtotal * (discount_percent / 100), 2)
    after_discount = round(subtotal - discount_amount, 2)
    cgst_amount = round(after_discount * (cgst_rate / 100), 2)
    sgst_amount = round(after_discount * (sgst_rate / 100), 2)
    total_amount = round(after_discount + cgst_amount + sgst_amount, 2)
    
    # Left side - breakdown
    c.setFillColorRGB(0.3, 0.3, 0.3)
    c.setFont('Helvetica', 10)
    
    line_y = summary_y
    c.drawString(margin + 10, line_y, "Subtotal:")
    c.setFont('InvoiceFont-Bold', 10)
    c.drawString(margin + 130, line_y, f"₹ {subtotal:,.2f}")
    
    line_y -= 16
    if discount_enabled and discount_percent > 0:
        c.setFont('Helvetica', 10)
        c.drawString(margin + 10, line_y, f"Discount ({discount_percent:.0f}%):")
        c.setFont('InvoiceFont-Bold', 10)
        c.setFillColorRGB(0.8, 0.2, 0.2)  # Red for discount
        c.drawString(margin + 130, line_y, f"-₹ {discount_amount:,.2f}")
        c.setFillColorRGB(0.3, 0.3, 0.3)
        line_y -= 16
    
    c.setFont('Helvetica', 10)
    c.drawString(margin + 10, line_y, f"CGST ({cgst_rate:.0f}%):")
    c.setFont('InvoiceFont-Bold', 10)
    c.drawString(margin + 130, line_y, f"₹ {cgst_amount:,.2f}")
    
    line_y -= 16
    c.setFont('Helvetica', 10)
    c.drawString(margin + 10, line_y, f"SGST ({sgst_rate:.0f}%):")
    c.setFont('InvoiceFont-Bold', 10)
    c.drawString(margin + 130, line_y, f"₹ {sgst_amount:,.2f}")
    
    # Right side - Total amount box with fixed styling (white bg, black border, black text)
    total_box_width = 200
    total_box_height = 40
    total_box_x = page_width - margin - total_box_width
    total_box_y = summary_y - 30
    
    # White background with black border
    c.setFillColorRGB(1, 1, 1)  # White fill
    c.setStrokeColorRGB(0, 0, 0)  # Black border
    c.setLineWidth(1.5)
    c.roundRect(total_box_x, total_box_y, total_box_width, total_box_height, 6, fill=1, stroke=1)
    
    # Black text
    c.setFillColorRGB(0, 0, 0)
    c.setFont('Helvetica-Bold', 11)
    c.drawString(total_box_x + 15, total_box_y + 15, "Grand Total:")
    c.setFont('InvoiceFont-Bold', 16)
    c.drawRightString(total_box_x + total_box_width - 15, total_box_y + 12, f"₹ {total_amount:,.2f}")
    
    # Amount in words below the total box
    amount_words = number_to_words(total_amount)
    c.setFillColorRGB(0.3, 0.3, 0.3)
    c.setFont('Helvetica-Oblique', 8)
    c.drawRightString(total_box_x + total_box_width, total_box_y - 18, f"({amount_words})")
    
    # ========================================
    # BOTTOM SECTION - Payment Info & Notes (side by side)
    # ========================================
    bottom_section_y = summary_y - 100  # Slightly lower to accommodate amount in words
    half_width = (content_width - 20) / 2
    
    # --- Payment Info (left side) ---
    # Blue header bar
    c.setFillColorRGB(primary_rgb[0]/255, primary_rgb[1]/255, primary_rgb[2]/255)
    c.roundRect(margin, bottom_section_y, half_width, 22, 4, fill=1, stroke=0)
    c.rect(margin, bottom_section_y - 8, half_width, 12, fill=1, stroke=0)  # Square bottom
    
    # Title text - centered vertically in blue bar
    c.setFillColorRGB(1, 1, 1)
    c.setFont('Helvetica-Bold', 10)
    c.drawString(margin + 12, bottom_section_y + 6, "Payment Info")
    
    # Payment details content box
    payment_box_height = 60
    c.setStrokeColorRGB(0.85, 0.85, 0.85)
    c.setFillColorRGB(1, 1, 1)
    c.rect(margin, bottom_section_y - payment_box_height, half_width, payment_box_height, fill=1, stroke=1)
    
    # Payment details content
    c.setFillColorRGB(0.2, 0.2, 0.2)
    c.setFont('Helvetica', 9)
    bank_name = settings.get('invoice_bank_name', 'Bank Name')
    account_no = settings.get('invoice_account_no', 'Account Number')
    ifsc = settings.get('invoice_ifsc', 'IFSC Code')
    
    c.drawString(margin + 10, bottom_section_y - 18, f"Bank: {bank_name}")
    c.drawString(margin + 10, bottom_section_y - 33, f"A/C No: {account_no}")
    c.drawString(margin + 10, bottom_section_y - 48, f"IFSC: {ifsc}")
    
    # --- Notes (right side) ---
    notes_x = margin + half_width + 20
    
    # Blue header bar
    c.setFillColorRGB(primary_rgb[0]/255, primary_rgb[1]/255, primary_rgb[2]/255)
    c.roundRect(notes_x, bottom_section_y, half_width, 22, 4, fill=1, stroke=0)
    c.rect(notes_x, bottom_section_y - 8, half_width, 12, fill=1, stroke=0)  # Square bottom
    
    # Title text - centered vertically in blue bar
    c.setFillColorRGB(1, 1, 1)
    c.setFont('Helvetica-Bold', 10)
    c.drawString(notes_x + 12, bottom_section_y + 6, "Notes")
    
    # Notes content box
    c.setStrokeColorRGB(0.85, 0.85, 0.85)
    c.setFillColorRGB(1, 1, 1)
    c.rect(notes_x, bottom_section_y - payment_box_height, half_width, payment_box_height, fill=1, stroke=1)
    
    # Notes content
    c.setFillColorRGB(0.2, 0.2, 0.2)
    c.setFont('Helvetica', 9)
    notes_text = settings.get('invoice_notes', 'Thank you for your business!')
    terms_text = settings.get('invoice_terms', 'Payment due within 7 days.')
    c.drawString(notes_x + 10, bottom_section_y - 18, f"• {notes_text[:45]}")
    c.drawString(notes_x + 10, bottom_section_y - 33, f"• {terms_text[:45]}")
    
    # ========================================
    # AUTHORIZED SIGNATURE SECTION (below notes, right-aligned)
    # ========================================
    # Position signature section well below the notes box (payment_box_height = 60)
    sig_section_y = bottom_section_y - payment_box_height - 55  # Increased spacing below notes
    sig_width = 140
    sig_x = page_width - margin - sig_width
    
    # Signature image or placeholder line
    sig_image = settings.get('invoice_signature', '')
    sig_rendered = False
    
    if sig_image and sig_image.startswith('data:image'):
        try:
            sig_b64 = sig_image.split(',', 1)[1]
            sig_bytes = base64.b64decode(sig_b64)
            sig_buffer = io.BytesIO(sig_bytes)
            sig_img = ImageReader(sig_buffer)
            # Draw signature with preserved aspect ratio, max 100x40
            c.drawImage(sig_img, sig_x + 20, sig_section_y + 10, width=100, height=40, 
                       preserveAspectRatio=True, mask='auto')
            sig_rendered = True
        except Exception as e:
            print(f"Signature render error: {e}")
    
    if not sig_rendered:
        # Placeholder signature line
        c.setStrokeColorRGB(0.5, 0.5, 0.5)
        c.setLineWidth(0.5)
        c.line(sig_x + 10, sig_section_y + 25, sig_x + sig_width - 10, sig_section_y + 25)
    
    # Signatory name and label
    c.setFillColorRGB(0.3, 0.3, 0.3)
    c.setFont('Helvetica-Bold', 9)
    signatory_name = settings.get('invoice_signatory_name', 'Authorized Signatory')
    c.drawCentredString(sig_x + sig_width/2, sig_section_y + 5, signatory_name)
    
    c.setFont('Helvetica-Oblique', 8)
    c.setFillColorRGB(0.5, 0.5, 0.5)
    c.drawCentredString(sig_x + sig_width/2, sig_section_y - 8, "Authorized Signature")
    
    # ========================================
    # FOOTER BAR
    # ========================================
    footer_height = 25
    footer_y = margin + 10
    
    c.setFillColorRGB(primary_rgb[0]/255, primary_rgb[1]/255, primary_rgb[2]/255)
    c.roundRect(margin, footer_y, content_width, footer_height, 4, fill=1, stroke=0)
    
    c.setFillColorRGB(1, 1, 1)
    c.setFont('Helvetica', 8)
    
    phone = settings.get('invoice_phone', settings.get('business_phone', ''))
    email = settings.get('invoice_email', settings.get('business_email', ''))
    website = settings.get('invoice_website', '')
    
    # Draw contact info centered with text labels (emojis may not render in PDF fonts)
    contact_parts = []
    if phone:
        contact_parts.append(f"Phone: {phone}")
    if email:
        contact_parts.append(f"Email: {email}")
    if website:
        contact_parts.append(f"Web: {website}")
    
    if contact_parts:
        contact_text = "   |   ".join(contact_parts)
        c.drawCentredString(page_width/2, footer_y + 8, contact_text)
    
    # Page number (only show if multi-page)
    if total_pages > 1:
        c.setFillColorRGB(0.5, 0.5, 0.5)
        c.setFont('Helvetica', 8)
        c.drawCentredString(page_width / 2, 12, f"Page {page_num} of {total_pages}")
    
    # Save PDF
    c.save()

# ============================================================================
# ENDPOINTS
# ============================================================================

@router.get("/settings", response_model=InvoiceSettingsResponse)
def get_settings(
    current_user: Annotated[User, Depends(check_role("manager"))]
):
    """Get all invoice settings."""
    conn = None
    try:
        conn = get_db_connection()
        if conn is None:
            raise HTTPException(status_code=500, detail="Database connection failed")
        
        cur = conn.cursor()
        settings = get_invoice_settings(cur)
        cur.close()
        
        return InvoiceSettingsResponse(settings=settings)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


@router.put("/settings")
def update_settings(
    data: InvoiceSettingsUpdate,
    request: Request,
    current_user: Annotated[User, Depends(check_role("manager"))]
):
    """Update invoice settings (upsert multiple keys)."""
    conn = None
    try:
        conn = get_db_connection()
        if conn is None:
            raise HTTPException(status_code=500, detail="Database connection failed")
        
        cur = conn.cursor()
        
        for key, value in data.settings.items():
            # Determine category based on key prefix
            if key.startswith('invoice_'):
                category = 'invoice'
            elif key.startswith('business_'):
                category = 'business'
            elif key.startswith('upi_'):
                category = 'payment'
            else:
                category = 'general'
            
            cur.execute("""
                INSERT INTO business_settings (key, value, category, updated_at, updated_by)
                VALUES (%s, %s, %s, CURRENT_TIMESTAMP, %s)
                ON CONFLICT (key) DO UPDATE SET 
                    value = EXCLUDED.value,
                    updated_at = CURRENT_TIMESTAMP,
                    updated_by = EXCLUDED.updated_by;
            """, (key, value, category, current_user.id))
        
        conn.commit()
        cur.close()
        
        create_audit_log(
            user=current_user,
            action="UPDATE_INVOICE_SETTINGS",
            request=request,
            target_table="business_settings",
            details={"keys_updated": list(data.settings.keys())}
        )
        
        return {"message": "Settings updated successfully", "updated_keys": list(data.settings.keys())}
        
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

@router.post("/preview")
def preview_invoice_settings(
    data: InvoiceSettingsRequest,
    current_user: Annotated[User, Depends(check_role("manager"))]
):
    """Generate a preview of the invoice with provided settings."""
    try:
        # Create dummy data for preview
        dummy_order = (
            99999,  # id
            datetime.now(),  # timestamp
            "Preview Customer",  # name
            "555-0123",  # phone
            "preview@example.com",  # email
            15250.00,  # total
            "UPI",  # payment_method
            "UPI-123456789"  # payment_ref
        )
        
        dummy_items = [
            ("Premium Widget A", 10, 500.00, 5000.00, "WID-001"),
            ("Service Charge", 1, 250.00, 250.00, "SVC-001"),
            ("Deluxe Gadget", 2, 5000.00, 10000.00, "GAD-999")
        ]
        
        buffer = io.BytesIO()
        create_invoice_pdf(buffer, dummy_order, dummy_items, data.settings)
        buffer.seek(0)
        
        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"inline; filename=Invoice-Preview.pdf"
            }
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Preview generation failed: {str(e)}")

@router.get("/generate/{order_id}")
def generate_invoice_pdf(
    order_id: int,
    current_user: Annotated[User, Depends(check_role("employee"))]
):
    """Generate A4 GST invoice PDF for a sales order."""
    conn = None
    try:
        conn = get_db_connection()
        if conn is None:
            raise HTTPException(status_code=500, detail="Database connection failed")
        
        cur = conn.cursor()
        
        # Get order details
        cur.execute("""
            SELECT 
                so.id, so.order_timestamp, so.customer_name, so.customer_phone, 
                so.customer_email, so.total_amount, so.payment_method, so.payment_reference
            FROM sales_orders so
            WHERE so.id = %s;
        """, (order_id,))
        order = cur.fetchone()
        
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        
        # Get order items
        cur.execute("""
            SELECT 
                p.name, soi.quantity, soi.unit_price, 
                (soi.quantity * soi.unit_price) as amount,
                p.sku
            FROM sales_order_items soi
            JOIN products p ON soi.product_id = p.id
            WHERE soi.order_id = %s
            ORDER BY soi.id;
        """, (order_id,))
        items = cur.fetchall()
        
        # Get invoice settings
        settings = get_invoice_settings(cur)
        cur.close()
        
        # Generate PDF
        buffer = io.BytesIO()
        create_invoice_pdf(buffer, order, items, settings)
        buffer.seek(0)
        
        # Generate filename
        invoice_prefix = settings.get('invoice_prefix', 'INV-')
        invoice_number = f"{invoice_prefix}{datetime.now().year}-{order[0]:06d}"
        
        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"inline; filename=Invoice-{invoice_number}.pdf"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(e)}")
    finally:
        if conn:
            conn.close()
