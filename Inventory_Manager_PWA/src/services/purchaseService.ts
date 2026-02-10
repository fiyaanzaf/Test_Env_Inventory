import client from '../api/client';

export interface POItem {
  id?: number;
  product_id: number;
  product_name?: string;
  sku?: string;
  quantity: number;
  unit_cost: number;
}

export interface PurchaseOrder {
  id: number;
  supplier_id: number;
  supplier_name: string;
  status: 'draft' | 'placed' | 'received' | 'cancelled';
  total_amount: number;
  created_at: string;
  item_count: number;
}

export interface POCreatePayload {
  supplier_id: number;
  expected_date?: string;
  notes?: string;
  items: {
    product_id: number;
    quantity: number;
    unit_cost: number;
  }[];
}

export interface PurchaseOrderDetail {
  id: number;
  supplier_id: number;
  supplier: string;
  status: string;
  total: number;
  date: string;
  notes: string;
  items: {
    id: number;
    name: string;
    sku: string;
    qty: number;
    cost: number;
    subtotal: number;
    product_id: number;
  }[];
}

export interface POItemCreate {
  product_id: number;
  quantity: number;
  unit_cost: number;
}

export const getPurchaseOrders = async (): Promise<PurchaseOrder[]> => {
  const token = localStorage.getItem('user_token');
  const response = await client.get<PurchaseOrder[]>('/api/v1/purchases', {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

export const createPurchaseOrder = async (data: POCreatePayload) => {
  const token = localStorage.getItem('user_token');
  const response = await client.post('/api/v1/purchases', data, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

export const getPurchaseOrderDetails = async (poId: number): Promise<PurchaseOrderDetail> => {
  const token = localStorage.getItem('user_token');
  const response = await client.get<PurchaseOrderDetail>(`/api/v1/purchases/${poId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

export const updatePOStatus = async (poId: number, status: string) => {
  const token = localStorage.getItem('user_token');
  const response = await client.put(`/api/v1/purchases/${poId}/status`,
    { status },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
};

export const getProductsBySupplier = async (supplierId: number) => {
  const token = localStorage.getItem('user_token');
  const response = await client.get('/api/v1/products', {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data.filter((p: any) => p.supplier_id === supplierId);
};

export const addItemToPurchaseOrder = async (poId: number, payload: { items: POItemCreate[] }) => {
  const token = localStorage.getItem('user_token');
  const response = await client.post(`/api/v1/purchases/${poId}/items`, payload, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

export const receivePurchaseOrder = async (poId: number, warehouseId: number) => {
  const token = localStorage.getItem('user_token');
  const response = await client.post(`/api/v1/purchases/${poId}/receive`,
    { warehouse_id: warehouseId },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
};

export const removeItemFromPO = async (poId: number, itemId: number) => {
  const token = localStorage.getItem('user_token');
  const response = await client.delete(`/api/v1/purchases/${poId}/items/${itemId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};
