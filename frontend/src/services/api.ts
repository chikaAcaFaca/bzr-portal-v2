/**
 * API Client - Firebase Auth + tRPC
 *
 * Uses Firebase ID tokens for authentication instead of custom JWT.
 * tRPC client automatically attaches Firebase token to all requests.
 */

import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../../../backend/src/api/trpc/router';
import superjson from 'superjson';
import { getIdToken } from '../lib/firebase';

// =============================================================================
// Configuration
// =============================================================================

const API_URL = import.meta.env?.VITE_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// =============================================================================
// Axios Instance (for non-tRPC calls like file upload)
// =============================================================================

export const apiClient = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

/**
 * Request interceptor: Attach Firebase ID token
 */
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    try {
      const token = await getIdToken();
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // No token available - continue without auth
    }
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

/**
 * Response interceptor: Handle errors with Serbian messages
 * Note: No refresh token logic needed - Firebase handles token refresh automatically
 */
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Token might be expired - try to force refresh
      try {
        const { getFirebaseAuth } = await import('../lib/firebase');
        const auth = getFirebaseAuth();
        if (auth.currentUser) {
          await auth.currentUser.getIdToken(true); // Force refresh
          // Retry the request
          const originalRequest = error.config;
          if (originalRequest) {
            const newToken = await getIdToken();
            if (newToken && originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
            }
            return apiClient(originalRequest);
          }
        }
      } catch {
        // Force refresh failed - user needs to re-login
      }
    }
    return Promise.reject(enhanceError(error));
  }
);

/**
 * Enhance error with user-friendly Serbian messages
 */
function enhanceError(error: AxiosError): Error & { status?: number; data?: unknown } {
  const status = error.response?.status;
  const data = error.response?.data;

  let message = 'Дошло је до грешке при комуникацији са сервером';

  if (status === 400) message = 'Неважећи захтев';
  else if (status === 401) message = 'Нисте аутентификовани';
  else if (status === 403) message = 'Немате дозволу за ову акцију';
  else if (status === 404) message = 'Тражени ресурс није пронађен';
  else if (status === 429) message = 'Превише захтева. Покушајте поново касније.';
  else if (status && status >= 500) message = 'Серверска грешка. Покушајте поново.';
  else if (error.code === 'ECONNABORTED') message = 'Захтев је истекао. Проверите интернет везу.';
  else if (error.code === 'ERR_NETWORK') message = 'Грешка при повезивању. Проверите интернет везу.';

  if (data && typeof data === 'object' && 'message' in data) {
    message = (data as { message: string }).message;
  }

  const enhancedError = new Error(message) as Error & { status?: number; data?: unknown };
  enhancedError.status = status;
  enhancedError.data = data;
  return enhancedError;
}

// =============================================================================
// tRPC Client
// =============================================================================

export const trpc = createTRPCReact<AppRouter>();

/**
 * Cache for the current token to avoid async in headers()
 * Updated by the auth listener
 */
let cachedToken: string | null = null;

export function setCachedToken(token: string | null) {
  cachedToken = token;
}

export function getTRPCClient() {
  return trpc.createClient({
    transformer: superjson,
    links: [
      httpBatchLink({
        url: `${API_URL}/trpc`,
        headers() {
          return cachedToken ? { authorization: `Bearer ${cachedToken}` } : {};
        },
        fetch(url, options) {
          return fetch(url, {
            ...options,
            credentials: 'include',
          });
        },
      }),
    ],
  });
}
