import client from '../api/client';

// ============================================================================
// TYPES
// ============================================================================

export interface B2BClient {
  id: number;
  name: string;
  contact_person: string | null;
  phone: string;
  email: string | null;
  gstin: string | null;
  address: string | null;
  credit_limit: number;
  current_balance: number;
  price_tier: 'gold' | 'silver' | 'standard';
  is_active: boolean;
  created_at: string;
  balance_status: 'clear' | 'normal' | 'warning' | 'over_limit';
}

export interface B2BClientCreate {
  name: string;
  contact_person?: string;
  phone: string;
  email?: string;
  gstin?: string;
  address?: string;
  credit_limit?: number;
  price_tier?: 'gold' | 'silver' | 'standard';
  notes?: string;
}

export interface B2BClientUpdate {
  name?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  address?: string;
  credit_limit?: number;
  price_tier?: 'gold' | 'silver' | 'standard';
  notes?: string;
  is_active?: boolean;
}

export interface KhataTransaction {
  id: number;
  type: 'SALE' | 'PAYMENT' | 'PURCHASE' | 'PAYMENT_OUT';
  amount: number;
  running_balance: number;
  related_order_id: number | null;
  payment_mode: string | null;
  payment_reference: string | null;
  notes: string | null;
  created_at: string;
  created_by_name: string | null;
}

export interface B2BOrderItem {
  id: number;
  product_id: number;
  product_name: string;
  sku: string;
  quantity: number;
  unit_price: number;
  unit_cost: number | null;
  line_total: number;
  margin_percent: number | null;
}

export interface B2BOrder {
  id: number;
  client_id: number;
  client_name: string;
  order_date: string;
  total_amount: number;
  total_cost: number;
  status: string;
  payment_status: string;
  amount_paid: number;
  notes: string | null;
  items: B2BOrderItem[];
}

export interface B2BOrderItemCreate {
  product_id: number;
  quantity: number;
  unit_price: number;
}

export interface B2BOrderCreate {
  client_id: number;
  items: B2BOrderItemCreate[];
  notes?: string;
}

export interface RecordPaymentRequest {
  client_id: number;
  amount: number;
  payment_mode: 'cash' | 'upi' | 'cheque' | 'bank_transfer';
  payment_reference?: string;
  notes?: string;
}

export interface B2BDashboard {
  total_to_collect: number;
  clients_over_limit: number;
  active_clients: number;
  net_outstanding: number;
  top_debtors: B2BClient[];
}

export interface FrequentItem {
  product_id: number;
  product_name: string;
  sku: string;
  last_sold_price: number;
  last_sold_date: string;
  total_quantity_sold: number;
  order_count: number;
  current_stock: number;
  standard_price: number;
}

export interface LastPriceInfo {
  product_id: number;
  product_name: string;
  last_sold_price: number | null;
  standard_price: number;
  unit_cost: number;
  suggested_margin: number;
}

export interface WhatsAppMessage {
  phone: string;
  clean_phone: string;
  message: string;
  whatsapp_url: string;
  current_balance: number;
}

export interface EmailReminderData {
  email: string;
  subject: string;
  body: string;
  mailto_url: string;
  current_balance: number;
}

export interface B2BSetting {
  value: string;
  description: string;
}

export interface B2BSettings {
  [key: string]: B2BSetting;
}

// --- Reverse Flow Interfaces ---

export interface B2BPurchaseItemCreate {
  product_id: number;
  quantity: number;
  unit_cost: number;
}

export interface B2BPurchaseCreate {
  client_id: number;
  items: B2BPurchaseItemCreate[];
  reference_number?: string;
  notes?: string;
  purchase_date?: string; // ISO string
}

export interface RecordPaymentOutRequest {
  client_id: number;
  amount: number;
  payment_mode: 'cash' | 'upi' | 'cheque' | 'bank_transfer';
  payment_reference?: string;
  notes?: string;
}

// ============================================================================
// HELPER
// ============================================================================

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('user_token')}` }
});

// ============================================================================
// API SERVICE
// ============================================================================

export const b2bService = {
  // --- Dashboard ---
  getDashboard: async (): Promise<B2BDashboard> => {
    const response = await client.get('/api/v1/b2b/dashboard', getAuthHeaders());
    return response.data;
  },

  // --- Client CRUD ---
  getClients: async (search?: string, activeOnly: boolean = true, sortBy: string = 'name'): Promise<B2BClient[]> => {
    const params: any = { active_only: activeOnly, sort_by: sortBy };
    if (search) params.search = search;
    const response = await client.get('/api/v1/b2b/clients', { ...getAuthHeaders(), params });
    return response.data;
  },

  getClient: async (clientId: number): Promise<B2BClient> => {
    const response = await client.get(`/api/v1/b2b/clients/${clientId}`, getAuthHeaders());
    return response.data;
  },

  createClient: async (data: B2BClientCreate): Promise<B2BClient> => {
    const response = await client.post('/api/v1/b2b/clients', data, getAuthHeaders());
    return response.data;
  },

  updateClient: async (clientId: number, data: B2BClientUpdate): Promise<B2BClient> => {
    const response = await client.put(`/api/v1/b2b/clients/${clientId}`, data, getAuthHeaders());
    return response.data;
  },

  // --- Khata/Ledger ---
  getLedger: async (clientId: number, limit: number = 50, offset: number = 0): Promise<KhataTransaction[]> => {
    const response = await client.get(`/api/v1/b2b/clients/${clientId}/ledger`, {
      ...getAuthHeaders(),
      params: { limit, offset }
    });
    return response.data;
  },

  // --- Orders ---
  createOrder: async (data: B2BOrderCreate): Promise<B2BOrder> => {
    const response = await client.post('/api/v1/b2b/orders', data, getAuthHeaders());
    return response.data;
  },

  getOrder: async (orderId: number): Promise<B2BOrder> => {
    const response = await client.get(`/api/v1/b2b/orders/${orderId}`, getAuthHeaders());
    return response.data;
  },

  getClientOrders: async (clientId: number, limit: number = 20): Promise<B2BOrder[]> => {
    const response = await client.get(`/api/v1/b2b/clients/${clientId}/orders`, {
      ...getAuthHeaders(),
      params: { limit }
    });
    return response.data;
  },

  // --- Payments ---
  recordPayment: async (data: RecordPaymentRequest): Promise<KhataTransaction> => {
    const response = await client.post('/api/v1/b2b/payments', data, getAuthHeaders());
    return response.data;
  },

  // --- Smart Pricing ---
  getFrequentItems: async (clientId: number, limit: number = 5): Promise<FrequentItem[]> => {
    const response = await client.get(`/api/v1/b2b/clients/${clientId}/frequent-items`, {
      ...getAuthHeaders(),
      params: { limit }
    });
    return response.data;
  },

  getLastPrice: async (clientId: number, productId: number): Promise<LastPriceInfo> => {
    const response = await client.get(`/api/v1/b2b/clients/${clientId}/last-price/${productId}`, getAuthHeaders());
    return response.data;
  },

  // --- Statement & WhatsApp ---
  downloadStatement: async (clientId: number, days: number = 30): Promise<void> => {
    const response = await client.get(`/api/v1/b2b/clients/${clientId}/statement`, {
      ...getAuthHeaders(),
      params: { days },
      responseType: 'blob'
    });

    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Statement_${clientId}_${new Date().toISOString().split('T')[0]}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  },

  getWhatsAppMessage: async (clientId: number): Promise<WhatsAppMessage> => {
    const response = await client.get(`/api/v1/b2b/clients/${clientId}/whatsapp-message`, getAuthHeaders());
    return response.data;
  },

  getEmailReminder: async (clientId: number): Promise<EmailReminderData> => {
    const clientData = await b2bService.getClient(clientId);
    const subject = `Payment Reminder - Outstanding Balance ₹${clientData.current_balance.toLocaleString()}`;
    const body = `Dear ${clientData.contact_person || clientData.name},

This is a friendly reminder regarding your outstanding balance with us.

Current Outstanding: ₹${clientData.current_balance.toLocaleString()}
Credit Limit: ₹${clientData.credit_limit.toLocaleString()}

Please arrange for the payment at your earliest convenience.

For any queries, feel free to contact us.

Thank you for your business!

Best regards`;

    const mailtoUrl = `mailto:${clientData.email || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    return {
      email: clientData.email || '',
      subject,
      body,
      mailto_url: mailtoUrl,
      current_balance: clientData.current_balance
    };
  },

  sendEmailReminder: async (clientId: number, toEmail: string, subject: string, body: string): Promise<{ success: boolean; message: string }> => {
    const response = await client.post(`/api/v1/b2b/clients/${clientId}/send-email`, {
      to_email: toEmail,
      subject,
      body
    }, getAuthHeaders());
    return response.data;
  },

  // --- Settings ---
  getSettings: async (): Promise<B2BSettings> => {
    const response = await client.get('/api/v1/b2b/settings', getAuthHeaders());
    return response.data;
  },

  updateSetting: async (key: string, value: string): Promise<{ key: string; value: string }> => {
    const response = await client.put(`/api/v1/b2b/settings/${key}`, null, {
      ...getAuthHeaders(),
      params: { value }
    });
    return response.data;
  },

  // --- Reverse Flow API Functions ---

  createB2BPurchase: async (data: B2BPurchaseCreate) => {
    const token = localStorage.getItem('user_token');
    const response = await client.post('/api/v1/b2b/purchases', data, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  },

  recordOutgoingPayment: async (data: RecordPaymentOutRequest) => {
    const token = localStorage.getItem('user_token');
    const response = await client.post('/api/v1/b2b/payments/out', data, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  }
};
