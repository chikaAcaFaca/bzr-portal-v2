/**
 * Auth Store - Firebase Auth + Zustand
 *
 * Manages authentication state using Firebase Auth.
 * Firebase handles token management; Zustand stores agency/user profile data.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  loginWithEmail,
  registerWithEmail,
  loginWithGoogle,
  logout as firebaseLogout,
  onAuthChange,
  getIdToken,
  type FirebaseUser,
} from '../lib/firebase';

// =============================================================================
// Types
// =============================================================================

export type AgencyUserRole = 'owner' | 'agent';

export interface AgencyUserProfile {
  agencyUserId: number;
  agencyId: number;
  email: string;
  fullName: string;
  role: AgencyUserRole;
  agencyName: string;
}

export interface AuthState {
  // State
  firebaseUser: FirebaseUser | null;
  profile: AgencyUserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  loginEmail: (email: string, password: string) => Promise<void>;
  registerEmail: (email: string, password: string) => Promise<void>;
  loginGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  setProfile: (profile: AgencyUserProfile) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Token helper (for API calls)
  getAccessToken: () => Promise<string | null>;
}

// Legacy exports for backward compatibility
export type AccountTier = 'trial' | 'verified' | 'premium';
export type UserRole = 'admin' | 'bzr_officer' | 'hr_manager' | 'viewer';
export interface User {
  userId: number;
  email: string;
  role: UserRole;
  companyId: number | null;
  firstName?: string;
  lastName?: string;
  accountTier: AccountTier;
  trialExpiryDate?: string | null;
  emailVerified: boolean;
}

// =============================================================================
// Store
// =============================================================================

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      firebaseUser: null,
      profile: null,
      isAuthenticated: false,
      isLoading: true, // True initially while checking Firebase auth state
      error: null,

      // Login with email/password
      loginEmail: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          await loginWithEmail(email, password);
          // Firebase onAuthStateChanged will handle setting user
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Greška pri prijavljivanju';
          set({ error: message, isLoading: false });
          throw err;
        }
      },

      // Register with email/password
      registerEmail: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          await registerWithEmail(email, password);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Greška pri registraciji';
          set({ error: message, isLoading: false });
          throw err;
        }
      },

      // Login with Google
      loginGoogle: async () => {
        set({ isLoading: true, error: null });
        try {
          await loginWithGoogle();
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Greška pri Google prijavljivanju';
          set({ error: message, isLoading: false });
          throw err;
        }
      },

      // Logout
      logout: async () => {
        try {
          await firebaseLogout();
        } catch {
          // Ignore logout errors
        }
        set({
          firebaseUser: null,
          profile: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
        });
      },

      // Set agency user profile (loaded from backend after auth)
      setProfile: (profile) =>
        set({
          profile,
          isAuthenticated: true,
          isLoading: false,
        }),

      setLoading: (loading) => set({ isLoading: loading }),
      setError: (error) => set({ error }),

      // Get Firebase ID token for API requests
      getAccessToken: async () => {
        return getIdToken();
      },
    }),
    {
      name: 'bzr-auth-storage',
      partialize: (state) => ({
        profile: state.profile,
      }),
    }
  )
);

// =============================================================================
// Firebase Auth State Listener
// =============================================================================

/**
 * Initialize Firebase auth state listener.
 * Call this once at app startup (e.g., in App.tsx or main.tsx).
 */
export function initAuthListener() {
  return onAuthChange(async (firebaseUser) => {
    if (firebaseUser) {
      useAuthStore.setState({
        firebaseUser,
        isAuthenticated: true,
        isLoading: false,
      });
    } else {
      useAuthStore.setState({
        firebaseUser: null,
        profile: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  });
}

// =============================================================================
// Legacy selectors (backward compatibility)
// =============================================================================

export const selectUser = (state: AuthState) => state.profile;
export const selectIsAuthenticated = (state: AuthState) => state.isAuthenticated;
export const selectAccessToken = () => getIdToken(); // Returns Promise
export const selectUserRole = (state: AuthState) => state.profile?.role;

// Legacy accessToken getter for components that use useAuthStore.getState().accessToken
Object.defineProperty(useAuthStore.getState(), 'accessToken', {
  get: () => null, // Sync access not possible with Firebase - use getAccessToken() instead
});
