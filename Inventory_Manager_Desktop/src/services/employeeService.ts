import client from '../api/client';

// --- Types ---

export interface ShiftSummary {
    sales_count: number;
    revenue_today: number;
    products_processed: number;
    transfers_done: number;
    date: string;
}

export interface ActivityItem {
    id: number;
    type: 'sale' | 'transfer' | 'receive' | 'bulk_receive' | 'write_off';
    description: string;
    timestamp: string;
    quantity?: number;
}

// --- API Calls ---

/**
 * Get today's shift summary for the logged-in employee
 */
export const getShiftSummary = async (): Promise<ShiftSummary> => {
    const token = localStorage.getItem('user_token');
    const response = await client.get('/api/v1/employee/shift_summary', {
        headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
};

/**
 * Get recent activity for the logged-in employee
 */
export const getMyActivity = async (limit: number = 10): Promise<ActivityItem[]> => {
    const token = localStorage.getItem('user_token');
    const response = await client.get(`/api/v1/employee/my_activity?limit=${limit}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
};

/**
 * Get count of pending operational alerts
 */
export const getPendingAlertsCount = async (): Promise<number> => {
    const token = localStorage.getItem('user_token');
    const response = await client.get('/api/v1/employee/pending_alerts_count', {
        headers: { Authorization: `Bearer ${token}` }
    });
    return response.data.count;
};
