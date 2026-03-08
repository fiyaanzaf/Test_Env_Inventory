import client from '../api/client';

const authHeader = () => {
    const token = localStorage.getItem('user_token');
    return { Authorization: `Bearer ${token}` };
};

// ── Types ────────────────────────────────────────

export interface InvoiceItemAdjust {
    po_item_id: number;
    invoiced_qty?: number;
    unit_cost?: number;
    hsn_code?: string;
    tax_rate?: number;
}

export interface StartGRNPayload {
    po_id: number;
    invoice_number: string;
    invoice_date?: string;
    received_date?: string;
    subtotal?: number;
    tax_amount?: number;
    total_amount?: number;
    payment_due_date?: string;
    notes?: string;
    item_adjustments?: InvoiceItemAdjust[];
}

export interface GRNScannedItem {
    id: number;
    grn_id?: number;
    invoice_item_id?: number;
    po_item_id?: number;
    product_id: number;
    variant_id: number | null;
    product_name: string;
    variant_name: string | null;
    ordered_qty: number;
    invoiced_qty: number;
    received_qty: number;
    unit_cost: number;
    universal_barcode: string;
    internal_code: string;
    qa_status: 'pending' | 'approved' | 'rejected';
    qa_notes?: string;
    scanned_at?: string;
}

export interface InvoiceItem {
    id: number;
    po_item_id: number;
    product_id: number;
    variant_id: number | null;
    product_name: string;
    variant_name: string | null;
    invoiced_qty: number;
    unit_cost: number;
    line_total: number;
    hsn_code?: string;
    tax_rate?: number;
}

export interface GRNDetail {
    id: number;
    po_id: number;
    invoice_id: number;
    received_by: string;
    status: 'scanning' | 'qa_pending' | 'completed' | 'cancelled';
    warehouse_id: number | null;
    created_at: string;
    completed_at: string | null;
    notes: string | null;
    invoice_number: string;
    invoice_date: string | null;
    invoice_total: number;
    payment_status: string;
    supplier_name: string;
    po_status: string;
    invoice_items: InvoiceItem[];
    scanned_items: GRNScannedItem[];
}

export interface GRNListItem {
    id: number;
    po_id: number;
    status: string;
    created_at: string;
    completed_at: string | null;
    received_by: string;
    warehouse_id: number | null;
    invoice_number: string;
    total_amount: number;
    payment_status: string;
    supplier_name: string;
    item_count: number;
    approved_count: number;
}

export interface QADecision {
    item_id: number;
    status: 'approved' | 'rejected';
    notes?: string;
}

// ── API Functions ────────────────────────────────

export const startGRN = async (payload: StartGRNPayload) => {
    const res = await client.post('/api/v1/grn/start', payload, { headers: authHeader() });
    return res.data;
};

export const getGRN = async (grnId: number): Promise<GRNDetail> => {
    const res = await client.get(`/api/v1/grn/${grnId}`, { headers: authHeader() });
    return res.data;
};

export const scanGRNItem = async (grnId: number, universal_barcode: string, product_id?: number, received_qty?: number) => {
    const res = await client.post(`/api/v1/grn/${grnId}/scan`,
        { universal_barcode, product_id, received_qty },
        { headers: authHeader() }
    );
    return res.data as GRNScannedItem;
};

export const updateGRNInvoice = async (grnId: number, data: Record<string, unknown>) => {
    const res = await client.put(`/api/v1/grn/${grnId}/invoice`, data, { headers: authHeader() });
    return res.data;
};

export const getInternalCodeQR = (grnId: number, itemId: number) => {
    const token = localStorage.getItem('user_token');
    const base = client.defaults.baseURL || '';
    return `${base}/api/v1/grn/${grnId}/internal-code/${itemId}/qr?token=${token}`;
};

export const submitQA = async (grnId: number, decisions: QADecision[]) => {
    const res = await client.put(`/api/v1/grn/${grnId}/qa`, { decisions }, { headers: authHeader() });
    return res.data;
};

export const confirmGRN = async (grnId: number, warehouse_id: number) => {
    const res = await client.post(`/api/v1/grn/${grnId}/confirm`, { warehouse_id }, { headers: authHeader() });
    return res.data;
};

export const cancelGRN = async (grnId: number) => {
    const res = await client.delete(`/api/v1/grn/${grnId}`, { headers: authHeader() });
    return res.data;
};

export const listGRNs = async (status?: string): Promise<GRNListItem[]> => {
    const params = status ? { status } : {};
    const res = await client.get('/api/v1/grn', { headers: authHeader(), params });
    return res.data;
};

export const listInvoices = async (supplier_id?: number, payment_status?: string) => {
    const params: Record<string, unknown> = {};
    if (supplier_id) params.supplier_id = supplier_id;
    if (payment_status) params.payment_status = payment_status;
    const res = await client.get('/api/v1/grn/invoices', { headers: authHeader(), params });
    return res.data;
};
