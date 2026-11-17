/* eslint-disable */
/**
 * Auth Context — manages login state, secure token storage, and user data.
 * Tokens live in SecureStore (device keychain), never AsyncStorage.
 */
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { getItemAsync, setItemAsync, deleteItemAsync } from '../services/storage';
import { useRouter } from 'expo-router';
import api, { isSessionRejection, setApiSession, subscribeToSessionChanges } from '../services/api';
import { withSessionStorage } from '../services/sessionStorage';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  instituteId?: string;
  instituteName?: string;
  logo?: string;
}

export interface LoginAccount {
  adminId: string;
  instituteName: string;
  teacherName: string;
  role: string;
  status: string;
}

interface OtpAuthResponse {
  success: boolean;
  message?: string;
  error?: string;
  adminId?: string;
  token?: string;
  refreshToken?: string;
  role?: string;
  multipleAccounts?: boolean;
  tempAuthToken?: string;
  accounts?: LoginAccount[];
}

export interface OtpVerificationResult {
  requiresAccountSelection: boolean;
  accounts: LoginAccount[];
  tempAuthToken?: string;
}

interface AuthContextData {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  hasSeenOnboarding: boolean;
  requestLoginOtp: (phone: string) => Promise<string>;
  verifyLoginOtp: (phone: string, otp: string) => Promise<OtpVerificationResult>;
  selectLoginAccount: (adminId: string, tempAuthToken: string, phone: string) => Promise<void>;
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
  const queryClient = useQueryClient();
  const sessionVersion = useRef(0);
  const completingLogin = useRef(false);

  useEffect(() => subscribeToSessionChanges((nextToken) => {
    setToken(nextToken);
    if (nextToken === null) {
      sessionVersion.current += 1;
      setUser(null);
      queryClient.clear();
      router.replace('/login');
    }
  }), [queryClient, router]);

  // Check for existing session on app launch
  useEffect(() => {
    loadStoredSession();
  }, []);

  const loadStoredSession = async () => {
    const version = sessionVersion.current;
    try {
      const storedToken = await getItemAsync('auth_token');
      const storedUser = await getItemAsync('user_data');
      const onboardingStatus = await getItemAsync('has_seen_onboarding');

      if (onboardingStatus === 'true') {
        setHasSeenOnboarding(true);
      }

      if (storedToken && storedUser) {
        if (version !== sessionVersion.current) return;
        const parsed: User = JSON.parse(storedUser);
        if (!parsed || typeof parsed.id !== 'string' || !parsed.id) {
          throw new Error('Stored profile is incomplete');
        }
        setApiSession(storedToken);
        setToken(storedToken);
        // Load cached user immediately so UI is instant
        setUser(parsed);

        // Then silently refresh profile from server to pick up logo / name changes
        try {
          const profileRes = await api.get('/auth/me');
          if (version !== sessionVersion.current) return;
          const p = profileRes.data;
          const refreshed: User = {
            ...parsed,
            name: p.username || parsed.name,
            email: p.email || parsed.email,
            instituteName: p.instituteName || parsed.instituteName,
            logo: p.logo !== undefined ? (p.logo ?? undefined) : parsed.logo,
          };
          setUser(refreshed);
          await withSessionStorage(async () => {
            if (version === sessionVersion.current) {
              await setItemAsync('user_data', JSON.stringify(refreshed));
            }
          });
        } catch {
          // Session rejection is handled by the API's session listener.
          // Transient network failures can still use the cached profile.
        }
      }
    } catch (error) {
      console.warn('Failed to load stored session:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getAuthError = (error: any, fallback: string) => (
    error?.response?.data?.reason
    || error?.response?.data?.error
    || error?.message
    || fallback
  );

  const finalizeLogin = useCallback(async (auth: OtpAuthResponse, phone: string) => {
    if (!auth.success || !auth.token) {
      throw new Error(auth.error || 'Sign in failed');
    }

    if (completingLogin.current) throw new Error('Sign-in is already completing. Please wait.');
    completingLogin.current = true;
    const version = ++sessionVersion.current;
    try {
      await withSessionStorage(async () => {
        if (version !== sessionVersion.current) throw new Error('Sign-in was interrupted.');
        setApiSession(auth.token!);
        queryClient.clear();
        // Never leave another account's cached profile next to the new token.
        await deleteItemAsync('user_data');
        await Promise.all([
          setItemAsync('auth_token', auth.token!),
          auth.refreshToken
            ? setItemAsync('refresh_token', auth.refreshToken)
            : deleteItemAsync('refresh_token'),
        ]);
      });

      let profile: any;
      try {
        const profileResponse = await api.get('/auth/me', {
          headers: { Authorization: `Bearer ${auth.token}` },
        });
        profile = profileResponse.data;
      } catch (error: any) {
        if (isSessionRejection(error) || version !== sessionVersion.current) {
          throw new Error('Your session could not be verified. Please sign in again.');
        }
        if (!isAxiosError(error) || error.response || error.code === 'ERR_CANCELED') throw error;
        console.warn('[AUTH] Profile request unavailable:', error.code);
        profile = { username: 'Admin', email: phone };
      }

      if (version !== sessionVersion.current) {
        throw new Error('Sign-in was interrupted. Please try again.');
      }

      const userData: User = {
        id: auth.adminId || profile.id || '',
        name: profile.username || profile.name || 'Admin',
        email: profile.email || phone,
        role: auth.role || profile.role || 'ADMIN',
        instituteId: profile.instituteId,
        instituteName: profile.instituteName,
        logo: profile.logo,
      };

      const activeToken = await withSessionStorage(async () => {
        if (version !== sessionVersion.current) throw new Error('Sign-in was interrupted.');
        await setItemAsync('user_data', JSON.stringify(userData));
        return getItemAsync('auth_token');
      });
      if (version !== sessionVersion.current || !activeToken) {
        throw new Error('Sign-in was interrupted. Please try again.');
      }

      setToken(activeToken);
      setUser(userData);
    } catch (error) {
      await withSessionStorage(async () => {
        if (version !== sessionVersion.current) return;
        sessionVersion.current += 1;
        setApiSession(null);
        setToken(null);
        setUser(null);
        queryClient.clear();
        await Promise.all([
          deleteItemAsync('auth_token'),
          deleteItemAsync('refresh_token'),
          deleteItemAsync('user_data'),
        ]);
      });
      throw error;
    } finally {
      completingLogin.current = false;
    }
  }, [queryClient]);

  const requestLoginOtp = useCallback(async (phone: string) => {
    try {
      const response = await api.post<OtpAuthResponse>('/auth/send-mobile-otp', { phone });
      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to send OTP');
      }
      return response.data.message || 'WhatsApp OTP sent';
    } catch (error: any) {
      throw new Error(getAuthError(error, 'Failed to send OTP'));
    }
  }, []);

  const verifyLoginOtp = useCallback(async (phone: string, otp: string): Promise<OtpVerificationResult> => {
    try {
      const response = await api.post<OtpAuthResponse>('/auth/verify-mobile-otp', { phone, otp });
      const auth = response.data;

      if (auth.success && auth.multipleAccounts && auth.accounts?.length && auth.tempAuthToken) {
        return {
          requiresAccountSelection: true,
          accounts: auth.accounts,
          tempAuthToken: auth.tempAuthToken,
        };
      }

      await finalizeLogin(auth, phone);
      return { requiresAccountSelection: false, accounts: [] };
    } catch (error: any) {
      throw new Error(getAuthError(error, 'OTP verification failed'));
    }
  }, [finalizeLogin]);

  const selectLoginAccount = useCallback(async (
    adminId: string,
    tempAuthToken: string,
    phone: string,
  ) => {
    try {
      const response = await api.post<OtpAuthResponse>('/auth/select-account', {
        adminId,
        tempAuthToken,
      });
      await finalizeLogin(response.data, phone);
    } catch (error: any) {
      throw new Error(getAuthError(error, 'Failed to select account'));
    }
  }, [finalizeLogin]);

  const logout = useCallback(async () => {
    const version = ++sessionVersion.current;
    setApiSession(null);
    setToken(null);
    setUser(null);
    queryClient.clear();
    await withSessionStorage(async () => {
      if (version !== sessionVersion.current) return;
      await Promise.all([
        deleteItemAsync('auth_token'),
        deleteItemAsync('refresh_token'),
        deleteItemAsync('user_data'),
        deleteItemAsync('has_seen_onboarding'),
      ]);
    });
    if (version !== sessionVersion.current) return;
    setHasSeenOnboarding(false);
    router.replace('/welcome');
  }, [queryClient, router]);

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
    requestLoginOtp,
    verifyLoginOtp,
    selectLoginAccount,
    logout,
    completeOnboarding,
  }), [
    user,
    token,
    isLoading,
    hasSeenOnboarding,
    requestLoginOtp,
    verifyLoginOtp,
    selectLoginAccount,
    logout,
    completeOnboarding,
  ]);

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
