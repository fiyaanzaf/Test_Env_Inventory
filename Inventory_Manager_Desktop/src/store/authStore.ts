import { create } from 'zustand';
import { login, logout, getCurrentUser } from '../services/authService'; // Fixed import path typo if needed

// Define the shape of our User object (Matches Backend Schema)
interface User {
  id: number;
  username: string;
  email: string;
  roles: string[];
  phone_number?: string; // <--- ADDED
  is_active: boolean;    // <--- ADDED
}

// Define the shape of our Store
interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true, // Default to true for the initial page load check
  error: null,

  login: async (username, password) => {
    // FIX: We REMOVED 'isLoading: true' from here.
    // This prevents App.tsx from unmounting the LoginScreen while it's working.
    set({ error: null }); 
    try {
      await login(username, password);
      const user = await getCurrentUser();
      set({ user }); // Login complete
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
    // We ONLY use global loading for the initial "Am I already logged in?" check
    set({ isLoading: true });
    try {
      const user = await getCurrentUser();
      set({ user, isLoading: false });
    } catch (err) {
      set({ user: null, isLoading: false });
    }
  },
}));