import client from '../api/client';

const TOKEN_KEY = 'user_token';

export const saveToken = (token: string) => {
  localStorage.setItem(TOKEN_KEY, token);
};

export const getToken = (): string | null => {
  return localStorage.getItem(TOKEN_KEY);
};

export const removeToken = () => {
  localStorage.removeItem(TOKEN_KEY);
};

export const login = async (username: string, password: string) => {
  const params = new URLSearchParams();
  params.append('username', username);
  params.append('password', password);

  const response = await client.post('/api/v1/users/login', params, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  if (response.data.access_token) {
    saveToken(response.data.access_token);
  }
  return response.data;
};

export const logout = () => {
  removeToken();
};

export const getCurrentUser = async () => {
  const token = getToken();
  if (!token) return null;

  try {
    const response = await client.get('/api/v1/users/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching user details:', error);
    return null;
  }
};
