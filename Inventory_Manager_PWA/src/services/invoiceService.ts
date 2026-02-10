import client from '../api/client';

export interface InvoiceSettings {
  invoice_logo?: string;
  invoice_company_name?: string;
  invoice_address?: string;
  invoice_phone?: string;
  invoice_email?: string;
  invoice_website?: string;
  invoice_gstin?: string;
  invoice_pan?: string;
  invoice_bank_name?: string;
  invoice_account_no?: string;
  invoice_ifsc?: string;
  invoice_signature?: string;
  invoice_signatory_name?: string;
  invoice_primary_color?: string;
  invoice_accent_color?: string;
  invoice_cgst_rate?: string;
  invoice_sgst_rate?: string;
  invoice_discount_enabled?: string;
  invoice_discount_percent?: string;
  invoice_show_ship_to?: string;
  invoice_show_due_date?: string;
  invoice_prefix?: string;
  invoice_place_of_supply?: string;
  invoice_notes?: string;
  invoice_terms?: string;
  business_name?: string;
  business_phone?: string;
  business_email?: string;
  [key: string]: string | undefined;
}

const getAuthHeader = () => {
  const token = localStorage.getItem('user_token');
  return { Authorization: `Bearer ${token}` };
};

export const getInvoiceSettings = async (): Promise<InvoiceSettings> => {
  const response = await client.get('/api/v1/invoices/settings', {
    headers: getAuthHeader()
  });
  return response.data.settings;
};

export const updateInvoiceSettings = async (settings: Record<string, string>): Promise<void> => {
  await client.put('/api/v1/invoices/settings',
    { settings },
    { headers: getAuthHeader() }
  );
};

export const generateInvoicePDF = async (orderId: number): Promise<string> => {
  const response = await client.get(`/api/v1/invoices/generate/${orderId}`, {
    headers: getAuthHeader(),
    responseType: 'blob'
  });
  const blob = new Blob([response.data], { type: 'application/pdf' });
  return URL.createObjectURL(blob);
};

export const openInvoicePDF = async (orderId: number): Promise<void> => {
  const newWindow = window.open('', '_blank');
  if (newWindow) {
    newWindow.document.write('<html><head><title>Generating Invoice...</title></head><body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;"><div><h2>Generating Invoice PDF...</h2><p>Please wait...</p></div></body></html>');
  }
  try {
    const pdfUrl = await generateInvoicePDF(orderId);
    if (newWindow) {
      newWindow.location.href = pdfUrl;
    } else {
      window.open(pdfUrl, '_blank');
    }
  } catch (error) {
    console.error("Failed to open invoice:", error);
    if (newWindow) newWindow.close();
    alert("Failed to generate invoice PDF. Please try again.");
  }
};

export const previewInvoiceSettings = async (settings: InvoiceSettings): Promise<string> => {
  const response = await client.post('/api/v1/invoices/preview',
    { settings },
    { headers: getAuthHeader(), responseType: 'blob' }
  );
  const blob = new Blob([response.data], { type: 'application/pdf' });
  return URL.createObjectURL(blob);
};

export const generatePurchaseInvoicePDF = async (orderId: number): Promise<string> => {
  const response = await client.get(`/api/v1/invoices/generate/purchase/${orderId}`, {
    headers: getAuthHeader(),
    responseType: 'blob'
  });
  const blob = new Blob([response.data], { type: 'application/pdf' });
  return URL.createObjectURL(blob);
};

export const openPurchaseInvoicePDF = async (orderId: number): Promise<void> => {
  const newWindow = window.open('', '_blank');
  if (newWindow) {
    newWindow.document.write('<html><head><title>Generating Purchase Order...</title></head><body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;"><div><h2>Generating PDF...</h2><p>Please wait...</p></div></body></html>');
  }
  try {
    const pdfUrl = await generatePurchaseInvoicePDF(orderId);
    if (newWindow) {
      newWindow.location.href = pdfUrl;
    } else {
      window.open(pdfUrl, '_blank');
    }
  } catch (error) {
    console.error("Failed to open PO PDF:", error);
    if (newWindow) newWindow.close();
    alert("Failed to generate PDF. Please try again.");
  }
};

export const generateB2BInvoicePDF = async (orderId: number): Promise<string> => {
  const response = await client.get(`/api/v1/invoices/generate/b2b/${orderId}`, {
    headers: getAuthHeader(),
    responseType: 'blob'
  });
  const blob = new Blob([response.data], { type: 'application/pdf' });
  return URL.createObjectURL(blob);
};

export const openB2BInvoicePDF = async (orderId: number): Promise<void> => {
  const newWindow = window.open('', '_blank');
  if (newWindow) {
    newWindow.document.write('<html><head><title>Generating Invoice...</title></head><body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;"><div><h2>Generating Invoice PDF...</h2><p>Please wait...</p></div></body></html>');
  }
  try {
    const pdfUrl = await generateB2BInvoicePDF(orderId);
    if (newWindow) {
      newWindow.location.href = pdfUrl;
    } else {
      window.open(pdfUrl, '_blank');
    }
  } catch (error) {
    console.error("Failed to open B2B invoice:", error);
    if (newWindow) newWindow.close();
    alert("Failed to generate invoice PDF. Please try again.");
  }
};
