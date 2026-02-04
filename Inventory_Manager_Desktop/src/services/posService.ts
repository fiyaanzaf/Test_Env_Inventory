import client from '../api/client';

export interface POSProduct {
  id: number;
  name: string;
  sku: string;
  price: number;
  stock_quantity: number; // Calculated from batches
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
  khata_customer_id?: number;  // Required when payment_method is 'credit'
  items: {
    product_id: number;
    quantity: number;
    unit_price: number;
  }[];
}

// Fetch products with their aggregated stock count
export const getPOSProducts = async (): Promise<POSProduct[]> => {
  // We reuse the products endpoint, but in a real app, you might want a specific 
  // endpoint that aggregates batch quantities efficiently.
  // For now, we assume /products returns a list that includes total quantity.
  const token = localStorage.getItem('user_token');
  const response = await client.get('/api/v1/products', {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data.map((p: any) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    price: p.selling_price || 0, // Backend uses 'selling_price', not 'price'
    stock_quantity: p.total_quantity || 0, // Ensure your backend sends this or calculate it
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
  // Assuming a future endpoint, or you can search users
  // For now, we return null or mock it
  return null;
};
