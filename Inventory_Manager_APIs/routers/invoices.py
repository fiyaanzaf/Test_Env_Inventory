"""
Invoice Router
Handles professional invoice generation with UPI QR codes.
Supports multiple templates: Classic Red, Professional Blue, Minimal Clean
"""

from fastapi import APIRouter, HTTPException, Depends, Query, Request, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr
from typing import Annotated, List, Optional, Dict, Any
from datetime import datetime, date, timedelta
import os
from dotenv import load_dotenv
import io
import base64
import uuid

from security import get_current_user, User, get_db_connection, check_role, create_audit_log

# Optional imports for PDF and QR
try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, A5
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
    HAS_REPORTLAB = True
except ImportError:
    HAS_REPORTLAB = False

try:
    import qrcode
    HAS_QRCODE = True
except ImportError:
    HAS_QRCODE = False

router = APIRouter(
    prefix="/api/v1/invoices",
    tags=["Invoices"]
)

load_dotenv()

# ============================================================================
# PYDANTIC MODELS
# ============================================================================

class InvoiceItemCreate(BaseModel):
    product_id: Optional[int] = None
    product_name: str
    product_sku: Optional[str] = None
    hsn_code: Optional[str] = None
    quantity: float
    unit_price: float
    discount_percent: float = 0
    tax_percent: float = 0


class InvoiceCreate(BaseModel):
    invoice_type: str = "RETAIL"  # 'RETAIL', 'B2B', 'KHATA'
    khata_customer_id: Optional[int] = None
    b2b_client_id: Optional[int] = None
    sales_order_id: Optional[int] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_email: Optional[str] = None
    customer_address: Optional[str] = None
    customer_gstin: Optional[str] = None
    items: List[InvoiceItemCreate]
    additional_discount: float = 0
    additional_charges: float = 0
    notes: Optional[str] = None
    due_date: Optional[date] = None


class InvoiceItemOut(BaseModel):
    id: int
    product_name: str
    product_sku: Optional[str]
    hsn_code: Optional[str]
    quantity: float
    unit_price: float
    discount_percent: float
    discount_amount: float
    tax_percent: float
    tax_amount: float
    line_total: float


class InvoiceOut(BaseModel):
    id: int
    invoice_number: str
    invoice_type: str
    invoice_date: date
    due_date: Optional[date]
    khata_customer_id: Optional[int]
    customer_name: Optional[str]
    customer_phone: Optional[str]
    customer_email: Optional[str]
    customer_gstin: Optional[str]
    subtotal: float
    total_discount: float
    total_tax: float
    grand_total: float
    amount_paid: float
    balance_due: float
    payment_status: str
    upi_payment_link: Optional[str]
    items: List[InvoiceItemOut]
    created_at: datetime


class BusinessSettingsOut(BaseModel):
    business_name: Optional[str]
    business_address: Optional[str]
    business_phone: Optional[str]
    business_email: Optional[str]
    gstin: Optional[str]
    upi_id: Optional[str]
    upi_payee_name: Optional[str]
    invoice_prefix: str
    invoice_footer: Optional[str]
    invoice_terms: Optional[str]


class BusinessSettingsUpdate(BaseModel):
    business_name: Optional[str] = None
    business_address: Optional[str] = None
    business_phone: Optional[str] = None
    business_email: Optional[str] = None
    gstin: Optional[str] = None
    upi_id: Optional[str] = None
    upi_payee_name: Optional[str] = None
    invoice_prefix: Optional[str] = None
    invoice_footer: Optional[str] = None
    invoice_terms: Optional[str] = None
    # Enhanced settings for templates
    default_template: Optional[str] = None
    business_logo: Optional[str] = None
    business_state: Optional[str] = None
    business_state_code: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    bank_ifsc: Optional[str] = None
    bank_branch: Optional[str] = None
    show_logo: Optional[bool] = None
    show_bank_details: Optional[bool] = None
    show_upi_qr: Optional[bool] = None
    show_signature: Optional[bool] = None
    signature_image: Optional[str] = None
    signature_name: Optional[str] = None
    cgst_rate: Optional[float] = None
    sgst_rate: Optional[float] = None


class InvoiceTemplateOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    template_type: str
    primary_color: str
    secondary_color: str
    is_active: bool


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def get_business_settings(cur):
    """Fetch all business settings as a dict."""
    cur.execute("SELECT key, value FROM business_settings")
    rows = cur.fetchall()
    return {row[0]: row[1] for row in rows}


def generate_upi_link(upi_id: str, payee_name: str, amount: float, invoice_number: str) -> str:
    """Generate UPI payment link."""
    if not upi_id:
        return None
    # UPI deep link format
    return f"upi://pay?pa={upi_id}&pn={payee_name or 'Store'}&am={amount:.2f}&cu=INR&tn={invoice_number}"


def generate_upi_qr_bytes(upi_link: str) -> bytes:
    """Generate QR code image bytes for UPI link."""
    if not HAS_QRCODE or not upi_link:
        return None
    
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(upi_link)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    buffer.seek(0)
    return buffer.getvalue()


def number_to_words(num: float) -> str:
    """Convert number to words (Indian format)"""
    ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
            'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
            'Seventeen', 'Eighteen', 'Nineteen']
    tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
    
    def convert_less_than_thousand(n):
        if n < 20:
            return ones[n]
        elif n < 100:
            return tens[n // 10] + (' ' + ones[n % 10] if n % 10 else '')
        else:
            return ones[n // 100] + ' Hundred' + (' ' + convert_less_than_thousand(n % 100) if n % 100 else '')
    
    if num == 0:
        return 'Zero Rupees Only'
    
    num = round(num)
    result = []
    
    if num >= 10000000:
        result.append(convert_less_than_thousand(int(num // 10000000)) + ' Crore')
        num = num % 10000000
    
    if num >= 100000:
        result.append(convert_less_than_thousand(int(num // 100000)) + ' Lakh')
        num = num % 100000
    
    if num >= 1000:
        result.append(convert_less_than_thousand(int(num // 1000)) + ' Thousand')
        num = num % 1000
    
    if num > 0:
        result.append(convert_less_than_thousand(int(num)))
    
    return ' '.join(result) + ' Rupees Only'


def hex_to_color(hex_color: str):
    """Convert hex color to reportlab color"""
    hex_color = hex_color.lstrip('#')
    r = int(hex_color[0:2], 16) / 255.0
    g = int(hex_color[2:4], 16) / 255.0
    b = int(hex_color[4:6], 16) / 255.0
    return colors.Color(r, g, b)


# ============================================================================
# PDF TEMPLATE GENERATORS
# ============================================================================

def generate_classic_template(elements, inv_data, items, settings, styles, width):
    """Generate Classic Red Template (Vyapaar style)"""
    primary = hex_to_color('#dc2626')
    secondary = hex_to_color('#1f2937')
    light_gray = hex_to_color('#f3f4f6')
    
    # Header with business info
    business_name = settings.get('business_name', 'Business Name')
    header_left = f"<b><font size='16' color='#dc2626'>{business_name}</font></b>"
    if settings.get('business_address'):
        header_left += f"<br/><font size='9'>{settings['business_address']}</font>"
    if settings.get('gstin'):
        header_left += f"<br/><font size='9'>GSTIN: {settings['gstin']}</font>"
    
    header_right = ""
    if settings.get('business_phone'):
        header_right += f"<font size='9'>Tel: {settings['business_phone']}</font><br/>"
    if settings.get('business_email'):
        header_right += f"<font size='9'>{settings['business_email']}</font>"
    
    header_table = Table([
        [Paragraph(header_left, styles['Normal']), 
         Paragraph(header_right, ParagraphStyle('right', alignment=TA_RIGHT))]
    ], colWidths=[width*0.65, width*0.35])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
    ]))
    elements.append(header_table)
    
    # Tax Invoice title with underline
    elements.append(Paragraph("<b>Tax Invoice</b>", 
                              ParagraphStyle('title', fontSize=14, alignment=TA_CENTER, 
                                            textColor=secondary, spaceAfter=10)))
    elements.append(Spacer(1, 3*mm))
    
    # Bill To & Invoice Info
    bill_to = f"<b>Bill To:</b><br/><font size='11'><b>{inv_data['customer_name'] or 'Walk-in Customer'}</b></font>"
    if inv_data.get('customer_phone'):
        bill_to += f"<br/>{inv_data['customer_phone']}"
    if inv_data.get('customer_address'):
        bill_to += f"<br/>{inv_data['customer_address']}"
    if inv_data.get('customer_gstin'):
        bill_to += f"<br/>GSTIN: {inv_data['customer_gstin']}"
    
    invoice_info = f"<b>Invoice No.:</b> {inv_data['invoice_number']}<br/>"
    invoice_info += f"<b>Date:</b> {inv_data['invoice_date']}"
    if inv_data.get('due_date'):
        invoice_info += f"<br/><b>Due Date:</b> {inv_data['due_date']}"
    
    info_table = Table([
        [Paragraph(bill_to, styles['Normal']), 
         Paragraph(invoice_info, ParagraphStyle('right', alignment=TA_RIGHT))]
    ], colWidths=[width*0.6, width*0.4])
    info_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
    ]))
    elements.append(info_table)
    elements.append(Spacer(1, 3*mm))
    
    # Items Table
    items_header = ['#', 'Item Name', 'HSN', 'Qty', 'Price', 'Disc.', 'Tax', 'Amount']
    items_data = [items_header]
    
    for i, item in enumerate(items, 1):
        items_data.append([
            str(i),
            str(item[0])[:25],  # product_name truncated
            item[1] or '-',      # hsn_code
            f"{float(item[2]):.0f}",  # quantity
            f"Rs.{float(item[3]):.2f}",  # unit_price
            f"Rs.{float(item[4]):.2f}",  # discount
            f"Rs.{float(item[5]):.2f}",  # tax
            f"Rs.{float(item[6]):.2f}"   # line_total
        ])
    
    col_widths = [width*0.05, width*0.25, width*0.10, width*0.08, width*0.13, width*0.11, width*0.11, width*0.14]
    items_table = Table(items_data, colWidths=col_widths)
    items_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), primary),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('ALIGN', (0, 1), (0, -1), 'CENTER'),
        ('ALIGN', (2, 1), (-1, -1), 'CENTER'),
        ('ALIGN', (-1, 1), (-1, -1), 'RIGHT'),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, light_gray]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.gray),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    elements.append(items_table)
    elements.append(Spacer(1, 5*mm))
    
    # Amount in words & Totals
    amount_words = number_to_words(float(inv_data['grand_total']))
    left_content = f"<b>Invoice Amount In Words</b><br/><i>{amount_words}</i>"
    if settings.get('invoice_terms'):
        left_content += f"<br/><br/><b>Terms And Conditions</b><br/>{settings['invoice_terms']}"
    
    # Calculate GST breakdown (assuming equal SGST/CGST)
    total_tax = float(inv_data['total_tax'])
    sgst = cgst = total_tax / 2
    
    totals_data = [
        ['Sub Total', f"Rs. {float(inv_data['subtotal']):,.2f}"],
        ['Discount', f"Rs. {float(inv_data['total_discount']):,.2f}"],
    ]
    if total_tax > 0:
        totals_data.append([f'SGST', f"Rs. {sgst:,.2f}"])
        totals_data.append([f'CGST', f"Rs. {cgst:,.2f}"])
    totals_data.append(['<b>Total</b>', f"<b>Rs. {float(inv_data['grand_total']):,.2f}</b>"])
    
    if float(inv_data['amount_paid']) > 0:
        totals_data.append(['Received', f"Rs. {float(inv_data['amount_paid']):,.2f}"])
        balance = float(inv_data['grand_total']) - float(inv_data['amount_paid'])
        totals_data.append(['Balance', f"Rs. {balance:,.2f}"])
    
    totals_table_data = [[Paragraph(row[0], styles['Normal']), 
                          Paragraph(row[1], ParagraphStyle('right', alignment=TA_RIGHT))] 
                         for row in totals_data]
    totals_table = Table(totals_table_data, colWidths=[60*mm, 35*mm])
    totals_table.setStyle(TableStyle([
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    
    summary_table = Table([
        [Paragraph(left_content, ParagraphStyle('left', fontSize=9)), totals_table]
    ], colWidths=[width*0.55, width*0.45])
    summary_table.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP')]))
    elements.append(summary_table)
    elements.append(Spacer(1, 8*mm))
    
    # Bank Details & Signature
    footer_left = ""
    if settings.get('show_bank_details') in ['true', True, '1'] and settings.get('bank_name'):
        footer_left = f"<b>Bank Details</b><br/>"
        footer_left += f"Bank: {settings['bank_name']}<br/>"
        footer_left += f"A/C: {settings.get('bank_account', '')}<br/>"
        footer_left += f"IFSC: {settings.get('bank_ifsc', '')}<br/>"
        footer_left += f"Branch: {settings.get('bank_branch', '')}"
    
    footer_right = ""
    if settings.get('show_signature') in ['true', True, '1']:
        footer_right = f"<b>For: {settings.get('business_name', '')}</b><br/><br/><br/><br/>Authorized Signatory"
    
    footer_table = Table([
        [Paragraph(footer_left, ParagraphStyle('left', fontSize=9)), 
         Paragraph(footer_right, ParagraphStyle('right', fontSize=9, alignment=TA_RIGHT))]
    ], colWidths=[width*0.5, width*0.5])
    footer_table.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP')]))
    elements.append(footer_table)


def generate_professional_template(elements, inv_data, items, settings, styles, width):
    """Generate Professional Blue Template"""
    primary = hex_to_color('#2563eb')
    secondary = hex_to_color('#1e3a5f')
    light_blue = hex_to_color('#eff6ff')
    
    # Header band
    business_name = settings.get('business_name', 'Business Name')
    header_style = ParagraphStyle('header', fontSize=18, textColor=colors.white, 
                                   alignment=TA_CENTER, spaceAfter=5)
    
    header_table = Table([[Paragraph(f"<b>{business_name}</b>", header_style)]], colWidths=[width])
    header_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), primary),
        ('TOPPADDING', (0, 0), (-1, -1), 12),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
    ]))
    elements.append(header_table)
    
    # Contact info
    contact_parts = []
    if settings.get('business_phone'):
        contact_parts.append(f"Tel: {settings['business_phone']}")
    if settings.get('business_email'):
        contact_parts.append(settings['business_email'])
    if settings.get('gstin'):
        contact_parts.append(f"GSTIN: {settings['gstin']}")
    
    if contact_parts:
        elements.append(Paragraph(" | ".join(contact_parts), 
                                  ParagraphStyle('contact', fontSize=9, alignment=TA_CENTER, spaceAfter=8)))
    elements.append(Spacer(1, 2*mm))
    
    # TAX INVOICE label
    elements.append(Paragraph("<b>TAX INVOICE</b>", 
                              ParagraphStyle('title', fontSize=12, alignment=TA_CENTER, 
                                            textColor=secondary, spaceAfter=8)))
    
    # Invoice info box
    info_left = f"<b>Invoice No:</b> {inv_data['invoice_number']}<br/><b>Date:</b> {inv_data['invoice_date']}"
    if inv_data.get('due_date'):
        info_left += f"<br/><b>Due Date:</b> {inv_data['due_date']}"
    
    info_right = f"<b>Bill To:</b><br/><b>{inv_data.get('customer_name') or 'Walk-in'}</b>"
    if inv_data.get('customer_phone'):
        info_right += f"<br/>{inv_data['customer_phone']}"
    if inv_data.get('customer_gstin'):
        info_right += f"<br/>GSTIN: {inv_data['customer_gstin']}"
    
    info_table = Table([
        [Paragraph(info_left, ParagraphStyle('left', fontSize=10)), 
         Paragraph(info_right, ParagraphStyle('right', fontSize=10, alignment=TA_RIGHT))]
    ], colWidths=[width*0.5, width*0.5])
    info_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BACKGROUND', (0, 0), (-1, -1), light_blue),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(info_table)
    elements.append(Spacer(1, 4*mm))
    
    # Items table
    items_header = ['#', 'Description', 'HSN', 'Qty', 'Rate', 'Tax', 'Amount']
    items_data = [items_header]
    
    for i, item in enumerate(items, 1):
        items_data.append([
            str(i),
            str(item[0])[:30],
            item[1] or '-',
            f"{float(item[2]):.0f}",
            f"Rs.{float(item[3]):.2f}",
            f"Rs.{float(item[5]):.2f}",
            f"Rs.{float(item[6]):.2f}"
        ])
    
    col_widths = [width*0.06, width*0.32, width*0.12, width*0.10, width*0.14, width*0.10, width*0.16]
    items_table = Table(items_data, colWidths=col_widths)
    items_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), primary),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('ALIGN', (2, 1), (-1, -1), 'CENTER'),
        ('ALIGN', (-1, 1), (-1, -1), 'RIGHT'),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, light_blue]),
        ('GRID', (0, 0), (-1, -1), 0.5, primary),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(items_table)
    elements.append(Spacer(1, 4*mm))
    
    # Totals
    totals_data = [
        ['Subtotal:', f"Rs. {float(inv_data['subtotal']):,.2f}"],
    ]
    if float(inv_data['total_discount']) > 0:
        totals_data.append(['Discount:', f"- Rs. {float(inv_data['total_discount']):,.2f}"])
    if float(inv_data['total_tax']) > 0:
        totals_data.append(['Tax:', f"Rs. {float(inv_data['total_tax']):,.2f}"])
    totals_data.append(['<b>TOTAL:</b>', f"<b>Rs. {float(inv_data['grand_total']):,.2f}</b>"])
    
    totals_table = Table([[Paragraph(r[0], styles['Normal']), 
                           Paragraph(r[1], ParagraphStyle('r', alignment=TA_RIGHT))] 
                          for r in totals_data], colWidths=[50*mm, 40*mm])
    totals_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('BACKGROUND', (0, -1), (-1, -1), primary),
        ('TEXTCOLOR', (0, -1), (-1, -1), colors.white),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    
    wrapper = Table([[Spacer(1, 1), totals_table]], colWidths=[width - 90*mm, 90*mm])
    elements.append(wrapper)
    elements.append(Spacer(1, 4*mm))
    
    # Amount in words
    elements.append(Paragraph(f"<i>Amount in words: {number_to_words(float(inv_data['grand_total']))}</i>", 
                              ParagraphStyle('words', fontSize=9, spaceAfter=8)))
    
    # Footer
    if settings.get('invoice_terms'):
        elements.append(Paragraph(f"<b>Terms:</b> {settings['invoice_terms']}", 
                                  ParagraphStyle('terms', fontSize=8, textColor=colors.gray)))


def generate_minimal_template(elements, inv_data, items, settings, styles, width):
    """Generate Minimal Clean Template"""
    dark = hex_to_color('#111827')
    gray = hex_to_color('#6b7280')
    
    # Simple header
    business_name = settings.get('business_name', 'Business Name')
    elements.append(Paragraph(f"<b>{business_name}</b>", 
                              ParagraphStyle('name', fontSize=20, textColor=dark, spaceAfter=5)))
    
    contact_parts = []
    if settings.get('business_phone'):
        contact_parts.append(settings['business_phone'])
    if settings.get('business_email'):
        contact_parts.append(settings['business_email'])
    if contact_parts:
        elements.append(Paragraph(" • ".join(contact_parts), 
                                  ParagraphStyle('contact', fontSize=9, textColor=gray, spaceAfter=12)))
    
    # Invoice title and number
    elements.append(Paragraph(f"INVOICE <font color='#6b7280'>#{inv_data['invoice_number']}</font>", 
                              ParagraphStyle('inv', fontSize=12, spaceAfter=3)))
    elements.append(Paragraph(f"Date: {inv_data['invoice_date']}", 
                              ParagraphStyle('date', fontSize=10, textColor=gray, spaceAfter=12)))
    
    # Bill To
    elements.append(Paragraph("<b>BILL TO</b>", ParagraphStyle('billto', fontSize=9, textColor=gray, spaceAfter=3)))
    elements.append(Paragraph(f"<b>{inv_data.get('customer_name') or 'Walk-in Customer'}</b>", 
                              ParagraphStyle('name', fontSize=11, spaceAfter=2)))
    if inv_data.get('customer_phone'):
        elements.append(Paragraph(inv_data['customer_phone'], ParagraphStyle('phone', fontSize=9, textColor=gray)))
    elements.append(Spacer(1, 6*mm))
    
    # Simple items table
    items_data = [['Item', 'Qty', 'Price', 'Amount']]
    for item in items:
        items_data.append([
            str(item[0])[:35],
            f"{float(item[2]):.0f}",
            f"Rs.{float(item[3]):.2f}",
            f"Rs.{float(item[6]):.2f}"
        ])
    
    col_widths = [width*0.50, width*0.15, width*0.17, width*0.18]
    items_table = Table(items_data, colWidths=col_widths)
    items_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('TEXTCOLOR', (0, 0), (-1, 0), gray),
        ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
        ('LINEBELOW', (0, 0), (-1, 0), 1, dark),
        ('LINEBELOW', (0, -1), (-1, -1), 0.5, gray),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(items_table)
    elements.append(Spacer(1, 5*mm))
    
    # Simple totals
    totals = f"<b>Total: Rs.{float(inv_data['grand_total']):,.2f}</b>"
    if float(inv_data['total_tax']) > 0:
        totals = f"Subtotal: Rs.{float(inv_data['subtotal']):,.2f}<br/>Tax: Rs.{float(inv_data['total_tax']):,.2f}<br/>" + totals
    
    elements.append(Paragraph(totals, ParagraphStyle('totals', fontSize=11, alignment=TA_RIGHT, spaceAfter=12)))
    
    # Simple footer
    if settings.get('invoice_terms'):
        elements.append(Spacer(1, 8*mm))
        elements.append(Paragraph(settings['invoice_terms'], ParagraphStyle('terms', fontSize=8, textColor=gray)))


# ============================================================================
# ENDPOINTS
# ============================================================================

# --- Business Settings ---
@router.get("/settings", response_model=BusinessSettingsOut)
def get_invoice_settings(
    current_user: Annotated[User, Depends(get_current_user)]
):
    """Get business settings for invoicing."""
    ALLOWED_ROLES = ["owner", "manager"]
    if not any(role in current_user.roles for role in ALLOWED_ROLES):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        settings = get_business_settings(cur)
        
        return BusinessSettingsOut(
            business_name=settings.get('business_name'),
            business_address=settings.get('business_address'),
            business_phone=settings.get('business_phone'),
            business_email=settings.get('business_email'),
            gstin=settings.get('gstin'),
            upi_id=settings.get('upi_id'),
            upi_payee_name=settings.get('upi_payee_name'),
            invoice_prefix=settings.get('invoice_prefix', 'INV'),
            invoice_footer=settings.get('invoice_footer'),
            invoice_terms=settings.get('invoice_terms')
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


@router.put("/settings")
def update_invoice_settings(
    settings: BusinessSettingsUpdate,
    current_user: Annotated[User, Depends(get_current_user)]
):
    """Update business settings for invoicing."""
    ALLOWED_ROLES = ["owner", "manager"]
    if not any(role in current_user.roles for role in ALLOWED_ROLES):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Update each provided setting (including new template settings)
        updates = {
            'business_name': settings.business_name,
            'business_address': settings.business_address,
            'business_phone': settings.business_phone,
            'business_email': settings.business_email,
            'gstin': settings.gstin,
            'upi_id': settings.upi_id,
            'upi_payee_name': settings.upi_payee_name,
            'invoice_prefix': settings.invoice_prefix,
            'invoice_footer': settings.invoice_footer,
            'invoice_terms': settings.invoice_terms,
            # Enhanced template settings
            'default_template': settings.default_template,
            'business_logo': settings.business_logo,
            'business_state': settings.business_state,
            'business_state_code': settings.business_state_code,
            'bank_name': settings.bank_name,
            'bank_account': settings.bank_account,
            'bank_ifsc': settings.bank_ifsc,
            'bank_branch': settings.bank_branch,
            'signature_image': settings.signature_image,
            'signature_name': settings.signature_name,
        }
        
        # Handle numeric settings (GST rates)
        numeric_settings = {
            'cgst_rate': settings.cgst_rate,
            'sgst_rate': settings.sgst_rate,
        }
        
        # Handle boolean settings
        bool_settings = {
            'show_logo': settings.show_logo,
            'show_bank_details': settings.show_bank_details,
            'show_upi_qr': settings.show_upi_qr,
            'show_signature': settings.show_signature,
        }
        
        for key, value in updates.items():
            if value is not None:
                cur.execute("""
                    INSERT INTO business_settings (key, value, updated_at)
                    VALUES (%s, %s, CURRENT_TIMESTAMP)
                    ON CONFLICT (key) DO UPDATE SET value = %s, updated_at = CURRENT_TIMESTAMP;
                """, (key, value, value))
        
        for key, value in numeric_settings.items():
            if value is not None:
                str_value = str(value)
                cur.execute("""
                    INSERT INTO business_settings (key, value, updated_at)
                    VALUES (%s, %s, CURRENT_TIMESTAMP)
                    ON CONFLICT (key) DO UPDATE SET value = %s, updated_at = CURRENT_TIMESTAMP;
                """, (key, str_value, str_value))
        
        for key, value in bool_settings.items():
            if value is not None:
                str_value = 'true' if value else 'false'
                cur.execute("""
                    INSERT INTO business_settings (key, value, updated_at)
                    VALUES (%s, %s, CURRENT_TIMESTAMP)
                    ON CONFLICT (key) DO UPDATE SET value = %s, updated_at = CURRENT_TIMESTAMP;
                """, (key, str_value, str_value))
        
        conn.commit()
        
        # Return updated settings
        updated = get_business_settings(cur)
        return {"success": True, "settings": updated}
        
    except HTTPException:
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


# --- Signature Image Upload ---
@router.post("/settings/signature")
async def upload_signature_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Upload signature image and store as base64."""
    ALLOWED_ROLES = ["owner", "manager"]
    if not any(role in current_user.roles for role in ALLOWED_ROLES):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Validate file type
    allowed_types = ["image/png", "image/jpeg", "image/jpg", "image/gif"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Invalid file type. Use PNG, JPG, or GIF.")
    
    # Check file size (max 500KB)
    contents = await file.read()
    if len(contents) > 500 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum 500KB.")
    
    # Convert to base64
    base64_image = base64.b64encode(contents).decode('utf-8')
    data_uri = f"data:{file.content_type};base64,{base64_image}"
    
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            INSERT INTO business_settings (key, value, updated_at)
            VALUES ('signature_image', %s, CURRENT_TIMESTAMP)
            ON CONFLICT (key) DO UPDATE SET value = %s, updated_at = CURRENT_TIMESTAMP;
        """, (data_uri, data_uri))
        
        conn.commit()
        
        return {"success": True, "message": "Signature uploaded successfully"}
        
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


@router.delete("/settings/signature")
def delete_signature_image(
    current_user: Annotated[User, Depends(get_current_user)]
):
    """Delete the signature image."""
    ALLOWED_ROLES = ["owner", "manager"]
    if not any(role in current_user.roles for role in ALLOWED_ROLES):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("DELETE FROM business_settings WHERE key = 'signature_image';")
        conn.commit()
        
        return {"success": True, "message": "Signature deleted"}
        
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


@router.get("/templates")
def get_invoice_templates(
    current_user: Annotated[User, Depends(get_current_user)]
):
    """Get available invoice templates."""
    ALLOWED_ROLES = ["owner", "manager", "employee"]
    if not any(role in current_user.roles for role in ALLOWED_ROLES):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Check if invoice_templates table exists
        cur.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'invoice_templates'
            );
        """)
        table_exists = cur.fetchone()[0]
        
        if table_exists:
            cur.execute("""
                SELECT id, name, description, template_type, primary_color, secondary_color, is_active
                FROM invoice_templates WHERE is_active = true
                ORDER BY template_type, name
            """)
            rows = cur.fetchall()
            
            templates = [{
                "id": row[0],
                "name": row[1],
                "description": row[2],
                "template_type": row[3],
                "primary_color": row[4],
                "secondary_color": row[5],
                "is_active": row[6]
            } for row in rows]
        else:
            # Return default templates if table doesn't exist
            templates = [
                {"id": 1, "name": "Classic Red", "description": "Professional red theme like Vyapaar", 
                 "template_type": "system", "primary_color": "#dc2626", "secondary_color": "#1f2937", "is_active": True},
                {"id": 2, "name": "Professional Blue", "description": "Corporate blue theme", 
                 "template_type": "system", "primary_color": "#2563eb", "secondary_color": "#1e3a5f", "is_active": True},
                {"id": 3, "name": "Minimal Clean", "description": "Simple modern design", 
                 "template_type": "system", "primary_color": "#374151", "secondary_color": "#111827", "is_active": True},
            ]
        
        return {"success": True, "templates": templates}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


# --- Invoice CRUD ---
@router.post("/", response_model=InvoiceOut)
def create_invoice(
    invoice: InvoiceCreate,
    current_user: Annotated[User, Depends(get_current_user)]
):
    """Create a new invoice."""
    ALLOWED_ROLES = ["owner", "manager", "employee"]
    if not any(role in current_user.roles for role in ALLOWED_ROLES):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    if not invoice.items:
        raise HTTPException(status_code=400, detail="Invoice must have at least one item")
    
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Get business settings
        settings = get_business_settings(cur)
        
        # If khata customer, get their details
        customer_name = invoice.customer_name
        customer_phone = invoice.customer_phone
        customer_email = invoice.customer_email
        
        if invoice.khata_customer_id:
            cur.execute("""
                SELECT name, phone, email, address FROM khata_customers WHERE id = %s;
            """, (invoice.khata_customer_id,))
            kc = cur.fetchone()
            if kc:
                customer_name = customer_name or kc[0]
                customer_phone = customer_phone or kc[1]
                customer_email = customer_email or kc[2]
                invoice.customer_address = invoice.customer_address or kc[3]
        
        # Calculate totals
        subtotal = 0
        total_discount = invoice.additional_discount
        total_tax = 0
        
        for item in invoice.items:
            line_subtotal = item.quantity * item.unit_price
            discount = line_subtotal * (item.discount_percent / 100)
            taxable = line_subtotal - discount
            tax = taxable * (item.tax_percent / 100)
            
            subtotal += line_subtotal
            total_discount += discount
            total_tax += tax
        
        grand_total = subtotal - total_discount + total_tax + invoice.additional_charges
        
        # Generate UPI link if settings available
        upi_link = None
        if settings.get('upi_id') and grand_total > 0:
            # Invoice number will be generated by trigger
            upi_link = f"upi://pay?pa={settings['upi_id']}&pn={settings.get('upi_payee_name', 'Store')}&am={grand_total:.2f}&cu=INR"
        
        # Set due date (default: 30 days for B2B, 7 days for Khata)
        due_date = invoice.due_date
        if not due_date:
            if invoice.invoice_type == 'B2B':
                due_date = date.today() + timedelta(days=30)
            elif invoice.invoice_type == 'KHATA':
                due_date = date.today() + timedelta(days=7)
        
        # Create invoice (trigger will generate invoice_number)
        cur.execute("""
            INSERT INTO invoices (
                invoice_type, khata_customer_id, b2b_client_id, sales_order_id,
                customer_name, customer_phone, customer_email, customer_address, customer_gstin,
                subtotal, total_discount, total_tax, additional_charges, grand_total,
                amount_paid, payment_status, upi_payment_link, notes, due_date, created_by
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, invoice_number, invoice_date, created_at;
        """, (
            invoice.invoice_type, invoice.khata_customer_id, invoice.b2b_client_id,
            invoice.sales_order_id, customer_name, customer_phone, customer_email,
            invoice.customer_address, invoice.customer_gstin,
            subtotal, total_discount, total_tax, invoice.additional_charges, grand_total,
            0, 'PENDING', upi_link, invoice.notes, due_date, current_user.id
        ))
        
        inv_row = cur.fetchone()
        invoice_id = inv_row[0]
        invoice_number = inv_row[1]
        invoice_date = inv_row[2]
        created_at = inv_row[3]
        
        # Update UPI link with actual invoice number
        if settings.get('upi_id') and grand_total > 0:
            upi_link = generate_upi_link(
                settings['upi_id'],
                settings.get('upi_payee_name', 'Store'),
                grand_total,
                invoice_number
            )
            cur.execute("UPDATE invoices SET upi_payment_link = %s WHERE id = %s", (upi_link, invoice_id))
        
        # Insert line items
        items_out = []
        for item in invoice.items:
            line_subtotal = item.quantity * item.unit_price
            discount_amount = line_subtotal * (item.discount_percent / 100)
            taxable = line_subtotal - discount_amount
            tax_amount = taxable * (item.tax_percent / 100)
            line_total = taxable + tax_amount
            
            cur.execute("""
                INSERT INTO invoice_items (
                    invoice_id, product_id, product_name, product_sku, hsn_code,
                    quantity, unit_price, discount_percent, discount_amount,
                    tax_percent, tax_amount, line_total
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id;
            """, (
                invoice_id, item.product_id, item.product_name, item.product_sku,
                item.hsn_code, item.quantity, item.unit_price,
                item.discount_percent, discount_amount, item.tax_percent, tax_amount, line_total
            ))
            
            item_id = cur.fetchone()[0]
            items_out.append(InvoiceItemOut(
                id=item_id,
                product_name=item.product_name,
                product_sku=item.product_sku,
                hsn_code=item.hsn_code,
                quantity=item.quantity,
                unit_price=item.unit_price,
                discount_percent=item.discount_percent,
                discount_amount=discount_amount,
                tax_percent=item.tax_percent,
                tax_amount=tax_amount,
                line_total=line_total
            ))
        
        conn.commit()
        
        return InvoiceOut(
            id=invoice_id,
            invoice_number=invoice_number,
            invoice_type=invoice.invoice_type,
            invoice_date=invoice_date,
            due_date=due_date,
            khata_customer_id=invoice.khata_customer_id,
            customer_name=customer_name,
            customer_phone=customer_phone,
            customer_email=customer_email,
            customer_gstin=invoice.customer_gstin,
            subtotal=subtotal,
            total_discount=total_discount,
            total_tax=total_tax,
            grand_total=grand_total,
            amount_paid=0,
            balance_due=grand_total,
            payment_status='PENDING',
            upi_payment_link=upi_link,
            items=items_out,
            created_at=created_at
        )
        
    except HTTPException:
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


@router.get("/", response_model=List[InvoiceOut])
def get_invoices(
    current_user: Annotated[User, Depends(get_current_user)],
    invoice_type: Optional[str] = None,
    payment_status: Optional[str] = None,
    khata_customer_id: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0)
):
    """Get invoices with optional filters."""
    ALLOWED_ROLES = ["owner", "manager", "employee"]
    if not any(role in current_user.roles for role in ALLOWED_ROLES):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        query = """
            SELECT i.id, i.invoice_number, i.invoice_type, i.invoice_date, i.due_date,
                   i.khata_customer_id, i.customer_name, i.customer_phone, i.customer_email,
                   i.customer_gstin, i.subtotal, i.total_discount, i.total_tax, i.grand_total,
                   i.amount_paid, i.payment_status, i.upi_payment_link, i.created_at
            FROM invoices i
            WHERE 1=1
        """
        params = []
        
        if invoice_type:
            query += " AND i.invoice_type = %s"
            params.append(invoice_type)
        
        if payment_status:
            query += " AND i.payment_status = %s"
            params.append(payment_status)
        
        if khata_customer_id:
            query += " AND i.khata_customer_id = %s"
            params.append(khata_customer_id)
        
        if start_date:
            query += " AND i.invoice_date >= %s"
            params.append(start_date)
        
        if end_date:
            query += " AND i.invoice_date <= %s"
            params.append(end_date)
        
        query += " ORDER BY i.created_at DESC LIMIT %s OFFSET %s"
        params.extend([limit, offset])
        
        cur.execute(query, params)
        rows = cur.fetchall()
        
        invoices = []
        for row in rows:
            invoice_id = row[0]
            
            # Get items
            cur.execute("""
                SELECT id, product_name, product_sku, hsn_code, quantity, unit_price,
                       discount_percent, discount_amount, tax_percent, tax_amount, line_total
                FROM invoice_items
                WHERE invoice_id = %s;
            """, (invoice_id,))
            
            items = [
                InvoiceItemOut(
                    id=item[0],
                    product_name=item[1],
                    product_sku=item[2],
                    hsn_code=item[3],
                    quantity=float(item[4]),
                    unit_price=float(item[5]),
                    discount_percent=float(item[6]),
                    discount_amount=float(item[7]),
                    tax_percent=float(item[8]),
                    tax_amount=float(item[9]),
                    line_total=float(item[10])
                )
                for item in cur.fetchall()
            ]
            
            grand_total = float(row[13])
            amount_paid = float(row[14])
            
            invoices.append(InvoiceOut(
                id=row[0],
                invoice_number=row[1],
                invoice_type=row[2],
                invoice_date=row[3],
                due_date=row[4],
                khata_customer_id=row[5],
                customer_name=row[6],
                customer_phone=row[7],
                customer_email=row[8],
                customer_gstin=row[9],
                subtotal=float(row[10]),
                total_discount=float(row[11]),
                total_tax=float(row[12]),
                grand_total=grand_total,
                amount_paid=amount_paid,
                balance_due=grand_total - amount_paid,
                payment_status=row[15],
                upi_payment_link=row[16],
                items=items,
                created_at=row[17]
            ))
        
        return invoices
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


@router.get("/{invoice_id}", response_model=InvoiceOut)
def get_invoice(
    invoice_id: int,
    current_user: Annotated[User, Depends(get_current_user)]
):
    """Get single invoice by ID."""
    ALLOWED_ROLES = ["owner", "manager", "employee"]
    if not any(role in current_user.roles for role in ALLOWED_ROLES):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT id, invoice_number, invoice_type, invoice_date, due_date,
                   khata_customer_id, customer_name, customer_phone, customer_email,
                   customer_gstin, subtotal, total_discount, total_tax, grand_total,
                   amount_paid, payment_status, upi_payment_link, created_at
            FROM invoices
            WHERE id = %s;
        """, (invoice_id,))
        
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Invoice not found")
        
        # Get items
        cur.execute("""
            SELECT id, product_name, product_sku, hsn_code, quantity, unit_price,
                   discount_percent, discount_amount, tax_percent, tax_amount, line_total
            FROM invoice_items
            WHERE invoice_id = %s;
        """, (invoice_id,))
        
        items = [
            InvoiceItemOut(
                id=item[0],
                product_name=item[1],
                product_sku=item[2],
                hsn_code=item[3],
                quantity=float(item[4]),
                unit_price=float(item[5]),
                discount_percent=float(item[6]),
                discount_amount=float(item[7]),
                tax_percent=float(item[8]),
                tax_amount=float(item[9]),
                line_total=float(item[10])
            )
            for item in cur.fetchall()
        ]
        
        grand_total = float(row[13])
        amount_paid = float(row[14])
        
        return InvoiceOut(
            id=row[0],
            invoice_number=row[1],
            invoice_type=row[2],
            invoice_date=row[3],
            due_date=row[4],
            khata_customer_id=row[5],
            customer_name=row[6],
            customer_phone=row[7],
            customer_email=row[8],
            customer_gstin=row[9],
            subtotal=float(row[10]),
            total_discount=float(row[11]),
            total_tax=float(row[12]),
            grand_total=grand_total,
            amount_paid=amount_paid,
            balance_due=grand_total - amount_paid,
            payment_status=row[15],
            upi_payment_link=row[16],
            items=items,
            created_at=row[17]
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


# --- Invoice PDF ---
@router.get("/{invoice_id}/pdf")
def download_invoice_pdf(
    invoice_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    template: str = Query("classic", description="Template: classic, professional, minimal")
):
    """Generate and download invoice PDF with template selection."""
    if not HAS_REPORTLAB:
        raise HTTPException(status_code=500, detail="PDF generation not available. Install reportlab.")
    
    ALLOWED_ROLES = ["owner", "manager", "employee"]
    if not any(role in current_user.roles for role in ALLOWED_ROLES):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Get invoice
        cur.execute("""
            SELECT id, invoice_number, invoice_type, invoice_date, due_date,
                   customer_name, customer_phone, customer_email, customer_address, customer_gstin,
                   subtotal, total_discount, total_tax, additional_charges, grand_total,
                   amount_paid, payment_status, upi_payment_link, notes
            FROM invoices WHERE id = %s;
        """, (invoice_id,))
        
        inv = cur.fetchone()
        if not inv:
            raise HTTPException(status_code=404, detail="Invoice not found")
        
        # Get items
        cur.execute("""
            SELECT product_name, hsn_code, quantity, unit_price, discount_amount, tax_amount, line_total
            FROM invoice_items WHERE invoice_id = %s;
        """, (invoice_id,))
        items = cur.fetchall()
        
        # Get business settings
        settings = get_business_settings(cur)
        
        # Prepare invoice data dict for template functions
        inv_data = {
            'invoice_number': inv[1],
            'invoice_type': inv[2],
            'invoice_date': str(inv[3]),
            'due_date': str(inv[4]) if inv[4] else None,
            'customer_name': inv[5],
            'customer_phone': inv[6],
            'customer_email': inv[7],
            'customer_address': inv[8],
            'customer_gstin': inv[9],
            'subtotal': inv[10],
            'total_discount': inv[11],
            'total_tax': inv[12],
            'additional_charges': inv[13],
            'grand_total': inv[14],
            'amount_paid': inv[15],
            'payment_status': inv[16],
        }
        
        # Generate PDF with selected template
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, 
                               leftMargin=15*mm, rightMargin=15*mm,
                               topMargin=15*mm, bottomMargin=15*mm)
        
        styles = getSampleStyleSheet()
        elements = []
        width = A4[0] - 30*mm
        
        # Select template
        template_lower = template.lower()
        if template_lower == "professional":
            generate_professional_template(elements, inv_data, items, settings, styles, width)
        elif template_lower == "minimal":
            generate_minimal_template(elements, inv_data, items, settings, styles, width)
        else:  # classic (default)
            generate_classic_template(elements, inv_data, items, settings, styles, width)
        
        # Add UPI QR if enabled
        if settings.get('show_upi_qr') in ['true', True, '1'] and inv[17] and HAS_QRCODE:
            qr_bytes = generate_upi_qr_bytes(inv[17])
            if qr_bytes:
                elements.append(Spacer(1, 5*mm))
                qr_image = Image(io.BytesIO(qr_bytes), width=60, height=60)
                qr_table = Table([
                    [Paragraph('<b>Scan to Pay</b>', styles['Center'])],
                    [qr_image],
                    [Paragraph(f"UPI: {settings.get('upi_id', '')}", 
                              ParagraphStyle('small', fontSize=8, alignment=TA_CENTER))]
                ])
                qr_table.setStyle(TableStyle([('ALIGN', (0, 0), (-1, -1), 'CENTER')]))
                elements.append(qr_table)
        
        # Build PDF
        doc.build(elements)
        buffer.seek(0)
        
        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename={inv[1]}.pdf"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


# --- Record Payment on Invoice ---
@router.post("/{invoice_id}/pay")
def record_invoice_payment(
    invoice_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    amount: float = Query(..., gt=0),
    payment_mode: str = "cash"
):
    """Record payment against an invoice."""
    ALLOWED_ROLES = ["owner", "manager", "employee"]
    if not any(role in current_user.roles for role in ALLOWED_ROLES):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT grand_total, amount_paid FROM invoices WHERE id = %s;
        """, (invoice_id,))
        
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Invoice not found")
        
        grand_total = float(row[0])
        current_paid = float(row[1])
        new_paid = current_paid + amount
        
        # Determine new status
        if new_paid >= grand_total:
            new_status = 'PAID'
        else:
            new_status = 'PARTIAL'
        
        cur.execute("""
            UPDATE invoices 
            SET amount_paid = %s, payment_status = %s, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            RETURNING invoice_number;
        """, (new_paid, new_status, invoice_id))
        
        inv_number = cur.fetchone()[0]
        conn.commit()
        
        return {
            "message": f"Payment of ₹{amount:.2f} recorded on {inv_number}",
            "total_paid": new_paid,
            "balance_due": max(0, grand_total - new_paid),
            "status": new_status
        }
        
    except HTTPException:
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


# --- UPI QR Code Endpoint ---
@router.get("/{invoice_id}/upi-qr")
def get_invoice_upi_qr(
    invoice_id: int,
    current_user: Annotated[User, Depends(get_current_user)]
):
    """Get UPI QR code image for invoice payment."""
    if not HAS_QRCODE:
        raise HTTPException(status_code=500, detail="QR code generation not available. Install qrcode.")
    
    ALLOWED_ROLES = ["owner", "manager", "employee"]
    if not any(role in current_user.roles for role in ALLOWED_ROLES):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("SELECT upi_payment_link FROM invoices WHERE id = %s", (invoice_id,))
        row = cur.fetchone()
        
        if not row:
            raise HTTPException(status_code=404, detail="Invoice not found")
        
        if not row[0]:
            raise HTTPException(status_code=400, detail="No UPI link available for this invoice")
        
        qr_bytes = generate_upi_qr_bytes(row[0])
        if not qr_bytes:
            raise HTTPException(status_code=500, detail="Failed to generate QR code")
        
        return StreamingResponse(
            io.BytesIO(qr_bytes),
            media_type="image/png"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()
