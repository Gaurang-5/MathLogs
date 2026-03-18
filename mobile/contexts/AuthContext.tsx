/**
 * Auth Context — manages login state, secure token storage, and user data.
 * Tokens live in SecureStore (device keychain), never AsyncStorage.
 */
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import api from '../services/api';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  instituteId?: string;
  instituteName?: string;
}

interface AuthContextData {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  sendOtp: (phone: string) => Promise<void>;
  verifyOtp: (phone: string, otp: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // Check for existing session on app launch
  useEffect(() => {
    loadStoredSession();
  }, []);

  const loadStoredSession = async () => {
    try {
      const storedToken = await SecureStore.getItemAsync('auth_token');
      const storedUser = await SecureStore.getItemAsync('user_data');

      if (storedToken && storedUser) {
        // Set token directly in api client headers as well
        api.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      }
    } catch (error) {
      console.warn('Failed to load stored session:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const sendOtp = useCallback(async (phone: string) => {
    try {
      await api.post('/auth/send-otp', { phone: `+91${phone}` });
    } catch (error) {
      // Re-throw the error so the UI can handle it
      throw error;
    }
  }, []);

  const verifyOtp = useCallback(async (phone: string, otp: string) => {
    const response = await api.post('/auth/verify-otp', { phone, otp });
    const { token: newToken, adminId, role } = response.data;

    // Immediately set token in api defaults so the next request succeeds
    api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;

    // Fetch full profile info to get names/institute info
    const profileResponse = await api.get('/auth/me');
    const profile = profileResponse.data;

    const userData: User = {
      id: adminId,
      name: profile.username || 'Teacher',
      email: profile.email || '',
      role: role,
      instituteId: profile.instituteId,
      instituteName: profile.instituteName,
    };

    // Store securely in device keychain
    await SecureStore.setItemAsync('auth_token', newToken);
    await SecureStore.setItemAsync('user_data', JSON.stringify(userData));

    setToken(newToken);
    setUser(userData);
  }, []);

  const logout = useCallback(async () => {
    await SecureStore.deleteItemAsync('auth_token');
    await SecureStore.deleteItemAsync('user_data');
    delete api.defaults.headers.common['Authorization'];
    setToken(null);
    setUser(null);
    router.replace('/login');
  }, [router]);

  const value = useMemo(() => ({
    user,
    token,
    isLoading,
    isLoggedIn: !!token,
    sendOtp,
    verifyOtp,
    logout,
  }), [user, token, isLoading, sendOtp, verifyOtp, logout]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
