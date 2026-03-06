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

// --- API Methods ---

const getToken = () => localStorage.getItem('user_token');
const authHeaders = () => ({ headers: { Authorization: `Bearer ${getToken()}` } });

export const getVariantsForProduct = async (productId: number): Promise<Variant[]> => {
    const response = await client.get(`/api/v1/variants/products/${productId}`, authHeaders());
    return response.data;
};
