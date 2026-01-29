import client from '../api/client';

// --- Types ---

export interface CustomerLookup {
    id: number;
    name: string;
    phone_number: string;
    email?: string;
    loyalty_points: number;
}

export interface LoyaltySettings {
    earn_per_rupees: number;
    redeem_value: number;
}

export interface RedeemResponse {
    success: boolean;
    points_redeemed: number;
    discount_amount: number;
    remaining_points: number;
}

export interface PointsCalculation {
    purchase_amount: number;
    points_earned: number;
    earn_rate: string;
}

// --- Helper ---
const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('user_token')}` }
});

// --- Customer Lookup ---

/**
 * Look up a customer by phone number.
 * Returns customer details including loyalty points balance.
 */
export const lookupCustomerByPhone = async (phone: string): Promise<CustomerLookup | null> => {
    try {
        const response = await client.get(`/api/v1/loyalty/customer/${phone}`, getAuthHeaders());
        return response.data;
    } catch (error: any) {
        if (error.response?.status === 404) {
            return null; // Customer not found
        }
        throw error;
    }
};

// --- Points Management ---

/**
 * Add loyalty points to a customer account.
 */
export const addLoyaltyPoints = async (customerId: number, points: number, orderId?: number) => {
    const response = await client.post('/api/v1/loyalty/add', {
        customer_id: customerId,
        points: points,
        order_id: orderId
    }, getAuthHeaders());
    return response.data;
};

/**
 * Redeem loyalty points for a discount.
 */
export const redeemLoyaltyPoints = async (customerId: number, pointsToRedeem: number): Promise<RedeemResponse> => {
    const response = await client.post('/api/v1/loyalty/redeem', {
        customer_id: customerId,
        points_to_redeem: pointsToRedeem
    }, getAuthHeaders());
    return response.data;
};

// --- Settings ---

/**
 * Get current loyalty program settings.
 */
export const getLoyaltySettings = async (): Promise<LoyaltySettings> => {
    const response = await client.get('/api/v1/loyalty/settings', getAuthHeaders());
    return response.data;
};

/**
 * Update loyalty program settings (managers/owners only).
 */
export const updateLoyaltySettings = async (settings: Partial<LoyaltySettings>) => {
    const response = await client.put('/api/v1/loyalty/settings', settings, getAuthHeaders());
    return response.data;
};

// --- Utility ---

/**
 * Calculate points that would be earned for a given purchase amount.
 */
export const calculatePointsForAmount = async (amount: number): Promise<PointsCalculation> => {
    const response = await client.get(`/api/v1/loyalty/calculate/${amount}`, getAuthHeaders());
    return response.data;
};

/**
 * Calculate points earned locally (without API call) given settings.
 */
export const calculatePointsLocally = (amount: number, earnPerRupees: number): number => {
    if (earnPerRupees <= 0) return 0;
    return Math.floor(amount / earnPerRupees);
};
