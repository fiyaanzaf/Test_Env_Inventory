import client from '../api/client';

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

const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('user_token')}` }
});

export const lookupCustomerByPhone = async (phone: string): Promise<CustomerLookup | null> => {
    try {
        const response = await client.get(`/api/v1/loyalty/customer/${phone}`, getAuthHeaders());
        return response.data;
    } catch (error: any) {
        if (error.response?.status === 404) return null;
        throw error;
    }
};

export const addLoyaltyPoints = async (customerId: number, points: number, orderId?: number) => {
    const response = await client.post('/api/v1/loyalty/add', {
        customer_id: customerId,
        points: points,
        order_id: orderId
    }, getAuthHeaders());
    return response.data;
};

export const redeemLoyaltyPoints = async (customerId: number, pointsToRedeem: number): Promise<RedeemResponse> => {
    const response = await client.post('/api/v1/loyalty/redeem', {
        customer_id: customerId,
        points_to_redeem: pointsToRedeem
    }, getAuthHeaders());
    return response.data;
};

export const getLoyaltySettings = async (): Promise<LoyaltySettings> => {
    const response = await client.get('/api/v1/loyalty/settings', getAuthHeaders());
    return response.data;
};

export const updateLoyaltySettings = async (settings: Partial<LoyaltySettings>) => {
    const response = await client.put('/api/v1/loyalty/settings', settings, getAuthHeaders());
    return response.data;
};

export const calculatePointsForAmount = async (amount: number): Promise<PointsCalculation> => {
    const response = await client.get(`/api/v1/loyalty/calculate/${amount}`, getAuthHeaders());
    return response.data;
};

export const calculatePointsLocally = (amount: number, earnPerRupees: number): number => {
    if (earnPerRupees <= 0) return 0;
    return Math.floor(amount / earnPerRupees);
};
