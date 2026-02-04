import client from '../api/client';

// ============================================================================
// TYPES
// ============================================================================

export interface InvoiceItem {
  id: number;
  product_name: string;
  product_sku: string | null;
  hsn_code: string | null;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  discount_amount: number;
  tax_percent: number;
  tax_amount: number;
  line_total: number;
}

export interface Invoice {
  id: number;
  invoice_number: string;
  invoice_type: 'RETAIL' | 'B2B' | 'KHATA';
  invoice_date: string;
  due_date: string | null;
  khata_customer_id: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_gstin: string | null;
  subtotal: number;
  total_discount: number;
  total_tax: number;
  grand_total: number;
  amount_paid: number;
  balance_due: number;
  payment_status: 'PENDING' | 'PARTIAL' | 'PAID' | 'CANCELLED';
  upi_payment_link: string | null;
  items: InvoiceItem[];
  created_at: string;
}

export interface InvoiceItemCreate {
  product_id?: number;
  product_name: string;
  product_sku?: string;
  hsn_code?: string;
  quantity: number;
  unit_price: number;
  discount_percent?: number;
  tax_percent?: number;
}

export interface InvoiceCreate {
  invoice_type?: 'RETAIL' | 'B2B' | 'KHATA';
  khata_customer_id?: number;
  b2b_client_id?: number;
  sales_order_id?: number;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  customer_address?: string;
  customer_gstin?: string;
  items: InvoiceItemCreate[];
  additional_discount?: number;
  additional_charges?: number;
  notes?: string;
  due_date?: string;
}

export interface BusinessSettings {
  business_name: string | null;
  business_address: string | null;
  business_phone: string | null;
  business_email: string | null;
  gstin: string | null;
  upi_id: string | null;
  upi_payee_name: string | null;
  invoice_prefix: string;
  invoice_footer: string | null;
  invoice_terms: string | null;
  // Enhanced template settings
  default_template?: string;
  business_logo?: string;
  business_state?: string;
  business_state_code?: string;
  bank_name?: string;
  bank_account?: string;
  bank_ifsc?: string;
  bank_branch?: string;
  show_logo?: boolean | string;
  show_bank_details?: boolean | string;
  show_upi_qr?: boolean | string;
  show_signature?: boolean | string;
  signature_image?: string;
  signature_name?: string;
  cgst_rate?: string | number;
  sgst_rate?: string | number;
}

export interface BusinessSettingsUpdate {
  business_name?: string;
  business_address?: string;
  business_phone?: string;
  business_email?: string;
  gstin?: string;
  upi_id?: string;
  upi_payee_name?: string;
  invoice_prefix?: string;
  invoice_footer?: string;
  invoice_terms?: string;
  // Enhanced template settings
  default_template?: string;
  business_logo?: string;
  business_state?: string;
  business_state_code?: string;
  bank_name?: string;
  bank_account?: string;
  bank_ifsc?: string;
  bank_branch?: string;
  show_logo?: boolean;
  show_bank_details?: boolean;
  show_upi_qr?: boolean;
  show_signature?: boolean;
  signature_image?: string;
  signature_name?: string;
  cgst_rate?: number;
  sgst_rate?: number;
}

export interface InvoiceTemplate {
  id: number;
  name: string;
  description: string | null;
  template_type: string;
  primary_color: string;
  secondary_color: string;
  is_active: boolean;
}

// ============================================================================
// SERVICE FUNCTIONS
// ============================================================================

const getAuthHeader = () => {
  const token = localStorage.getItem('user_token');
  return { Authorization: `Bearer ${token}` };
};

// Business Settings
export const getBusinessSettings = async (): Promise<BusinessSettings> => {
  const response = await client.get('/api/v1/invoices/settings', { headers: getAuthHeader() });
  return response.data;
};

export const updateBusinessSettings = async (data: BusinessSettingsUpdate): Promise<BusinessSettings> => {
  const response = await client.put('/api/v1/invoices/settings', data, { headers: getAuthHeader() });
  return response.data;
};

// Invoices CRUD
export const createInvoice = async (data: InvoiceCreate): Promise<Invoice> => {
  const response = await client.post('/api/v1/invoices/', data, { headers: getAuthHeader() });
  return response.data;
};

export const getInvoices = async (filters?: {
  invoice_type?: string;
  payment_status?: string;
  khata_customer_id?: number;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}): Promise<Invoice[]> => {
  const params = new URLSearchParams();
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined) params.append(key, String(value));
    });
  }
  
  const response = await client.get(`/api/v1/invoices/?${params.toString()}`, { headers: getAuthHeader() });
  return response.data;
};

export const getInvoice = async (id: number): Promise<Invoice> => {
  const response = await client.get(`/api/v1/invoices/${id}`, { headers: getAuthHeader() });
  return response.data;
};

// Download PDF with template selection
export const downloadInvoicePDF = async (id: number, template: string = 'classic'): Promise<Blob> => {
  const response = await client.get(`/api/v1/invoices/${id}/pdf?template=${template}`, {
    headers: getAuthHeader(),
    responseType: 'blob'
  });
  return response.data;
};

// Get available templates
export const getInvoiceTemplates = async (): Promise<InvoiceTemplate[]> => {
  const response = await client.get('/api/v1/invoices/templates', { headers: getAuthHeader() });
  return response.data.templates || [];
};

// Record payment on invoice
export const recordInvoicePayment = async (
  invoiceId: number,
  amount: number,
  paymentMode = 'cash'
): Promise<{ message: string; total_paid: number; balance_due: number; status: string }> => {
  const response = await client.post(
    `/api/v1/invoices/${invoiceId}/pay?amount=${amount}&payment_mode=${paymentMode}`,
    {},
    { headers: getAuthHeader() }
  );
  return response.data;
};

// Get UPI QR Code
export const getInvoiceUPIQR = async (id: number): Promise<Blob> => {
  const response = await client.get(`/api/v1/invoices/${id}/upi-qr`, {
    headers: getAuthHeader(),
    responseType: 'blob'
  });
  return response.data;
};

export default {
  getBusinessSettings,
  updateBusinessSettings,
  createInvoice,
  getInvoices,
  getInvoice,
  downloadInvoicePDF,
  getInvoiceTemplates,
  recordInvoicePayment,
  getInvoiceUPIQR
};
