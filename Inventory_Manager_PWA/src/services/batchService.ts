import client from '../api/client';

// --- Batch Tracking Interfaces ---

export interface BatchTracking {
    id: number;
    batch_code: string;
    product_id: number;
    variant_id: number | null;
    variant_name: string | null;
    supplier_id: number | null;
    supplier_name: string | null;
    manufacturing_date: string | null;
    expiry_date: string | null;
    procurement_price: number | null;
    state_of_origin: string | null;
    batch_description: string | null;
    po_id: number | null;
    created_at: string;
    created_by: string | null;
    stock_quantity: number;
}

export interface BatchBreakdownVariant {
    variant_id: number | null;
    variant_name: string;
    batches: BatchTracking[];
    total_quantity: number;
}

export interface BatchBreakdownResponse {
    product_id: number;
    product_name: string;
    total_batches: number;
    total_quantity: number;
    variants: BatchBreakdownVariant[];
}

export interface CreateBatchData {
    product_id: number;
    variant_id?: number;
    supplier_id?: number;
    manufacturing_date?: string;
    expiry_date?: string;
    procurement_price?: number;
    state_of_origin?: string;
    batch_description?: string;
    po_id?: number;
}

// --- API Methods ---

const getToken = () => localStorage.getItem('user_token');
const authHeaders = () => ({ headers: { Authorization: `Bearer ${getToken()}` } });

export const getBatchBreakdown = async (productId: number): Promise<BatchBreakdownResponse> => {
    const response = await client.get(`/api/v1/batches/product/${productId}`, authHeaders());
    return response.data;
};

export const getBatchDetails = async (batchId: number): Promise<BatchTracking> => {
    const response = await client.get(`/api/v1/batches/${batchId}`, authHeaders());
    return response.data;
};

export const getBatchBarcodeUrl = (batchId: number): string => {
    const baseUrl = client.defaults.baseURL || '';
    return `${baseUrl}/api/v1/batches/${batchId}/barcode`;
};
