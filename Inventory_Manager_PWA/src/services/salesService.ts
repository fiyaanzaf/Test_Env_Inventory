import api from '../api/client';

export interface OrderSummary {
  id: number;
  order_timestamp: string;
  customer_name: string;
  customer_phone?: string;
  total_amount: string;
  status: string;
  payment_method: string;
  payment_reference?: string;
}

export interface OrderDetail extends OrderSummary {
  items: Array<{
    product_id: number;
    sku: string;
    product_name: string;
    quantity: number;
    unit_price: string;
  }>;
}

export interface PaginatedOrders {
  items: OrderSummary[];
  total: number;
  page: number;
  total_pages: number;
}

const getAuthHeaders = () => {
  const token = localStorage.getItem('user_token');
  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
};

export const salesService = {
  getHistory: async (
    search: string = '',
    page: number = 1,
    limit: number = 50,
    sortBy: string = 'date',
    sortOrder: string = 'desc',
    paymentMethod: string = ''
  ): Promise<PaginatedOrders> => {
    const config = getAuthHeaders();
    const params = {
      search,
      page,
      limit,
      sort_by: sortBy,
      sort_order: sortOrder,
      payment_method: paymentMethod
    };
    const response = await api.get('/api/v1/sales/orders', { ...config, params });
    return response.data;
  },

  exportPdf: async (search: string, sortBy: string, sortOrder: string, paymentMethod: string) => {
    const config = getAuthHeaders();
    const response = await api.get('/api/v1/sales/export_pdf', {
      ...config,
      params: { search, sort_by: sortBy, sort_order: sortOrder, payment_method: paymentMethod },
      responseType: 'blob'
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Sales_History_${new Date().toISOString().split('T')[0]}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  },

  getOrderDetails: async (id: number): Promise<OrderDetail> => {
    const config = getAuthHeaders();
    const response = await api.get(`/api/v1/sales/orders/${id}`, config);
    return response.data;
  }
};
