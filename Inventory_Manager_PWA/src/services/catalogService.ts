import client from '../api/client';

export interface Location {
  id: number;
  name: string;
  type: string;
  description?: string;
  created_at?: string;
}

export interface Supplier {
  id: number;
  name: string;
  contact_person?: string;
  phone_number?: string;
  email?: string;
  location?: string;
}

export interface ProductSupplierLink {
  id: number;
  product_id: number;
  product_name: string;
  supplier_id: number;
  supplier_name: string;
  supply_price: number;
  is_preferred: boolean;
  supplier_sku?: string;
}

export const getLocations = async (): Promise<Location[]> => {
  const response = await client.get('/api/v1/locations/');
  return response.data;
};

export const getSuppliers = async (): Promise<Supplier[]> => {
  const response = await client.get('/api/v1/suppliers/');
  return response.data;
};

export const getProductSupplierLinks = async (): Promise<ProductSupplierLink[]> => {
  const response = await client.get('/api/v1/suppliers/product-links');
  return response.data;
};

export interface CreateLocationData {
  name: string;
  type: string;
  description?: string;
  location_type?: string;
}

export const createLocation = async (data: CreateLocationData): Promise<Location> => {
  const payload = {
    name: data.name,
    description: data.description,
    location_type: data.location_type || data.type
  };
  const token = localStorage.getItem('user_token');
  const response = await client.post('/api/v1/locations/', payload, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

export interface CreateSupplierData {
  name: string;
  location?: string;
  contact_person?: string;
  phone_number?: string;
  email?: string;
}

export const createSupplier = async (data: CreateSupplierData): Promise<Supplier> => {
  const token = localStorage.getItem('user_token');
  const response = await client.post('/api/v1/suppliers/', data, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

export interface CreateProductSupplierLinkData {
  product_id: number;
  supplier_id: number;
  supply_price: number;
  supplier_sku?: string;
  is_preferred?: boolean;
}

export const createProductSupplierLink = async (data: CreateProductSupplierLinkData): Promise<ProductSupplierLink> => {
  const token = localStorage.getItem('user_token');
  const response = await client.post('/api/v1/suppliers/product-links', data, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

export const deleteLocation = async (id: number): Promise<void> => {
  const token = localStorage.getItem('user_token');
  await client.delete(`/api/v1/locations/${id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
};

export const deleteSupplier = async (id: number): Promise<void> => {
  const token = localStorage.getItem('user_token');
  await client.delete(`/api/v1/suppliers/${id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
};

export const deleteProductSupplierLink = async (id: number): Promise<void> => {
  const token = localStorage.getItem('user_token');
  await client.delete(`/api/v1/suppliers/product-links/${id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
};

export const setProductSupplierPreferred = async (id: number): Promise<void> => {
  const token = localStorage.getItem('user_token');
  await client.put(`/api/v1/suppliers/product-links/${id}/preferred`, {}, {
    headers: { Authorization: `Bearer ${token}` }
  });
};

export interface ProductSupplier {
  id: number;
  name: string;
  cost: number;
  is_preferred: boolean;
  link_id: number;
}

export const getSuppliersForProduct = async (productId: number): Promise<ProductSupplier[]> => {
  const token = localStorage.getItem('user_token');
  const response = await client.get(`/api/v1/suppliers/product/${productId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};
