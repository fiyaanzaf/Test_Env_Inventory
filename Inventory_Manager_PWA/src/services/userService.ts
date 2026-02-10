import client from '../api/client';

export interface User {
  id: number;
  username: string;
  email: string;
  roles: string[];
  phone_number?: string;
  is_active: boolean;
}

export const getAllUsers = async (): Promise<User[]> => {
  const token = localStorage.getItem('user_token');
  const response = await client.get('/api/v1/users', {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

export const assignRole = async (username: string, roleName: string) => {
  const token = localStorage.getItem('user_token');
  const response = await client.post('/api/v1/users/assign_role',
    { username, role_name: roleName },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
};

export const registerStaff = async (userData: { username: string; email: string; password: string; role: string; phone_number?: string }) => {
  const token = localStorage.getItem('user_token');
  const response = await client.post('/api/v1/users/register_staff', userData, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

export const createCustomer = async (customerData: { name: string; phone_number: string; email?: string }) => {
  const token = localStorage.getItem('user_token');
  const response = await client.post('/api/v1/customers', customerData, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};

export const removeRole = async (username: string, roleName: string) => {
  const token = localStorage.getItem('user_token');
  const response = await client.post('/api/v1/users/remove_role',
    { username, role_name: roleName },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
};

export const switchRole = async (username: string, roleName: string) => {
  const token = localStorage.getItem('user_token');
  const response = await client.post('/api/v1/users/switch_role',
    { username, role_name: roleName },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
};

export const toggleUserStatus = async (username: string) => {
  const token = localStorage.getItem('user_token');
  const response = await client.post('/api/v1/users/toggle_status',
    { username },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
};

export const updateProfile = async (data: { email?: string; phone_number?: string; password?: string; current_password?: string }) => {
  const token = localStorage.getItem('user_token');
  const response = await client.put('/api/v1/users/me', data, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
};
