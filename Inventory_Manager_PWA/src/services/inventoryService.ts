import client from '../api/client';

export interface Location {
  id: number;
  name: string;
  type: 'warehouse' | 'store' | 'external';
}

export interface ExpiryReportItem {
  batch_id: number;
  product_name: string;
  sku?: string;
  location: string;
  supplier: string;
  batch_code: string;
  expiry_date: string;
  days_left: number;
  quantity: number;
}

export interface ReceiveStockPayload {
  product_id: number;
  quantity: number;
  location_id: number;
  unit_cost: number;
  expiry_date?: string;
  batch_code?: string;
}

export interface TransferStockPayload {
  product_id: number;
  quantity: number;
  from_location_id: number;
  to_location_id: number;
  batch_code?: string;
}

export interface WriteOffPayload {
  batch_id: number;
  quantity_to_remove: number;
  reason: string;
}

export interface BatchInfo {
  id: number;
  product_id: number;
  location_id: number;
  location_name: string;
  location_type: string;
  batch_code: string;
  quantity: number;
  expiry_date: string;
  received_at: string;
  product_name?: string;
  sku?: string;
}

export interface ProductStockInfo {
  product_id: number;
  product_name: string;
  sku: string;
  total_quantity: number;
  batches: BatchInfo[];
}

export interface TransferResponse {
  status: string;
  message: string;
}

export interface WriteOffEvent {
  id: number;
  batch_id: number;
  product_name: string;
  sku: string;
  location_name: string;
  batch_code: string;
  quantity_removed: number;
  reason: string;
  write_off_date: string;
  performed_by: string;
}

export interface BulkItem {
  product_id: number;
  quantity: number;
  unit_cost?: number;
}

export const getLocations = async (): Promise<Location[]> => {
  const token = localStorage.getItem('user_token');
  const response = await client.get<Location[]>('/api/v1/inventory/locations', {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

export const receiveStock = async (data: ReceiveStockPayload): Promise<BatchInfo> => {
  const token = localStorage.getItem('user_token');
  const response = await client.post<BatchInfo>('/api/v1/inventory/receive', data, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

export const transferStock = async (data: TransferStockPayload): Promise<TransferResponse> => {
  const token = localStorage.getItem('user_token');
  const response = await client.post<TransferResponse>('/api/v1/inventory/transfer', data, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

export const getProductStock = async (productId: number): Promise<ProductStockInfo> => {
  const token = localStorage.getItem('user_token');
  const response = await client.get<ProductStockInfo>(`/api/v1/inventory/product/${productId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

export const writeOffStock = async (data: WriteOffPayload): Promise<BatchInfo> => {
  const token = localStorage.getItem('user_token');
  const response = await client.post<BatchInfo>('/api/v1/inventory/write_off', data, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

export const getWriteOffHistory = async (): Promise<WriteOffEvent[]> => {
  const token = localStorage.getItem('user_token');
  const response = await client.get<WriteOffEvent[]>('/api/v1/inventory/write_off_history', {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

export const bulkReceive = async (location_id: number, items: BulkItem[]) => {
  const token = localStorage.getItem('user_token');
  const response = await client.post('/api/v1/inventory/bulk/receive',
    { location_id, items },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
};

export const bulkTransfer = async (from_id: number, to_id: number, items: BulkItem[]) => {
  const token = localStorage.getItem('user_token');
  const response = await client.post('/api/v1/inventory/bulk/transfer',
    { from_location_id: from_id, to_location_id: to_id, items },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
};

export const getLowStockItems = async (threshold?: number) => {
  const token = localStorage.getItem('user_token');
  const params: any = { format: 'json' };
  if (threshold !== undefined) params.reorder_threshold = threshold;
  const response = await client.get('/api/v1/reports/low_stock_reorder', {
    params,
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

export const getExpiryReport = async (daysThreshold = 30): Promise<ExpiryReportItem[]> => {
  const token = localStorage.getItem('user_token');
  const response = await client.get(`/api/v1/reports/near_expiry`, {
    params: { days_threshold: daysThreshold, format: 'json' },
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};
