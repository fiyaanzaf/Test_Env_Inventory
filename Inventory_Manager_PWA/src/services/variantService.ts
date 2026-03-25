import client from '../api/client';

// --- Variant Interfaces ---

export interface Variant {
    id: number;
    product_id: number;
    variant_name: string;
    variant_sku: string | null;
    variant_barcode: string | null;
    selling_price: number | null;
    average_cost: number | null;
    unit_of_measure: string | null;
    is_active: boolean;
    created_at: string;
    total_quantity: number;
}

export interface CreateVariantData {
    variant_name: string;
    variant_sku?: string;
    variant_barcode?: string;
    selling_price?: number;
    average_cost?: number;
    unit_of_measure?: string;
}

export interface UpdateVariantData {
    variant_name?: string;
    variant_sku?: string;
    variant_barcode?: string;
    selling_price?: number;
    average_cost?: number;
    unit_of_measure?: string;
    is_active?: boolean;
}

// --- API Methods ---

const getToken = () => localStorage.getItem('user_token');
const authHeaders = () => ({ headers: { Authorization: `Bearer ${getToken()}` } });

export const getVariantsForProduct = async (productId: number): Promise<Variant[]> => {
    const response = await client.get(`/api/v1/variants/products/${productId}`, authHeaders());
    return response.data;
};

export const createVariant = async (productId: number, data: CreateVariantData): Promise<Variant> => {
    const response = await client.post(`/api/v1/variants/products/${productId}`, data, authHeaders());
    return response.data;
};

export const updateVariant = async (variantId: number, data: UpdateVariantData): Promise<Variant> => {
    const response = await client.put(`/api/v1/variants/${variantId}`, data, authHeaders());
    return response.data;
};

export const deleteVariant = async (variantId: number): Promise<void> => {
    await client.delete(`/api/v1/variants/${variantId}`, authHeaders());
};
