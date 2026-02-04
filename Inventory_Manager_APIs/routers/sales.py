from fastapi import APIRouter, HTTPException, Depends, Request, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr
from typing import Annotated, List, Optional
import os
from dotenv import load_dotenv
from datetime import datetime
import io
import base64
from reportlab.lib.pagesizes import letter, A4
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT

# HTML to PDF conversion
from xhtml2pdf import pisa
from jinja2 import Environment, FileSystemLoader
import pathlib

from security import get_current_user, check_role, User, get_db_connection, create_audit_log

# Optional: QR code support
try:
    import qrcode
    HAS_QRCODE = True
except ImportError:
    HAS_QRCODE = False

router = APIRouter(
    prefix="/api/v1/sales",
    tags=["Sales"]
)

load_dotenv()
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASS = os.getenv("DB_PASS")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")

# Setup Jinja2 template environment
TEMPLATES_DIR = pathlib.Path(__file__).resolve().parent.parent / "templates"
print(f"[DEBUG] TEMPLATES_DIR: {TEMPLATES_DIR}, exists: {TEMPLATES_DIR.exists()}")
jinja_env = Environment(loader=FileSystemLoader(str(TEMPLATES_DIR)))


# ============================================================================
# HELPER FUNCTIONS FOR INVOICE TEMPLATES
# ============================================================================

def number_to_words(num):
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
    
    # Indian numbering system
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


def hex_to_color(hex_str):
    """Convert hex color to reportlab color."""
    hex_str = hex_str.lstrip('#')
    r = int(hex_str[0:2], 16) / 255
    g = int(hex_str[2:4], 16) / 255
    b = int(hex_str[4:6], 16) / 255
    return colors.Color(r, g, b)


def get_business_settings_dict(cur):
    """Get business settings as dictionary."""
    cur.execute("SELECT key, value FROM business_settings;")
    rows = cur.fetchall()
    return {row[0]: row[1] for row in rows} if rows else {}


def add_signature_section(elements, settings, width, primary_color):
    """Add signature section with optional image."""
    if settings.get('show_signature') not in ['true', True, '1']:
        return
    
    sig_name = settings.get('signature_name', 'Authorized Signatory')
    sig_image = settings.get('signature_image', '')
    
    # Create signature box
    sig_content = []
    
    if sig_image and sig_image.startswith('data:image'):
        # Decode base64 image
        try:
            import base64
            # Extract base64 data
            header, data = sig_image.split(',', 1)
            img_bytes = base64.b64decode(data)
            img_buffer = io.BytesIO(img_bytes)
            sig_img = Image(img_buffer, width=60, height=30)
            sig_content.append([sig_img])
        except:
            sig_content.append([Paragraph('', ParagraphStyle('Empty', fontSize=30))])
    else:
        # Empty space for manual signature
        sig_content.append([Paragraph('<br/><br/>', ParagraphStyle('Empty', fontSize=12))])
    
    sig_content.append([Paragraph(f"<b>{sig_name}</b>", 
                                  ParagraphStyle('SigName', fontSize=9, alignment=TA_CENTER))])
    sig_content.append([Paragraph('Authorized Signatory', 
                                  ParagraphStyle('SigTitle', fontSize=8, alignment=TA_CENTER, textColor=colors.grey))])
    
    sig_table = Table(sig_content, colWidths=[width*0.35])
    sig_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))
    
    # Right-align the signature
    wrapper = Table([[Paragraph('', ParagraphStyle('Empty')), sig_table]], colWidths=[width*0.6, width*0.4])
    wrapper.setStyle(TableStyle([('ALIGN', (1, 0), (1, 0), 'RIGHT')]))
    elements.append(wrapper)


def generate_html_invoice_pdf(order_data, items_list, settings, template_name="classic"):
    """
    Generate invoice PDF using HTML templates and xhtml2pdf.
    Returns BytesIO buffer with PDF content.
    """
    import traceback
    
    # Select template
    template_file = f"invoice_{template_name}.html"
    try:
        template = jinja_env.get_template(template_file)
    except Exception as e:
        print(f"Template load error: {e}")
        # Fallback to classic if template not found
        template = jinja_env.get_template("invoice_classic.html")
    
    # Calculate totals
    grand_total = float(order_data.get('total_amount', 0))
    subtotal = sum(float(item.get('total_price', 0)) for item in items_list)
    
    # Get GST rates from settings
    cgst_rate = float(settings.get('cgst_rate', 9))
    sgst_rate = float(settings.get('sgst_rate', 9))
    total_gst_rate = cgst_rate + sgst_rate
    
    # Calculate tax amounts (back-calculate from inclusive total)
    taxable_amount = grand_total / (1 + total_gst_rate / 100)
    cgst_amount = taxable_amount * cgst_rate / 100
    sgst_amount = taxable_amount * sgst_rate / 100
    gst_amount = cgst_amount + sgst_amount
    
    # Amount in words
    amount_words = number_to_words(grand_total)
    
    # Format date
    invoice_date = order_data.get('order_date', '')[:10] if order_data.get('order_date') else datetime.now().strftime('%Y-%m-%d')
    
    # Prepare template context
    context = {
        # Business info
        'business_name': settings.get('business_name', 'Your Business'),
        'business_address': settings.get('business_address', ''),
        'business_phone': settings.get('business_phone', ''),
        'business_email': settings.get('business_email', ''),
        'gstin': settings.get('gstin', ''),
        
        # Invoice info
        'invoice_prefix': settings.get('invoice_prefix', 'INV-'),
        'order_id': order_data.get('order_id', ''),
        'invoice_date': invoice_date,
        
        # Customer info
        'customer_name': order_data.get('customer_name', 'Walk-in Customer'),
        'customer_phone': order_data.get('customer_phone', ''),
        'customer_gstin': order_data.get('customer_gstin', ''),
        
        # Payment
        'payment_method': str(order_data.get('payment_method', 'CASH')).upper(),
        'payment_reference': order_data.get('payment_reference', ''),
        
        # Items
        'items': items_list,
        
        # Amounts
        'subtotal': subtotal,
        'taxable_amount': taxable_amount,
        'cgst_rate': cgst_rate,
        'sgst_rate': sgst_rate,
        'total_gst_rate': total_gst_rate,
        'cgst_amount': cgst_amount,
        'sgst_amount': sgst_amount,
        'gst_amount': gst_amount,
        'discount_amount': 0,
        'grand_total': grand_total,
        'amount_in_words': amount_words,
        
        # Bank details
        'show_bank_details': settings.get('show_bank_details') in ['true', True, '1'],
        'bank_name': settings.get('bank_name', ''),
        'bank_account': settings.get('bank_account', ''),
        'bank_ifsc': settings.get('bank_ifsc', ''),
        'upi_id': settings.get('upi_id', ''),
        
        # Signature
        'signature_image': settings.get('signature_image', ''),
        
        # Terms
        'terms_conditions': settings.get('terms_conditions', ''),
    }
    
    try:
        # Render HTML
        html_content = template.render(**context)
        
        # Convert to PDF
        buffer = io.BytesIO()
        pisa_status = pisa.CreatePDF(io.StringIO(html_content), dest=buffer)
        
        if pisa_status.err:
            raise Exception(f"PDF generation error: {pisa_status.err}")
        
        buffer.seek(0)
        return buffer
    except Exception as e:
        print(f"PDF Generation Error: {e}")
        traceback.print_exc()
        raise


def generate_sales_classic_template(elements, order_data, items, settings, styles, width):
    """Generate Classic GST Tax Invoice - Professional Shop Style."""
    primary_color = hex_to_color('#1a1a1a')
    border_color = colors.black
    
    # ============ HEADER - TAX INVOICE TITLE ============
    title_table = Table([[Paragraph('<b>TAX INVOICE</b>', 
                         ParagraphStyle('Title', fontSize=14, alignment=TA_CENTER, textColor=colors.black))]], 
                       colWidths=[width])
    title_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), hex_to_color('#f5f5f5')),
        ('BOX', (0, 0), (-1, -1), 1, border_color),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(title_table)
    
    # ============ BUSINESS DETAILS BOX ============
    biz_name = settings.get('business_name', 'Your Business Name')
    biz_address = settings.get('business_address', '')
    biz_phone = settings.get('business_phone', '')
    biz_email = settings.get('business_email', '')
    biz_gstin = settings.get('gstin', '')
    biz_state = settings.get('business_state', '')
    biz_state_code = settings.get('business_state_code', '')
    
    biz_left = f"<b>{biz_name}</b><br/>"
    if biz_address:
        biz_left += f"{biz_address}<br/>"
    if biz_phone:
        biz_left += f"Phone: {biz_phone}"
    if biz_email:
        biz_left += f" | Email: {biz_email}"
    
    biz_right = ""
    if biz_gstin:
        biz_right += f"<b>GSTIN:</b> {biz_gstin}<br/>"
    if biz_state:
        biz_right += f"<b>State:</b> {biz_state}"
        if biz_state_code:
            biz_right += f" ({biz_state_code})"
    
    biz_table = Table([
        [Paragraph(biz_left, ParagraphStyle('BizL', fontSize=10, leading=14)),
         Paragraph(biz_right, ParagraphStyle('BizR', fontSize=9, alignment=TA_RIGHT, leading=12))]
    ], colWidths=[width*0.6, width*0.4])
    biz_table.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 1, border_color),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(biz_table)
    
    # ============ INVOICE INFO + CUSTOMER BOX ============
    inv_prefix = settings.get('invoice_prefix', 'INV')
    inv_date = order_data.get('order_date', '')[:10] if order_data.get('order_date') else ''
    
    inv_info = f"<b>Invoice No:</b> {inv_prefix}-{order_data['order_id']}<br/>"
    inv_info += f"<b>Date:</b> {inv_date}<br/>"
    pay_method = str(order_data.get('payment_method', 'cash')).upper()
    inv_info += f"<b>Payment:</b> {pay_method}"
    
    cust_name = order_data.get('customer_name') or 'Walk-in Customer'
    cust_phone = order_data.get('customer_phone', '')
    
    cust_info = f"<b>Bill To:</b><br/>"
    cust_info += f"{cust_name}<br/>"
    if cust_phone:
        cust_info += f"Phone: {cust_phone}"
    
    info_table = Table([
        [Paragraph(inv_info, ParagraphStyle('InvInfo', fontSize=9, leading=12)),
         Paragraph(cust_info, ParagraphStyle('CustInfo', fontSize=9, leading=12))]
    ], colWidths=[width*0.5, width*0.5])
    info_table.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 1, border_color),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, border_color),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(info_table)
    
    # ============ ITEMS TABLE ============
    table_data = [['S.No', 'Description of Goods', 'HSN', 'Qty', 'Rate (₹)', 'Amount (₹)']]
    
    subtotal = 0
    for i, item in enumerate(items, 1):
        name, qty, price = item[0], item[1], float(item[2])
        amount = qty * price
        subtotal += amount
        table_data.append([
            str(i),
            name[:35],
            '-',
            str(qty),
            f"{price:,.2f}",
            f"{amount:,.2f}"
        ])
    
    # Add empty rows if less than 5 items for consistent look
    while len(table_data) < 6:
        table_data.append(['', '', '', '', '', ''])
    
    col_widths = [width*0.08, width*0.38, width*0.10, width*0.10, width*0.17, width*0.17]
    items_table = Table(table_data, colWidths=col_widths)
    items_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), hex_to_color('#e8e8e8')),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('ALIGN', (0, 0), (0, -1), 'CENTER'),
        ('ALIGN', (2, 0), (-1, -1), 'CENTER'),
        ('ALIGN', (4, 1), (-1, -1), 'RIGHT'),
        ('BOX', (0, 0), (-1, -1), 1, border_color),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    elements.append(items_table)
    
    # ============ TOTALS + AMOUNT IN WORDS BOX ============
    grand_total = float(order_data.get('total_amount', subtotal))
    
    # Get dynamic GST rates from settings (default 9% each)
    cgst_rate = float(settings.get('cgst_rate', 9))
    sgst_rate = float(settings.get('sgst_rate', 9))
    total_gst_rate = cgst_rate + sgst_rate
    
    taxable = grand_total / (1 + total_gst_rate / 100)
    cgst = taxable * cgst_rate / 100
    sgst = taxable * sgst_rate / 100
    
    amount_words = number_to_words(grand_total)
    
    # Left: Amount in words, Right: Totals
    totals_content = f"""
    <b>Taxable Amount:</b> ₹{taxable:,.2f}<br/>
    <b>CGST @ {cgst_rate}%:</b> ₹{cgst:,.2f}<br/>
    <b>SGST @ {sgst_rate}%:</b> ₹{sgst:,.2f}<br/>
    <b>Round Off:</b> ₹0.00<br/>
    <font size="12"><b>Grand Total: ₹{grand_total:,.2f}</b></font>
    """
    
    words_content = f"<b>Amount in Words:</b><br/><i>{amount_words}</i>"
    
    totals_table = Table([
        [Paragraph(words_content, ParagraphStyle('Words', fontSize=9, leading=12)),
         Paragraph(totals_content, ParagraphStyle('Totals', fontSize=9, alignment=TA_RIGHT, leading=12))]
    ], colWidths=[width*0.55, width*0.45])
    totals_table.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 1, border_color),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, border_color),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(totals_table)
    
    # ============ BANK DETAILS + SIGNATURE ============
    bank_info = ""
    if settings.get('show_bank_details') in ['true', True, '1']:
        bank_name = settings.get('bank_name', '')
        if bank_name:
            bank_info = f"<b>Bank Details:</b><br/>"
            bank_info += f"Bank: {bank_name}<br/>"
            if settings.get('bank_account'):
                bank_info += f"A/C No: {settings['bank_account']}<br/>"
            if settings.get('bank_ifsc'):
                bank_info += f"IFSC: {settings['bank_ifsc']}<br/>"
            if settings.get('bank_branch'):
                bank_info += f"Branch: {settings['bank_branch']}"
    
    if settings.get('upi_id'):
        if bank_info:
            bank_info += f"<br/><br/>"
        bank_info += f"<b>UPI ID:</b> {settings['upi_id']}"
    
    if not bank_info:
        bank_info = "<br/>"
    
    # Signature section with image support
    sig_name = settings.get('signature_name', 'Authorized Signatory')
    sig_image = settings.get('signature_image', '')
    
    # Build signature cell content
    sig_elements = []
    sig_elements.append(Paragraph(f"<b>For {biz_name}</b>", 
                                  ParagraphStyle('ForBiz', fontSize=9, alignment=TA_CENTER)))
    sig_elements.append(Spacer(1, 3*mm))
    
    # Add signature image if available
    if sig_image and sig_image.startswith('data:image'):
        try:
            import base64
            header, data = sig_image.split(',', 1)
            img_bytes = base64.b64decode(data)
            img_buffer = io.BytesIO(img_bytes)
            sig_img = Image(img_buffer, width=80, height=40)
            sig_elements.append(sig_img)
        except:
            sig_elements.append(Spacer(1, 15*mm))
    else:
        sig_elements.append(Spacer(1, 15*mm))
    
    sig_elements.append(Paragraph('_________________________', 
                                  ParagraphStyle('Line', alignment=TA_CENTER)))
    sig_elements.append(Paragraph(sig_name, 
                                  ParagraphStyle('SigName', fontSize=8, alignment=TA_CENTER)))
    
    # Create signature table
    sig_table_inner = Table([[e] for e in sig_elements], colWidths=[width*0.40])
    sig_table_inner.setStyle(TableStyle([('ALIGN', (0, 0), (-1, -1), 'CENTER')]))
    
    footer_table = Table([
        [Paragraph(bank_info, ParagraphStyle('Bank', fontSize=8, leading=11)), sig_table_inner]
    ], colWidths=[width*0.55, width*0.45])
    footer_table.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 1, border_color),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, border_color),
        ('VALIGN', (0, 0), (0, 0), 'TOP'),
        ('VALIGN', (1, 0), (1, 0), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(footer_table)
    
    # ============ TERMS & FOOTER ============
    terms = settings.get('invoice_terms', '')
    if terms:
        elements.append(Spacer(1, 3*mm))
        elements.append(Paragraph(f"<b>Terms & Conditions:</b> {terms}", 
                                 ParagraphStyle('Terms', fontSize=7, textColor=colors.grey)))
    
    elements.append(Spacer(1, 5*mm))
    elements.append(Paragraph('This is a computer generated invoice.', 
                             ParagraphStyle('Footer', fontSize=7, alignment=TA_CENTER, textColor=colors.grey)))


def generate_sales_professional_template(elements, order_data, items, settings, styles, width):
    """Generate Professional Modern Invoice - Blue Theme."""
    primary_color = hex_to_color('#1e40af')
    light_blue = hex_to_color('#dbeafe')
    
    # ============ HEADER WITH BUSINESS NAME ============
    biz_name = settings.get('business_name', 'Your Business')
    
    header_left = Paragraph(f"<font size='16' color='#1e40af'><b>{biz_name}</b></font>", styles['Normal'])
    header_right = Paragraph("<font size='20' color='#1e40af'><b>INVOICE</b></font>", 
                            ParagraphStyle('Inv', alignment=TA_RIGHT))
    
    header_table = Table([[header_left, header_right]], colWidths=[width*0.6, width*0.4])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
    ]))
    elements.append(header_table)
    
    # Blue accent line
    line = Table([['']], colWidths=[width])
    line.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), primary_color)]))
    elements.append(line)
    elements.append(Spacer(1, 4*mm))
    
    # ============ FROM / TO / INVOICE DETAILS ============
    biz_address = settings.get('business_address', '')
    biz_phone = settings.get('business_phone', '')
    biz_gstin = settings.get('gstin', '')
    
    from_text = f"<b>From:</b><br/>{biz_name}<br/>"
    if biz_address:
        from_text += f"{biz_address}<br/>"
    if biz_phone:
        from_text += f"Ph: {biz_phone}<br/>"
    if biz_gstin:
        from_text += f"GSTIN: {biz_gstin}"
    
    cust_name = order_data.get('customer_name') or 'Walk-in Customer'
    cust_phone = order_data.get('customer_phone', '')
    
    to_text = f"<b>Bill To:</b><br/>{cust_name}<br/>"
    if cust_phone:
        to_text += f"Ph: {cust_phone}"
    
    inv_prefix = settings.get('invoice_prefix', 'INV')
    inv_date = order_data.get('order_date', '')[:10] if order_data.get('order_date') else ''
    
    inv_text = f"<b>Invoice #:</b> {inv_prefix}-{order_data['order_id']}<br/>"
    inv_text += f"<b>Date:</b> {inv_date}<br/>"
    pay_method = str(order_data.get('payment_method', 'cash')).upper()
    inv_text += f"<b>Payment:</b> {pay_method}"
    
    details_table = Table([
        [Paragraph(from_text, ParagraphStyle('From', fontSize=9, leading=12)),
         Paragraph(to_text, ParagraphStyle('To', fontSize=9, leading=12)),
         Paragraph(inv_text, ParagraphStyle('Inv', fontSize=9, leading=12, alignment=TA_RIGHT))]
    ], colWidths=[width*0.35, width*0.35, width*0.30])
    details_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BACKGROUND', (0, 0), (-1, -1), light_blue),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('BOX', (0, 0), (-1, -1), 1, primary_color),
    ]))
    elements.append(details_table)
    elements.append(Spacer(1, 5*mm))
    
    # ============ ITEMS TABLE ============
    table_data = [['#', 'Item Description', 'Qty', 'Unit Price', 'Amount']]
    
    subtotal = 0
    for i, item in enumerate(items, 1):
        name, qty, price = item[0], item[1], float(item[2])
        amount = qty * price
        subtotal += amount
        table_data.append([str(i), name[:40], str(qty), f"₹{price:,.2f}", f"₹{amount:,.2f}"])
    
    col_widths = [width*0.08, width*0.44, width*0.12, width*0.18, width*0.18]
    items_table = Table(table_data, colWidths=col_widths)
    items_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), primary_color),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('ALIGN', (0, 0), (0, -1), 'CENTER'),
        ('ALIGN', (2, 0), (-1, -1), 'RIGHT'),
        ('GRID', (0, 0), (-1, -1), 0.5, hex_to_color('#cbd5e1')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, light_blue]),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(items_table)
    elements.append(Spacer(1, 3*mm))
    
    # ============ TOTALS ============
    grand_total = float(order_data.get('total_amount', subtotal))
    
    # Get dynamic GST rates from settings (default 9% each)
    cgst_rate = float(settings.get('cgst_rate', 9))
    sgst_rate = float(settings.get('sgst_rate', 9))
    total_gst_rate = cgst_rate + sgst_rate
    
    taxable = grand_total / (1 + total_gst_rate / 100)
    cgst = taxable * cgst_rate / 100
    sgst = taxable * sgst_rate / 100
    
    totals_data = [
        ['', '', '', 'Subtotal:', f"₹{subtotal:,.2f}"],
        ['', '', '', f'CGST ({cgst_rate}%):', f"₹{cgst:,.2f}"],
        ['', '', '', f'SGST ({sgst_rate}%):', f"₹{sgst:,.2f}"],
        ['', '', '', 'TOTAL:', f"₹{grand_total:,.2f}"],
    ]
    
    totals_table = Table(totals_data, colWidths=[width*0.08, width*0.44, width*0.12, width*0.18, width*0.18])
    totals_table.setStyle(TableStyle([
        ('ALIGN', (3, 0), (-1, -1), 'RIGHT'),
        ('FONTNAME', (3, -1), (-1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (3, -1), (-1, -1), 11),
        ('BACKGROUND', (3, -1), (-1, -1), primary_color),
        ('TEXTCOLOR', (3, -1), (-1, -1), colors.white),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    elements.append(totals_table)
    elements.append(Spacer(1, 3*mm))
    
    # Amount in words
    amount_words = number_to_words(grand_total)
    elements.append(Paragraph(f"<b>Amount in Words:</b> <i>{amount_words}</i>", 
                             ParagraphStyle('Words', fontSize=9)))
    elements.append(Spacer(1, 5*mm))
    
    # ============ BANK DETAILS ============
    if settings.get('show_bank_details') in ['true', True, '1'] and settings.get('bank_name'):
        bank_data = [
            ['Bank Name:', settings.get('bank_name', ''), 'IFSC:', settings.get('bank_ifsc', '')],
            ['Account No:', settings.get('bank_account', ''), 'Branch:', settings.get('bank_branch', '')],
        ]
        bank_table = Table(bank_data, colWidths=[width*0.15, width*0.35, width*0.12, width*0.38])
        bank_table.setStyle(TableStyle([
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
            ('BACKGROUND', (0, 0), (-1, -1), light_blue),
            ('BOX', (0, 0), (-1, -1), 0.5, primary_color),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ]))
        elements.append(Paragraph("<b>Bank Details:</b>", ParagraphStyle('BankT', fontSize=9)))
        elements.append(bank_table)
        elements.append(Spacer(1, 5*mm))
    
    # ============ SIGNATURE ============
    biz_name = settings.get('business_name', 'Your Business')
    sig_name = settings.get('signature_name', 'Authorized Signatory')
    sig_image = settings.get('signature_image', '')
    
    # Build signature with optional image
    sig_rows = [
        ['', Paragraph(f"<b>For {biz_name}</b>", ParagraphStyle('For', fontSize=9, alignment=TA_CENTER))]
    ]
    
    # Add signature image if available
    if sig_image and sig_image.startswith('data:image'):
        try:
            import base64
            header, data = sig_image.split(',', 1)
            img_bytes = base64.b64decode(data)
            img_buffer = io.BytesIO(img_bytes)
            sig_img = Image(img_buffer, width=80, height=40)
            sig_rows.append(['', sig_img])
        except:
            sig_rows.append(['', Spacer(1, 15*mm)])
    else:
        sig_rows.append(['', Spacer(1, 15*mm)])
    
    sig_rows.append(['', Paragraph('_________________________', ParagraphStyle('Line', alignment=TA_CENTER))])
    sig_rows.append(['', Paragraph(sig_name, ParagraphStyle('SigN', fontSize=8, alignment=TA_CENTER))])
    
    sig_table = Table(sig_rows, colWidths=[width*0.6, width*0.4])
    sig_table.setStyle(TableStyle([
        ('ALIGN', (1, 0), (1, -1), 'CENTER'),
    ]))
    elements.append(sig_table)
    
    # Footer
    elements.append(Spacer(1, 8*mm))
    elements.append(Paragraph('<b>Thank you for your business!</b>', 
                             ParagraphStyle('Thanks', fontSize=10, alignment=TA_CENTER, textColor=primary_color)))


def generate_sales_minimal_template(elements, order_data, items, settings, styles, width):
    """Generate Minimal Clean Invoice - Elegant Simple Design."""
    text_color = hex_to_color('#1f2937')
    grey = hex_to_color('#6b7280')
    light_grey = hex_to_color('#f3f4f6')
    
    # ============ SIMPLE HEADER ============
    biz_name = settings.get('business_name', 'Your Business')
    
    elements.append(Paragraph(f"<font size='14'><b>{biz_name}</b></font>", 
                             ParagraphStyle('BizName', textColor=text_color)))
    
    # Address line
    addr_parts = []
    if settings.get('business_address'):
        addr_parts.append(settings['business_address'])
    if settings.get('business_phone'):
        addr_parts.append(f"Tel: {settings['business_phone']}")
    if settings.get('gstin'):
        addr_parts.append(f"GSTIN: {settings['gstin']}")
    
    if addr_parts:
        elements.append(Paragraph(' • '.join(addr_parts), 
                                 ParagraphStyle('Addr', fontSize=8, textColor=grey)))
    
    elements.append(Spacer(1, 2*mm))
    
    # Thin line
    line = Table([['']], colWidths=[width])
    line.setStyle(TableStyle([('LINEBELOW', (0, 0), (-1, -1), 1, text_color)]))
    elements.append(line)
    elements.append(Spacer(1, 4*mm))
    
    # ============ INVOICE DETAILS ============
    inv_prefix = settings.get('invoice_prefix', 'INV')
    inv_date = order_data.get('order_date', '')[:10] if order_data.get('order_date') else ''
    cust_name = order_data.get('customer_name') or 'Walk-in Customer'
    
    details_left = f"<b>Invoice:</b> {inv_prefix}-{order_data['order_id']}"
    details_right = f"<b>Date:</b> {inv_date}"
    
    det_table = Table([
        [Paragraph(details_left, ParagraphStyle('DL', fontSize=10)),
         Paragraph(details_right, ParagraphStyle('DR', fontSize=10, alignment=TA_RIGHT))]
    ], colWidths=[width*0.5, width*0.5])
    elements.append(det_table)
    
    elements.append(Paragraph(f"<b>Customer:</b> {cust_name}", 
                             ParagraphStyle('Cust', fontSize=10)))
    elements.append(Spacer(1, 5*mm))
    
    # ============ ITEMS TABLE ============
    table_data = [['Item', 'Qty', 'Rate', 'Amount']]
    
    subtotal = 0
    for item in items:
        name, qty, price = item[0], item[1], float(item[2])
        amount = qty * price
        subtotal += amount
        table_data.append([name[:45], str(qty), f"₹{price:,.2f}", f"₹{amount:,.2f}"])
    
    col_widths = [width*0.50, width*0.12, width*0.19, width*0.19]
    items_table = Table(table_data, colWidths=col_widths)
    items_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
        ('LINEBELOW', (0, 0), (-1, 0), 1, text_color),
        ('LINEBELOW', (0, -1), (-1, -1), 0.5, grey),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('BACKGROUND', (0, 0), (-1, 0), light_grey),
    ]))
    elements.append(items_table)
    elements.append(Spacer(1, 3*mm))
    
    # ============ TOTALS ============
    grand_total = float(order_data.get('total_amount', subtotal))
    
    # Get dynamic GST rates from settings (default 9% each)
    cgst_rate = float(settings.get('cgst_rate', 9))
    sgst_rate = float(settings.get('sgst_rate', 9))
    total_gst_rate = cgst_rate + sgst_rate
    
    taxable = grand_total / (1 + total_gst_rate / 100)
    gst_amount = grand_total - taxable
    
    totals_data = [
        ['Subtotal', f"₹{subtotal:,.2f}"],
        [f'Tax (GST {total_gst_rate:.0f}%)', f"₹{gst_amount:,.2f}"],
    ]
    
    totals_table = Table(totals_data, colWidths=[width*0.75, width*0.25])
    totals_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'RIGHT'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    elements.append(totals_table)
    
    # Grand total box
    total_box = Table([[Paragraph(f"<b>Total: ₹{grand_total:,.2f}</b>", 
                                  ParagraphStyle('Total', fontSize=12, alignment=TA_RIGHT))]], 
                      colWidths=[width])
    total_box.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), text_color),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.white),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
    ]))
    elements.append(total_box)
    elements.append(Spacer(1, 3*mm))
    
    # Amount in words
    amount_words = number_to_words(grand_total)
    elements.append(Paragraph(f"<i>{amount_words}</i>", 
                             ParagraphStyle('Words', fontSize=8, textColor=grey)))
    elements.append(Spacer(1, 8*mm))
    
    # ============ PAYMENT & BANK ============
    pay_method = str(order_data.get('payment_method', 'cash')).upper()
    elements.append(Paragraph(f"<b>Payment:</b> {pay_method}", 
                             ParagraphStyle('Pay', fontSize=9)))
    
    if settings.get('upi_id'):
        elements.append(Paragraph(f"<b>UPI:</b> {settings['upi_id']}", 
                                 ParagraphStyle('UPI', fontSize=9)))
    
    if settings.get('show_bank_details') in ['true', True, '1'] and settings.get('bank_name'):
        bank_line = f"<b>Bank:</b> {settings['bank_name']}"
        if settings.get('bank_account'):
            bank_line += f" | A/C: {settings['bank_account']}"
        if settings.get('bank_ifsc'):
            bank_line += f" | IFSC: {settings['bank_ifsc']}"
        elements.append(Paragraph(bank_line, ParagraphStyle('Bank', fontSize=8, textColor=grey)))
    
    # ============ SIGNATURE ============
    elements.append(Spacer(1, 10*mm))
    
    sig_name = settings.get('signature_name', 'Authorized Signatory')
    sig_image = settings.get('signature_image', '')
    
    sig_rows = []
    
    # Add signature image if available
    if sig_image and sig_image.startswith('data:image'):
        try:
            import base64
            header, data = sig_image.split(',', 1)
            img_bytes = base64.b64decode(data)
            img_buffer = io.BytesIO(img_bytes)
            sig_img = Image(img_buffer, width=70, height=35)
            sig_rows.append(['', sig_img])
        except:
            pass
    
    sig_rows.append(['', Paragraph('________________________', ParagraphStyle('Line', alignment=TA_CENTER))])
    sig_rows.append(['', Paragraph(sig_name, ParagraphStyle('SigN', fontSize=8, alignment=TA_CENTER, textColor=grey))])
    
    sig_table = Table(sig_rows, colWidths=[width*0.65, width*0.35])
    sig_table.setStyle(TableStyle([('ALIGN', (1, 0), (1, -1), 'CENTER')]))
    elements.append(sig_table)
    
    # Footer
    elements.append(Spacer(1, 8*mm))
    footer = settings.get('invoice_footer', 'Thank you for your business!')
    elements.append(Paragraph(footer, ParagraphStyle('Footer', fontSize=9, alignment=TA_CENTER, textColor=text_color)))


# --- Models ---

class SalesOrderItemIn(BaseModel):
    product_id: int
    quantity: int
    unit_price: float 

class SalesOrderIn(BaseModel):
    customer_name: str | None = None
    customer_email: EmailStr | None = None
    customer_phone: str | None = None 
    sales_channel: str # 'in-store', 'online'
    items: List[SalesOrderItemIn]
    payment_method: str = "cash"  # Defaults to cash - options: cash, upi, card, credit (khata)
    payment_reference: str | None = None # e.g., "UPI-123456"
    khata_customer_id: int | None = None  # Required when payment_method = "credit"

class SalesOrderItemOut(BaseModel):
    product_id: int
    sku: str
    product_name: str
    quantity: int
    unit_price: str 
    unit_cost: Optional[str] = None 

class SalesOrderHeader(BaseModel):
    id: int
    order_timestamp: datetime
    customer_name: Optional[str]
    total_amount: str
    sales_channel: str
    status: str
    fulfillment_method: str
    payment_method: str | None = None 
    payment_reference: str | None = None
    customer_phone: str | None = None

class SalesOrderDetails(SalesOrderHeader):
    customer_email: Optional[EmailStr]
    customer_phone: Optional[str]
    user_id: Optional[int]
    external_order_id: Optional[str]
    items: List[SalesOrderItemOut]

class PaginatedSalesResponse(BaseModel):
    items: List[SalesOrderHeader]
    total: int
    page: int
    total_pages: int

# --- Endpoints ---

# 1. Get MY Orders (Customer - Only if logged in)
@router.get("/orders/me", response_model=List[SalesOrderHeader])
def get_my_sales_orders(
    current_user: Annotated[User, Depends(check_role("customer"))]
):
    conn = None
    try:
        conn = get_db_connection()
        if conn is None:
            raise HTTPException(status_code=500, detail="Database connection failed")
        
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, order_timestamp, customer_name, total_amount, sales_channel, status, fulfillment_method, payment_method, payment_reference
            FROM sales_orders
            WHERE user_id = %s
            ORDER BY order_timestamp DESC;
            """,
            (current_user.id,)
        )
        orders = cur.fetchall()
        cur.close()
        
        orders_list = []
        for order in orders:
            orders_list.append(SalesOrderHeader(
                id=order[0],
                order_timestamp=order[1],
                customer_name=order[2],
                total_amount=str(order[3]),
                sales_channel=order[4],
                status=order[5],
                fulfillment_method=order[6] or "POS",
                payment_method=order[7],
                payment_reference=order[8]
            ))
        return orders_list
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn: conn.close()

# 2. Create a New Sales Order (Auto-FIFO Logic with Profit Tracking)
@router.post("/orders", response_model=SalesOrderHeader)
def create_sales_order(
    order: SalesOrderIn,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)] 
):
    # --- PERMISSION CHECK ---
    ALLOWED_ROLES = ["owner", "manager", "employee"]
    if not any(role in current_user.roles for role in ALLOWED_ROLES):
        raise HTTPException(status_code=403, detail="Not authorized to create sales orders")

    conn = None
    try:
        # --- Auto-Calculate Total ---
        calculated_total = 0.0
        for item in order.items:
            calculated_total += (item.quantity * item.unit_price)
        final_total_amount = round(calculated_total, 2)

        conn = get_db_connection()
        if conn is None:
            raise HTTPException(status_code=500, detail="Database connection failed")
        
        cur = conn.cursor()
        
        # === KHATA (CREDIT) PAYMENT VALIDATION ===
        khata_customer_data = None
        if order.payment_method == "credit":
            if not order.khata_customer_id:
                raise HTTPException(
                    status_code=400, 
                    detail="Khata customer ID is required for credit payments"
                )
            
            # Check if customer exists and is not blocked
            cur.execute("""
                SELECT id, name, phone, current_balance, credit_limit, is_blocked, is_active
                FROM khata_customers 
                WHERE id = %s;
            """, (order.khata_customer_id,))
            
            khata_customer_data = cur.fetchone()
            if not khata_customer_data:
                raise HTTPException(status_code=404, detail="Khata customer not found")
            
            kc_id, kc_name, kc_phone, kc_balance, kc_limit, kc_blocked, kc_active = khata_customer_data
            
            if not kc_active:
                raise HTTPException(status_code=400, detail=f"Khata customer '{kc_name}' is inactive")
            
            if kc_blocked:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Customer '{kc_name}' is blocked due to exceeding credit limit"
                )
            
            # Check if this purchase would exceed credit limit
            available_credit = float(kc_limit) - float(kc_balance)
            if final_total_amount > available_credit:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Insufficient credit. Available: ₹{available_credit:.2f}, Required: ₹{final_total_amount:.2f}"
                )
            
            # Set customer info from khata
            if not order.customer_name:
                order.customer_name = kc_name
            if not order.customer_phone:
                order.customer_phone = kc_phone
        # === END KHATA VALIDATION ===
        
        user_id_for_db = None
        final_customer_name = order.customer_name
        final_customer_email = order.customer_email
        
        # --- Channel Logic ---
        if order.sales_channel == 'in-store':
            if not any(role in current_user.roles for role in ALLOWED_ROLES):
                 raise HTTPException(status_code=403, detail="Unauthorized sales channel.")
            
            if order.customer_phone:
                cur.execute("SELECT id, username, email FROM users WHERE phone_number = %s", (order.customer_phone,))
                loyalty_member = cur.fetchone()
                if loyalty_member:
                    user_id_for_db = loyalty_member[0]
                    if not final_customer_name: final_customer_name = loyalty_member[1]
                    if not final_customer_email: final_customer_email = loyalty_member[2]
            
            if not final_customer_name: final_customer_name = "Walk-in Customer"
        else:
             user_id_for_db = None

        # --- Create Receipt ---
        cur.execute(
            """
            INSERT INTO sales_orders (
                customer_name, customer_email, customer_phone, total_amount, 
                sales_channel, status, user_id, fulfillment_method,
                payment_method, payment_reference
            )
            VALUES (%s, %s, %s, %s, %s, 'completed', %s, 'POS', %s, %s)
            RETURNING id, order_timestamp, customer_name, total_amount, sales_channel, status, fulfillment_method, payment_method, payment_reference, customer_phone;
            """,
            (
                final_customer_name, 
                final_customer_email, 
                order.customer_phone, 
                final_total_amount, 
                order.sales_channel, 
                user_id_for_db,
                order.payment_method,
                order.payment_reference
            )
        )
        new_order_header = cur.fetchone()
        new_order_id = new_order_header[0]
        
        # --- Process Items (Auto-FIFO: Shelf First, Then Warehouse) ---
        SHELF_RESTOCK_THRESHOLD = 5  # Alert when shelf stock drops below this
        
        for item in order.items:
            quantity_to_fulfill = item.quantity
            
            # 1. Capture Current Cost (For Profit Reports)
            cur.execute("SELECT average_cost, name FROM products WHERE id = %s", (item.product_id,))
            cost_res = cur.fetchone()
            current_unit_cost = float(cost_res[0]) if cost_res and cost_res[0] is not None else 0.0
            product_name = cost_res[1] if cost_res else f"Product {item.product_id}"

            # 2. Find available stock from SHELF (store locations) first
            sql_find_shelf_stock = """
            SELECT b.id, b.quantity, l.name, l.location_type
            FROM inventory_batches b
            JOIN locations l ON b.location_id = l.id
            WHERE 
                b.product_id = %s 
                AND b.quantity > 0
                AND l.location_type = 'store' 
            ORDER BY 
                b.expiry_date ASC NULLS LAST, 
                b.received_at ASC
            FOR UPDATE;
            """
            cur.execute(sql_find_shelf_stock, (item.product_id,))
            shelf_batches = cur.fetchall()
            
            # 3. Find available stock from WAREHOUSE
            sql_find_warehouse_stock = """
            SELECT b.id, b.quantity, l.name, l.location_type
            FROM inventory_batches b
            JOIN locations l ON b.location_id = l.id
            WHERE 
                b.product_id = %s 
                AND b.quantity > 0
                AND l.location_type = 'warehouse' 
            ORDER BY 
                b.expiry_date ASC NULLS LAST, 
                b.received_at ASC
            FOR UPDATE;
            """
            cur.execute(sql_find_warehouse_stock, (item.product_id,))
            warehouse_batches = cur.fetchall()
            
            # Combine: Shelf first, then Warehouse
            all_batches = list(shelf_batches) + list(warehouse_batches)
            total_available = sum(b[1] for b in all_batches)
            total_shelf_stock = sum(b[1] for b in shelf_batches)
            
            # 4. Block sale only if TOTAL stock is insufficient
            if total_available < quantity_to_fulfill:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Not enough stock for '{product_name}'. Requested: {quantity_to_fulfill}, Available (Total): {total_available}"
                )

            # 5. Deduct from batches (Shelf first, then Warehouse)
            for batch in all_batches:
                if quantity_to_fulfill == 0:
                    break
                
                batch_id, batch_quantity, loc_name, loc_type = batch
                take_qty = min(batch_quantity, quantity_to_fulfill)
                
                # Add Line Item
                cur.execute(
                    "INSERT INTO sales_order_items (order_id, product_id, quantity, unit_price, unit_cost) VALUES (%s, %s, %s, %s, %s);",
                    (new_order_id, item.product_id, take_qty, item.unit_price, current_unit_cost)
                )
                
                # Update Batch
                cur.execute(
                    "UPDATE inventory_batches SET quantity = quantity - %s WHERE id = %s RETURNING quantity",
                    (take_qty, batch_id)
                )
                updated_qty = cur.fetchone()[0]
                
                quantity_to_fulfill -= take_qty
                
                # Log if batch emptied
                if updated_qty == 0:
                    create_audit_log(
                        user=current_user,
                        action="BATCH_EMPTIED",
                        request=request,
                        target_table="inventory_batches",
                        target_id=batch_id,
                        details={"message": f"Batch empty at {loc_name} ({loc_type})", "product_id": item.product_id}
                    )
            
            # 6. Check stock levels and create INDEPENDENT alerts
            SHELF_RESTOCK_THRESHOLD = 5
            LOW_STOCK_THRESHOLD = 20
            
            # Get current shelf stock
            cur.execute("""
                SELECT COALESCE(SUM(b.quantity), 0) 
                FROM inventory_batches b 
                JOIN locations l ON b.location_id = l.id 
                WHERE b.product_id = %s AND l.location_type = 'store'
            """, (item.product_id,))
            remaining_shelf_stock = cur.fetchone()[0] or 0
            
            # Get warehouse stock
            cur.execute("""
                SELECT COALESCE(SUM(b.quantity), 0) 
                FROM inventory_batches b 
                JOIN locations l ON b.location_id = l.id 
                WHERE b.product_id = %s AND l.location_type = 'warehouse'
            """, (item.product_id,))
            warehouse_stock = cur.fetchone()[0] or 0
            
            total_stock = remaining_shelf_stock + warehouse_stock
            
            # INDEPENDENT CHECK 1: SHELF RESTOCK (shelf < 5)
            if remaining_shelf_stock < SHELF_RESTOCK_THRESHOLD:
                cur.execute("""
                    SELECT id FROM system_alerts 
                    WHERE message LIKE %s AND is_resolved = FALSE
                """, (f"%SHELF RESTOCK NEEDED: '{product_name}'%",))
                
                if not cur.fetchone():
                    cur.execute("""
                        INSERT INTO system_alerts (severity, message, created_at, is_resolved, status)
                        VALUES ('warning', %s, NOW(), FALSE, 'active')
                    """, (f"SHELF RESTOCK NEEDED: '{product_name}' has only {remaining_shelf_stock} units on shelf. (Warehouse has {warehouse_stock} units)",))
            
            # INDEPENDENT CHECK 2: LOW STOCK (total < 20)
            if total_stock < LOW_STOCK_THRESHOLD:
                cur.execute("""
                    SELECT id FROM system_alerts 
                    WHERE message LIKE %s AND is_resolved = FALSE
                """, (f"%LOW STOCK: '{product_name}'%",))
                
                if not cur.fetchone():
                    cur.execute("""
                        INSERT INTO system_alerts (severity, message, created_at, is_resolved, status)
                        VALUES ('critical', %s, NOW(), FALSE, 'active')
                    """, (f"LOW STOCK: '{product_name}' has only {total_stock} units total. ORDER FROM SUPPLIER needed.",))
            
            # Audit log
            if remaining_shelf_stock < SHELF_RESTOCK_THRESHOLD or total_stock < LOW_STOCK_THRESHOLD:
                create_audit_log(
                    user=current_user,
                    action="STOCK_ALERT_TRIGGERED",
                    request=request,
                    target_table="products",
                    target_id=item.product_id,
                    details={
                        "product_name": product_name,
                        "shelf_stock": remaining_shelf_stock,
                        "warehouse_stock": warehouse_stock,
                        "total_stock": total_stock,
                        "shelf_alert": remaining_shelf_stock < SHELF_RESTOCK_THRESHOLD,
                        "low_stock_alert": total_stock < LOW_STOCK_THRESHOLD
                    }
                )

        # === RECORD KHATA TRANSACTION (if credit payment) ===
        if order.payment_method == "credit" and khata_customer_data:
            kc_id, kc_name, kc_phone, kc_balance, kc_limit, kc_blocked, kc_active = khata_customer_data
            new_balance = float(kc_balance) + final_total_amount
            
            # Insert khata transaction (the trigger will update balance)
            cur.execute("""
                INSERT INTO khata_transactions (
                    customer_id, type, amount, running_balance,
                    sales_order_id, notes, created_by, created_by_name
                )
                VALUES (%s, 'CREDIT_SALE', %s, %s, %s, %s, %s, %s);
            """, (
                kc_id, 
                final_total_amount, 
                new_balance,
                new_order_id,
                f"Credit sale - Order #{new_order_id}",
                current_user.id,
                current_user.username
            ))
            
            # Check if customer should be blocked after this purchase
            if new_balance >= float(kc_limit):
                cur.execute("""
                    UPDATE khata_customers 
                    SET is_blocked = TRUE, 
                        block_reason = 'Credit limit exceeded',
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s;
                """, (kc_id,))
        # === END KHATA TRANSACTION ===

        conn.commit()
        cur.close()
        
        return SalesOrderHeader(
            id=new_order_header[0],
            order_timestamp=new_order_header[1],
            customer_name=new_order_header[2],
            total_amount=str(new_order_header[3]),
            sales_channel=new_order_header[4],
            status=new_order_header[5],
            fulfillment_method=new_order_header[6] or "POS",
            payment_method=new_order_header[7],
            payment_reference=new_order_header[8],
            customer_phone=new_order_header[9]
        )
        
    except Exception as e:
        if conn: conn.rollback()
        if "403" in str(e): raise HTTPException(status_code=403, detail="Unauthorized.")
        if "Not enough stock" in str(e): raise HTTPException(status_code=400, detail=str(e))
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")
    finally:
        if conn: conn.close()

# 3. Get All Sales Orders (UPDATED: Fixed Pagination Logic)
@router.get("/orders", response_model=PaginatedSalesResponse)
def get_all_sales_orders(
    current_user: Annotated[User, Depends(get_current_user)],
    search: Optional[str] = None,
    status: Optional[str] = None,
    payment_method: Optional[str] = None, 
    page: int = 1,
    limit: int = 50,
    sort_by: str = "date",
    sort_order: str = "desc"
):
    ALLOWED_ROLES = ["owner", "manager", "employee"]
    if not any(role in current_user.roles for role in ALLOWED_ROLES):
        raise HTTPException(status_code=403, detail="Not authorized to view sales history")

    conn = None
    try:
        conn = get_db_connection()
        if conn is None:
            raise HTTPException(status_code=500, detail="Database connection failed")
        
        cur = conn.cursor()
        
        # 1. Build Base Query
        query_base = " FROM sales_orders WHERE 1=1"
        params = []

        if status and status.lower() != 'all':
            query_base += " AND status = %s"
            params.append(status)

        if payment_method and payment_method.lower() != 'all':
            query_base += " AND payment_method = %s"
            params.append(payment_method)

        if search:
            query_base += " AND (customer_name ILIKE %s OR id::text ILIKE %s OR customer_phone ILIKE %s)"
            wildcard_search = f"%{search}%"
            params.extend([wildcard_search, wildcard_search, wildcard_search])

        # 2. Get Total Count
        cur.execute(f"SELECT COUNT(*) {query_base}", tuple(params))
        total_records = cur.fetchone()[0]

        # 3. Sorting
        sort_map = {
            "date": "order_timestamp",
            "amount": "total_amount",
            "customer": "LOWER(customer_name)",
            "payment": "payment_method",
            "id": "id"
        }
        db_sort_col = sort_map.get(sort_by, "order_timestamp")
        query_base += f" ORDER BY {db_sort_col} {sort_order.upper()}, order_timestamp DESC"

        # 4. Pagination
        offset = (page - 1) * limit
        query_final = f"""
            SELECT id, order_timestamp, customer_name, total_amount, sales_channel, status, fulfillment_method, payment_method, payment_reference, customer_phone
            {query_base}
            LIMIT %s OFFSET %s
        """
        params.extend([limit, offset])
        
        cur.execute(query_final, tuple(params))
        orders = cur.fetchall()
        cur.close()
        
        orders_list = []
        for order in orders:
            orders_list.append(SalesOrderHeader(
                id=order[0],
                order_timestamp=order[1],
                customer_name=order[2] or "Walk-in Customer",
                total_amount=str(order[3]),
                sales_channel=order[4],
                status=order[5],
                fulfillment_method=order[6] or "POS",
                payment_method=order[7] or "N/A",
                payment_reference=order[8],
                customer_phone=order[9]
            ))
        
        # 5. Calculate Total Pages (FIXED)
        total_pages = (total_records + limit - 1) // limit

        return PaginatedSalesResponse(
            items=orders_list,
            total=total_records,
            page=page,
            total_pages=total_pages
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn: conn.close()

# 4. Export Sales List PDF
@router.get("/export_pdf")
def export_sales_pdf(
    current_user: Annotated[User, Depends(get_current_user)],
    search: Optional[str] = None,
    payment_method: Optional[str] = None,
    sort_by: str = "date",
    sort_order: str = "desc"
):
    ALLOWED_ROLES = ["owner", "manager", "employee"]
    if not any(role in current_user.roles for role in ALLOWED_ROLES):
        raise HTTPException(status_code=403, detail="Not authorized")

    conn = get_db_connection()
    cur = conn.cursor()
    
    try:
        query = "SELECT id, order_timestamp, customer_name, total_amount, payment_method FROM sales_orders WHERE 1=1"
        params = []
        
        if search:
            query += " AND (customer_name ILIKE %s OR id::text ILIKE %s)"
            params.extend([f"%{search}%", f"%{search}%"])

        if payment_method and payment_method.lower() != 'all':
            query += " AND payment_method = %s"
            params.append(payment_method)

        sort_map = {
            "date": "order_timestamp", 
            "payment": "payment_method", 
            "amount": "total_amount", 
            "customer": "LOWER(customer_name)",
            "id": "id"
        }
        col = sort_map.get(sort_by, "order_timestamp")
        query += f" ORDER BY {col} {sort_order.upper()}, order_timestamp DESC"
        
        cur.execute(query, tuple(params))
        rows = cur.fetchall()

        buffer = io.BytesIO()
        p = canvas.Canvas(buffer, pagesize=letter)
        w, h = letter
        
        # Register Unicode font for rupee symbol support
        font_regular = 'Helvetica'
        font_bold = 'Helvetica-Bold'
        rupee = 'Rs.'  # Default fallback
        
        # Try to register a Unicode font from Windows system fonts
        try:
            import os.path
            # Try common Windows fonts that support ₹
            font_paths = [
                ('C:/Windows/Fonts/arial.ttf', 'C:/Windows/Fonts/arialbd.ttf'),
                ('C:/Windows/Fonts/segoeui.ttf', 'C:/Windows/Fonts/segoeuib.ttf'),
                ('C:/Windows/Fonts/calibri.ttf', 'C:/Windows/Fonts/calibrib.ttf'),
            ]
            for regular_path, bold_path in font_paths:
                if os.path.exists(regular_path) and os.path.exists(bold_path):
                    pdfmetrics.registerFont(TTFont('UniFont', regular_path))
                    pdfmetrics.registerFont(TTFont('UniFont-Bold', bold_path))
                    font_regular = 'UniFont'
                    font_bold = 'UniFont-Bold'
                    rupee = '₹'
                    break
        except Exception as e:
            print(f"Could not register Unicode font: {e}")
        
        p.setFont(font_bold, 16)
        p.drawString(50, h - 50, f"Sales Report (Generated: {datetime.now().strftime('%Y-%m-%d')})")
        
        y = h - 100
        p.setFont(font_bold, 10)
        p.drawString(40, y, "ID")
        p.drawString(100, y, "Date")
        p.drawString(240, y, "Customer")
        p.drawString(400, y, "Method")
        p.drawString(500, y, "Amount")
        p.line(40, y-5, 550, y-5)
        
        y -= 25
        p.setFont(font_regular, 10)
        
        total_sales = 0.0
        
        for row in rows:
            if y < 50: 
                p.showPage()
                y = h - 50
                p.setFont(font_regular, 10)
            
            p.drawString(40, y, str(row[0]))
            p.drawString(100, y, str(row[1])[:16])
            p.drawString(240, y, str(row[2] or "Guest")[:25])
            p.drawString(400, y, str(row[4] or "Cash"))
            p.drawString(500, y, f"{rupee}{float(row[3]):.2f}")
            
            total_sales += float(row[3])
            y -= 20

        p.line(40, y+10, 550, y+10)
        p.setFont(font_bold, 12)
        p.drawString(400, y-10, "Total Sales:")
        p.drawString(500, y-10, f"{rupee}{total_sales:.2f}")

        p.save()
        buffer.seek(0)
        
        return StreamingResponse(
            buffer, 
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=sales_report.pdf"}
        )
    finally:
        conn.close()

# 5. Export SINGLE Order Receipt PDF with Template Selection
@router.get("/orders/{order_id}/pdf")
def export_single_order_pdf(
    order_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    template: str = Query("classic", description="Template: classic, professional, minimal")
):
    """Generate invoice PDF for a sales order with template selection using HTML templates."""
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # Get order header
        cur.execute("""
            SELECT id, order_timestamp, customer_name, total_amount, payment_method, 
                   payment_reference, customer_phone 
            FROM sales_orders WHERE id = %s
        """, (order_id,))
        header = cur.fetchone()
        if not header:
            raise HTTPException(status_code=404, detail="Order not found")

        # Get order items with more details
        cur.execute("""
            SELECT p.name, i.quantity, i.unit_price, p.sku
            FROM sales_order_items i 
            JOIN products p ON i.product_id = p.id 
            WHERE i.order_id = %s
        """, (order_id,))
        items_raw = cur.fetchall()
        
        # Get business settings
        settings = get_business_settings_dict(cur)
        
        # Prepare order data
        order_data = {
            'order_id': header[0],
            'order_date': str(header[1])[:19] if header[1] else '',
            'customer_name': header[2] or 'Walk-in Customer',
            'total_amount': float(header[3]) if header[3] else 0,
            'payment_method': header[4] or 'CASH',
            'payment_reference': header[5] or '',
            'customer_phone': header[6] or '',
        }
        
        # Prepare items list for HTML template
        items_list = []
        for item in items_raw:
            unit_price = float(item[2]) if item[2] else 0
            quantity = int(item[1]) if item[1] else 0
            items_list.append({
                'name': item[0],
                'quantity': quantity,
                'unit_price': unit_price,
                'total_price': unit_price * quantity,
                'sku': item[3] or '',
                'hsn_code': '',  # HSN code not in products table
            })
        
        # Generate PDF using HTML template
        template_lower = template.lower()
        if template_lower not in ['classic', 'professional', 'minimal']:
            template_lower = 'classic'
        
        buffer = generate_html_invoice_pdf(order_data, items_list, settings, template_lower)
        
        return StreamingResponse(
            buffer, 
            media_type="application/pdf", 
            headers={"Content-Disposition": f"attachment; filename=Invoice_{order_id}.pdf"}
        )

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print("=== PDF ENDPOINT ERROR ===")
        traceback.print_exc()
        print("=== END ERROR ===")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

# 6. Get Single Order Details
@router.get("/orders/{order_id}", response_model=SalesOrderDetails)
def get_sales_order_by_id(
    order_id: int,
    current_user: Annotated[User, Depends(get_current_user)]
):
    conn = None
    try:
        conn = get_db_connection()
        if conn is None:
            raise HTTPException(status_code=500, detail="Database connection failed")
        
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, order_timestamp, customer_name, customer_email, total_amount, sales_channel, status, user_id, customer_phone, external_order_id, fulfillment_method, payment_method, payment_reference
            FROM sales_orders WHERE id = %s
            """,
            (order_id,)
        )
        order_header = cur.fetchone()
        
        if not order_header:
            raise HTTPException(status_code=404, detail="Order not found")
        
        order_user_id = order_header[7]
        
        ALLOWED_ROLES = ["owner", "manager", "employee"]
        is_staff = any(role in current_user.roles for role in ALLOWED_ROLES)
        
        if not is_staff and order_user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to view this order")
        
        cur.execute(
            """
            SELECT i.product_id, p.sku, p.name as product_name, i.quantity, i.unit_price, i.unit_cost
            FROM sales_order_items i
            JOIN products p ON i.product_id = p.id
            WHERE i.order_id = %s;
            """,
            (order_id,)
        )
        items = cur.fetchall()
        cur.close()
        
        items_list = []
        for item in items:
            items_list.append(SalesOrderItemOut(
                product_id=item[0],
                sku=item[1],
                product_name=item[2],
                quantity=item[3],
                unit_price=str(item[4]),
                unit_cost=str(item[5]) if item[5] else None
            ))
        
        return SalesOrderDetails(
            id=order_header[0],
            order_timestamp=order_header[1],
            customer_name=order_header[2],
            customer_email=order_header[3],
            total_amount=str(order_header[4]),
            sales_channel=order_header[5],
            status=order_header[6],
            user_id=order_user_id,
            customer_phone=order_header[8],
            external_order_id=order_header[9],
            fulfillment_method=order_header[10] or "POS",
            payment_method=order_header[11],
            payment_reference=order_header[12],
            items=items_list
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn: conn.close()