import client from '../api/client';

export interface InventoryValuation {
  total_valuation: number;
  total_items: number;
  distinct_products: number;
}

export interface TopSeller {
  product_id: number;
  sku: string;
  product_name: string;
  total_units_sold: number;
  total_revenue: number;
}

export interface WriteOffSummary {
  reason: string;
  total_count: number;
  total_value_lost: number;
}

export interface MarketBasketRule {
  if_buy: string[];
  likely_to_buy: string[];
  confidence: number;
  lift: number;
}

export interface ABCItem {
  product_name: string;
  sku: string;
  revenue: number;
  category_rank: 'A' | 'B' | 'C';
}

export interface CustomerSegment {
  customer_phone: string;
  customer_name: string;
  segment_name: string;
  recency_days: number;
  frequency_count: number;
  monetary_value: number;
}

export interface SalesSummary {
  total_sales_value: number;
  total_orders: number;
  start_date: string;
  end_date: string;
}

export interface SalesTrend {
  date: string;
  total_sales: number;
}

export interface ActivityItem {
  id: number;
  type: 'sale' | 'transfer' | 'receive' | 'bulk_receive' | 'write_off';
  description: string;
  timestamp: string;
  quantity?: number;
  username?: string;
}

export interface NearingExpiryItem {
  product_id: number;
  product_name: string;
  sku: string;
  batch_id: number;
  batch_code: string;
  location_name: string;
  quantity: number;
  expiry_date: string;
}

export interface AuditLogEntry {
  id: number;
  user_id?: number;
  username?: string;
  action: string;
  target_table?: string;
  target_id?: number;
  ip_address?: string;
  timestamp: string;
  details?: any;
}

export const getInventoryValuation = async (): Promise<InventoryValuation> => {
  const token = localStorage.getItem('user_token');
  const response = await client.get('/api/v1/analytics/inventory_valuation', {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

export const getTopSellers = async (startDate?: string, endDate?: string): Promise<TopSeller[]> => {
  const token = localStorage.getItem('user_token');
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  const response = await client.get(`/api/v1/analytics/top_selling_products?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

export const getWriteOffSummary = async (startDate?: string, endDate?: string): Promise<WriteOffSummary[]> => {
  const token = localStorage.getItem('user_token');
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  const response = await client.get(`/api/v1/analytics/write_off_summary?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

export const getSalesSummary = async (startDate?: string, endDate?: string): Promise<SalesSummary> => {
  const token = localStorage.getItem('user_token');
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  const response = await client.get(`/api/v1/analytics/sales_summary?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

export const getSalesTrends = async (startDate?: string, endDate?: string): Promise<SalesTrend[]> => {
  const token = localStorage.getItem('user_token');
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  const response = await client.get(`/api/v1/analytics/sales_trends?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

export const getNearingExpiryReport = async (daysOut: number = 30): Promise<NearingExpiryItem[]> => {
  const token = localStorage.getItem('user_token');
  const response = await client.get(`/api/v1/analytics/nearing_expiry?days_out=${daysOut}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

export const getGlobalActivity = async (limit: number = 10): Promise<ActivityItem[]> => {
  const token = localStorage.getItem('user_token');
  const response = await client.get(`/api/v1/analytics/global_activity?limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

export const getAuditLogs = async (limit: number = 100): Promise<AuditLogEntry[]> => {
  const token = localStorage.getItem('user_token');
  const response = await client.get(`/api/v1/analytics/audit_logs?limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

export const getMarketBasketAnalysis = async (startDate?: string, endDate?: string): Promise<MarketBasketRule[]> => {
  const token = localStorage.getItem('user_token');
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  const response = await client.get(`/api/v1/analysis/market_basket?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

export const getABCAnalysis = async (startDate?: string, endDate?: string): Promise<ABCItem[]> => {
  const token = localStorage.getItem('user_token');
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  const response = await client.get(`/api/v1/analysis/abc_classification?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

export const getCustomerSegments = async (startDate?: string, endDate?: string): Promise<CustomerSegment[]> => {
  const token = localStorage.getItem('user_token');
  const params = new URLSearchParams();
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  const response = await client.get(`/api/v1/analysis/customer_segments?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};
