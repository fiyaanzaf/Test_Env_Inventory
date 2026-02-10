import client from '../api/client';

export interface KhataCustomer {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  credit_limit: number;
  current_balance: number;
  is_active: boolean;
  is_blocked: boolean;
  block_reason: string | null;
  balance_status: 'clear' | 'normal' | 'warning' | 'over_limit';
  limit_used_percent: number;
  created_at: string;
}

export interface KhataCustomerCreate {
  name: string;
  phone: string;
  email?: string;
  address?: string;
  credit_limit?: number;
  notes?: string;
}

export interface KhataCustomerUpdate {
  name?: string;
  email?: string;
  address?: string;
  credit_limit?: number;
  notes?: string;
  is_active?: boolean;
}

export interface KhataTransaction {
  id: number;
  type: 'CREDIT_SALE' | 'PAYMENT' | 'ADJUSTMENT';
  amount: number;
  running_balance: number;
  sales_order_id: number | null;
  invoice_id: number | null;
  payment_mode: string | null;
  payment_reference: string | null;
  notes: string | null;
  created_at: string;
  created_by_name: string | null;
}

export interface KhataDashboard {
  total_credit_outstanding: number;
  customers_with_balance: number;
  customers_over_limit: number;
  customers_near_limit: number;
  total_customers: number;
}

export interface RecordPaymentRequest {
  customer_id: number;
  amount: number;
  payment_mode?: string;
  payment_reference?: string;
  upi_transaction_id?: string;
  notes?: string;
}

export interface CustomerLookupResult {
  id: number;
  name: string;
  phone: string;
  current_balance: number;
  credit_limit: number;
  available_credit: number;
  is_blocked: boolean;
  can_purchase: boolean;
  warning_message: string | null;
}

export interface WhatsAppReminder {
  phone: string;
  message: string;
  balance: number;
  upi_link: string | null;
}

const getAuthHeader = () => {
  const token = localStorage.getItem('user_token');
  return { Authorization: `Bearer ${token}` };
};

export const getKhataDashboard = async (): Promise<KhataDashboard> => {
  const response = await client.get('/api/v1/khata/dashboard', { headers: getAuthHeader() });
  return response.data;
};

export const getKhataCustomers = async (
  search?: string,
  status?: 'all' | 'with_balance' | 'over_limit' | 'blocked'
): Promise<KhataCustomer[]> => {
  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (status && status !== 'all') params.append('status', status);
  const response = await client.get(`/api/v1/khata/customers?${params.toString()}`, { headers: getAuthHeader() });
  return response.data;
};

export const getKhataCustomer = async (id: number): Promise<KhataCustomer> => {
  const response = await client.get(`/api/v1/khata/customers/${id}`, { headers: getAuthHeader() });
  return response.data;
};

export const createKhataCustomer = async (data: KhataCustomerCreate): Promise<KhataCustomer> => {
  const response = await client.post('/api/v1/khata/customers', data, { headers: getAuthHeader() });
  return response.data;
};

export const updateKhataCustomer = async (id: number, data: KhataCustomerUpdate): Promise<KhataCustomer> => {
  const response = await client.put(`/api/v1/khata/customers/${id}`, data, { headers: getAuthHeader() });
  return response.data;
};

export const lookupCustomerByPhone = async (phone: string): Promise<CustomerLookupResult | null> => {
  try {
    const response = await client.get(`/api/v1/khata/customers/lookup?phone=${phone}`, { headers: getAuthHeader() });
    return response.data;
  } catch {
    return null;
  }
};

export const getCustomerTransactions = async (customerId: number, limit = 50): Promise<KhataTransaction[]> => {
  const response = await client.get(`/api/v1/khata/customers/${customerId}/transactions?limit=${limit}`, { headers: getAuthHeader() });
  return response.data;
};

export const recordPayment = async (data: RecordPaymentRequest): Promise<KhataTransaction> => {
  const response = await client.post('/api/v1/khata/payments', data, { headers: getAuthHeader() });
  return response.data;
};

export const unblockCustomer = async (customerId: number): Promise<{ message: string }> => {
  const response = await client.post(`/api/v1/khata/customers/${customerId}/unblock`, {}, { headers: getAuthHeader() });
  return response.data;
};

export const getWhatsAppReminder = async (customerId: number): Promise<WhatsAppReminder> => {
  const response = await client.get(`/api/v1/khata/customers/${customerId}/whatsapp-reminder`, { headers: getAuthHeader() });
  return response.data;
};

export const getTopDebtors = async (limit = 10): Promise<KhataCustomer[]> => {
  const response = await client.get(`/api/v1/khata/top-debtors?limit=${limit}`, { headers: getAuthHeader() });
  return response.data;
};

export default {
  getKhataDashboard,
  getKhataCustomers,
  getKhataCustomer,
  createKhataCustomer,
  updateKhataCustomer,
  lookupCustomerByPhone,
  getCustomerTransactions,
  recordPayment,
  unblockCustomer,
  getWhatsAppReminder,
  getTopDebtors
};
