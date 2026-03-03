import client from '../api/client';

export interface Product {
  id: number;
  sku: string;
  name: string;
  selling_price: number;
  average_cost: number;
  supplier_id: number;
  supplier_name?: string;
  category: string | null;
  unit_of_measure: string | null;
  barcode: string | null;
  created_at: string;
  total_quantity: number;
  low_stock_threshold: number;
  shelf_restock_threshold: number;
  variant_count: number;
}

export interface CreateProductData {
  sku: string;
  name: string;
  selling_price: number;
  average_cost: number;
  supplier_id: number;
  category: string;
  unit_of_measure: string;
  barcode?: string;
  low_stock_threshold: number;
  shelf_restock_threshold: number;
}

export const getAllProducts = async (): Promise<Product[]> => {
  try {
    const token = localStorage.getItem('user_token');
    const response = await client.get('/api/v1/products', {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching products:', error);
    throw error;
  }
};

export const createProduct = async (data: CreateProductData): Promise<Product> => {
  try {
    const token = localStorage.getItem('user_token');
    const response = await client.post('/api/v1/products', data, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    console.error('Error creating product:', error);
    throw error;
  }
};

export const updateProduct = async (id: number, data: CreateProductData): Promise<Product> => {
  try {
    const token = localStorage.getItem('user_token');
    const response = await client.put(`/api/v1/products/${id}`, data, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    console.error('Error updating product:', error);
    throw error;
  }
};

export const deleteProduct = async (id: number): Promise<void> => {
  try {
    const token = localStorage.getItem('user_token');
    await client.delete(`/api/v1/products/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    throw error;
  }
};
