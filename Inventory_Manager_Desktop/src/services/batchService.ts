import client from '../api/client';

// --- Batch Tracking Interfaces ---

export interface BatchTracking {
    id: number;
    batch_code: string;
    product_id: number;
    product_name?: string;
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
    batch_tag: string;
    tag_discount_percent: number | null;
    tag_reason: string | null;
    tag_set_by: string | null;
    tag_set_at: string | null;
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

export interface BatchTreeProduct {
    product_id: number;
    product_name: string;
    total_batches: number;
    total_quantity: number;
    variants: BatchBreakdownVariant[];
}

export interface ClearanceResponse {
    total: number;
    expired_count: number;
    near_expiry_count: number;
    batches: BatchTracking[];
}

export interface POBatchGroup {
    po_id: number | null;
    po_number: string;
    supplier_name: string;
    supplier_id: number | null;
    received_date: string | null;
    status: string;
    total_products: number;
    total_quantity: number;
    total_value: number;
    batches: BatchTracking[];
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

export interface UpdateBatchData {
    manufacturing_date?: string;
    expiry_date?: string;
    procurement_price?: number;
    state_of_origin?: string;
    batch_description?: string;
    variant_id?: number;
}

// --- API Methods ---

const getToken = () => localStorage.getItem('user_token');
const authHeaders = () => ({ headers: { Authorization: `Bearer ${getToken()}` } });

export const createBatchTracking = async (data: CreateBatchData): Promise<BatchTracking> => {
    const response = await client.post('/api/v1/batches/', data, authHeaders());
    return response.data;
};

export const getBatchBreakdown = async (productId: number): Promise<BatchBreakdownResponse> => {
    const response = await client.get(`/api/v1/batches/product/${productId}`, authHeaders());
    return response.data;
};

export const getBatchDetails = async (batchId: number): Promise<BatchTracking> => {
    const response = await client.get(`/api/v1/batches/${batchId}`, authHeaders());
    return response.data;
};

export const getBatchesByPO = async (): Promise<POBatchGroup[]> => {
    const response = await client.get('/api/v1/batches/by-po', authHeaders());
    return response.data;
};

export const getBatchBarcodeUrl = (batchId: number): string => {
    const baseUrl = client.defaults.baseURL || '';
    return `${baseUrl}/api/v1/batches/${batchId}/barcode`;
};

export const updateBatchTracking = async (batchId: number, data: UpdateBatchData): Promise<BatchTracking> => {
    const response = await client.put(`/api/v1/batches/${batchId}`, data, authHeaders());
    return response.data;
};

export const generateBatchesForPO = async (poId: number, batchDetails: CreateBatchData[]): Promise<any> => {
    const response = await client.post(`/api/v1/batches/generate-for-po/${poId}`, batchDetails, authHeaders());
    return response.data;
};

// --- NEW: Batch Tracking Hub APIs ---

export const getAllBatchTree = async (): Promise<BatchTreeProduct[]> => {
    const response = await client.get('/api/v1/batches/all', authHeaders());
    return response.data;
};

export const getClearanceBatches = async (days: number = 30): Promise<ClearanceResponse> => {
    const response = await client.get(`/api/v1/batches/clearance?days=${days}`, authHeaders());
    return response.data;
};

export const scanBatch = async (code: string): Promise<BatchTracking[]> => {
    const response = await client.get(`/api/v1/batches/scan/${encodeURIComponent(code)}`, authHeaders());
    return response.data;
};

export const transferBatch = async (sourceBatchId: number, destBatchId: number, quantity: number): Promise<any> => {
    const response = await client.post('/api/v1/batches/transfer', {
        source_batch_id: sourceBatchId,
        destination_batch_id: destBatchId,
        quantity
    }, authHeaders());
    return response.data;
};

export const setBatchTag = async (batchId: number, tag: string, discountPercent?: number, reason?: string): Promise<BatchTracking> => {
    const response = await client.put(`/api/v1/batches/${batchId}/tag`, {
        batch_tag: tag,
        tag_discount_percent: discountPercent || null,
        tag_reason: reason || null
    }, authHeaders());
    return response.data;
};

export const getBatchesByTag = async (tag: string): Promise<BatchTracking[]> => {
    const response = await client.get(`/api/v1/batches/by-tag/${tag}`, authHeaders());
    return response.data;
};




