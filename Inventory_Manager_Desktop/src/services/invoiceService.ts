import client from '../api/client';

export interface InvoiceSettings {
  // Company Info
  invoice_logo?: string;
  invoice_company_name?: string;
  invoice_address?: string;
  invoice_phone?: string;
  invoice_email?: string;
  invoice_website?: string;
  invoice_gstin?: string;
  invoice_pan?: string;

  // Bank Details
  invoice_bank_name?: string;
  invoice_account_no?: string;
  invoice_ifsc?: string;

  // Signature
  invoice_signature?: string;
  invoice_signatory_name?: string;

  // Appearance
  invoice_primary_color?: string;
  invoice_accent_color?: string;

  // GST Rates (India-specific)
  invoice_cgst_rate?: string;
  invoice_sgst_rate?: string;

  // Discount
  invoice_discount_enabled?: string;
  invoice_discount_percent?: string;

  // Display Options
  invoice_show_ship_to?: string;
  invoice_show_due_date?: string;

  // Invoice Customization
  invoice_prefix?: string;
  invoice_place_of_supply?: string;

  // Terms
  invoice_notes?: string;
  invoice_terms?: string;

  // Legacy business settings (read-only)
  business_name?: string;
  business_phone?: string;
  business_email?: string;

  [key: string]: string | undefined;
}

const getAuthHeader = () => {
  const token = localStorage.getItem('user_token');
  return { Authorization: `Bearer ${token}` };
};

/**
 * Get all invoice settings
 */
export const getInvoiceSettings = async (): Promise<InvoiceSettings> => {
  const response = await client.get('/api/v1/invoices/settings', {
    headers: getAuthHeader()
  });
  return response.data.settings;
};

/**
 * Update invoice settings
 */
export const updateInvoiceSettings = async (settings: Record<string, string>): Promise<void> => {
  await client.put('/api/v1/invoices/settings',
    { settings },
    { headers: getAuthHeader() }
  );
};

/**
 * Generate invoice PDF for an order
 * Returns a blob URL for the PDF
 */
export const generateInvoicePDF = async (orderId: number): Promise<string> => {
  const response = await client.get(`/api/v1/invoices/generate/${orderId}`, {
    headers: getAuthHeader(),
    responseType: 'blob'
  });

  const blob = new Blob([response.data], { type: 'application/pdf' });
  return URL.createObjectURL(blob);
};

/**
 * Open invoice PDF in new tab
 */
/**
 * Open invoice PDF in new tab
 * improved to handle popup blockers
 */
export const openInvoicePDF = async (orderId: number): Promise<void> => {
  // Open window immediately to avoid popup blockers
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
    if (newWindow) {
      newWindow.close();
    }
    alert("Failed to generate invoice PDF. Please try again.");
  }
};


/**
 * Preview invoice with current settings
 */
export const previewInvoiceSettings = async (settings: InvoiceSettings): Promise<string> => {
  const response = await client.post('/api/v1/invoices/preview',
    { settings },
    {
      headers: getAuthHeader(),
      responseType: 'blob'
    }
  );

  const blob = new Blob([response.data], { type: 'application/pdf' });
  return URL.createObjectURL(blob);
};

// --- Purchase Order Invoices ---

export const generatePurchaseInvoicePDF = async (orderId: number): Promise<string> => {
  const response = await client.get(`/api/v1/invoices/generate/purchase/${orderId}`, {
    headers: getAuthHeader(),
    responseType: 'blob'
  });

  const blob = new Blob([response.data], { type: 'application/pdf' });
  return URL.createObjectURL(blob);
};

export const openPurchaseInvoicePDF = async (orderId: number): Promise<void> => {
  // Open window immediately to avoid popup blockers
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
    if (newWindow) {
      newWindow.close();
    }
    alert("Failed to generate PDF. Please try again.");
  }
};

// --- B2B Invoices ---

export const generateB2BInvoicePDF = async (orderId: number): Promise<string> => {
  const response = await client.get(`/api/v1/invoices/generate/b2b/${orderId}`, {
    headers: getAuthHeader(),
    responseType: 'blob'
  });

  const blob = new Blob([response.data], { type: 'application/pdf' });
  return URL.createObjectURL(blob);
};

export const openB2BInvoicePDF = async (orderId: number): Promise<void> => {
  // Open window immediately to avoid popup blockers
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
    if (newWindow) {
      newWindow.close();
    }
    alert("Failed to generate invoice PDF. Please try again.");
  }
};
