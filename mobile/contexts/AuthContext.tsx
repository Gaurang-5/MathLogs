/* eslint-disable */
/**
 * Auth Context — manages login state, secure token storage, and user data.
 * Tokens live in SecureStore (device keychain), never AsyncStorage.
 */
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { getItemAsync, setItemAsync, deleteItemAsync } from '../services/storage';
import { useRouter } from 'expo-router';
import api from '../services/api';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  instituteId?: string;
  instituteName?: string;
  logo?: string;
}

interface AuthContextData {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  hasSeenOnboarding: boolean;
  loginWithPassword: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);
  const router = useRouter();

  // Check for existing session on app launch
  useEffect(() => {
    loadStoredSession();
  }, []);

  const loadStoredSession = async () => {
    try {
      const storedToken = await getItemAsync('auth_token');
      const storedUser = await getItemAsync('user_data');
      const onboardingStatus = await getItemAsync('has_seen_onboarding');

      if (onboardingStatus === 'true') {
        setHasSeenOnboarding(true);
      }

      if (storedToken && storedUser) {
        api.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
        setToken(storedToken);
        // Load cached user immediately so UI is instant
        setUser(JSON.parse(storedUser));

        // Then silently refresh profile from server to pick up logo / name changes
        try {
          const profileRes = await api.get('/auth/me');
          const p = profileRes.data;
          const parsed = JSON.parse(storedUser);
          const refreshed: User = {
            ...parsed,
            name: p.username || parsed.name,
            email: p.email || parsed.email,
            instituteName: p.instituteName || parsed.instituteName,
            logo: p.logo ?? parsed.logo,
          };
          setUser(refreshed);
          await setItemAsync('user_data', JSON.stringify(refreshed));
        } catch {
          // Silently fail — cached user is still set
        }
      }
    } catch (error) {
      console.warn('Failed to load stored session:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithPassword = useCallback(async (identifier: string, password: string) => {
    try {
      if (__DEV__) console.debug('[AUTH] Attempting login', { apiBaseUrl: api.defaults.baseURL });
      
      const response = await api.post('/auth/login', { username: identifier, password });
      
      if (__DEV__) console.debug('[AUTH] Login response status:', response.status);

      if (!response.data.success) {
         throw new Error(response.data.error || 'Login failed');
      }

      const { token: newToken, adminId, role } = response.data;

      // Immediately set token in api defaults so the next request succeeds
      api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;

      // Fetch full profile info to get names/institute info
      let profile;
      try {
         const profileResponse = await api.get('/auth/me');
         profile = profileResponse.data;
         if (__DEV__) console.debug('[AUTH] Profile fetched');
      } catch (e: any) {
         console.warn('[AUTH] Could not fetch /auth/me:', e?.response?.status, e?.message);
         profile = { username: 'Admin', email: identifier };
      }

      const userData: User = {
        id: adminId || '',
        name: profile.username || 'Admin',
        email: profile.email || identifier,
        role: role || 'ADMIN',
        instituteId: profile.instituteId,
        instituteName: profile.instituteName,
        logo: profile.logo,
      };

      // Store securely in device keychain
      await setItemAsync('auth_token', newToken);
      await setItemAsync('user_data', JSON.stringify(userData));

      setToken(newToken);
      setUser(userData);
      if (__DEV__) console.debug('[AUTH] Login successful');
    } catch (error: any) {
      console.error('[AUTH] Login FAILED:');
      console.error('[AUTH]   message:', error?.message);
      console.error('[AUTH]   status:', error?.response?.status);
      console.error('[AUTH]   code:', error?.code);
      if (error.response?.data?.reason) {
         throw new Error(error.response.data.reason);
      }
      // Surface the actual server error message if available
      const serverMsg = error?.response?.data?.error || error?.message || 'Login failed';
      throw new Error(serverMsg);
    }
  }, []);

  const logout = useCallback(async () => {
    await deleteItemAsync('auth_token');
    await deleteItemAsync('user_data');
    await deleteItemAsync('has_seen_onboarding'); // Temporary for testing
    delete api.defaults.headers.common['Authorization'];
    setToken(null);
    setUser(null);
    setHasSeenOnboarding(false);
    router.replace('/welcome');
  }, [router]);

  const completeOnboarding = useCallback(async () => {
    await setItemAsync('has_seen_onboarding', 'true');
    setHasSeenOnboarding(true);
    router.replace('/login');
  }, [router]);

  const value = useMemo(() => ({
    user,
    token,
    isLoading,
    isLoggedIn: !!token,
    hasSeenOnboarding,
    loginWithPassword,
    logout,
    completeOnboarding,
  }), [user, token, isLoading, hasSeenOnboarding, loginWithPassword, logout, completeOnboarding]);

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
