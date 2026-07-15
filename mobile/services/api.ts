/**
 * API Client for MathLogs Server
 * Handles authentication headers, base URL, and token refresh.
 */
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { getItemAsync, deleteItemAsync } from './storage';
import { Platform } from 'react-native';

const DEFAULT_DEV_URL = Platform.select({
  android: 'http://10.0.2.2:3001',
  default: 'http://localhost:3001',
});
const PROD_URL = 'https://mathlogs.app';
const BASE_URL = process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? DEFAULT_DEV_URL : PROD_URL);

const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  timeout: 30000, // Increased timeout for slow database queries (e.g., Dashboard aggregations)
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: Attach JWT token
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await getItemAsync('auth_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error),
);

// Response interceptor: Handle 401 (expired tokens)
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      await deleteItemAsync('auth_token');
      await deleteItemAsync('user_data');
      // The auth context will pick up the missing token and redirect to login
    }
    return Promise.reject(error);
  },
);

export default api;
export { BASE_URL };
