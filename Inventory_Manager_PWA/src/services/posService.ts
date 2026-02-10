import client from '../api/client';

export interface POSProduct {
  id: number;
  name: string;
  sku: string;
  price: number;
  stock_quantity: number;
  category?: string;
}

export interface CartItem extends POSProduct {
  cartQty: number;
}

export interface SalesOrderPayload {
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  sales_channel: 'in-store';
  payment_method?: 'cash' | 'card' | 'upi' | 'credit';
  payment_reference?: string | null;
  khata_customer_id?: number;
  items: {
    product_id: number;
    quantity: number;
    unit_price: number;
  }[];
}

export const getPOSProducts = async (): Promise<POSProduct[]> => {
  const token = localStorage.getItem('user_token');
  const response = await client.get('/api/v1/products', {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data.map((p: any) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    price: p.selling_price || 0,
    stock_quantity: p.total_quantity || 0,
    category: p.category
  }));
};

export const createSalesOrder = async (orderData: SalesOrderPayload) => {
  const token = localStorage.getItem('user_token');
  const response = await client.post('/api/v1/sales/orders', orderData, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

export const lookupCustomer = async (phone: string) => {
  return null;
};
