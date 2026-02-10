import { create } from 'zustand';
import { login, logout, getCurrentUser } from '../services/authService';

interface User {
  id: number;
  username: string;
  email: string;
  roles: string[];
  phone_number?: string;
  is_active: boolean;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  error: null,

  login: async (username, password) => {
    set({ error: null });
    try {
      await login(username, password);
      const user = await getCurrentUser();
      set({ user });
    } catch (err) {
      set({ error: 'Login failed. Please check your credentials.' });
      throw err;
    }
  },

  logout: () => {
    logout();
    set({ user: null });
  },

  checkAuth: async () => {
    set({ isLoading: true });
    try {
      const user = await getCurrentUser();
      set({ user, isLoading: false });
    } catch (err) {
      set({ user: null, isLoading: false });
    }
  },
}));
