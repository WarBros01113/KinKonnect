
'use client';

import type { ReactNode } from 'react';
import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { onAuthChanged } from '@/lib/firebase/auth';
import { getUserProfile, getKonnectRequests } from '@/lib/firebase/firestore'; // Added getKonnectRequests
import type { User, Profile } from '@/types';
import { Loader2 } from 'lucide-react';

interface AuthContextType {
  user: User | null;
  isAdmin: boolean | null;
  authLoading: boolean;
  profileLoading: boolean;
  hasPendingKonnectRequests: boolean;
  clearPendingKonnectRequestsIndicator: () => void;
  refreshPendingKonnectRequests: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);
  const [hasPendingKonnectRequests, setHasPendingKonnectRequests] = useState(false);

  const refreshPendingKonnectRequests = useCallback(async () => {
    if (user) {
      try {
        const requests = await getKonnectRequests(user.uid);
        setHasPendingKonnectRequests(requests.length > 0);
      } catch (error) {
        console.error("Failed to refresh pending konnect requests:", error);
        setHasPendingKonnectRequests(false); // Default to false on error
      }
    } else {
      setHasPendingKonnectRequests(false);
    }
  }, [user]);

  useEffect(() => {
    const unsubscribe = onAuthChanged(async (authUser) => {
      setUser(authUser);
      setAuthLoading(false);
      if (authUser) {
        setProfileLoading(true);
        try {
          const profile = await getUserProfile(authUser.uid);
          setIsAdmin(!!profile?.isAdmin);
          await refreshPendingKonnectRequests(); // Fetch requests after user logs in
        } catch (error) {
          console.error("Failed to fetch user profile or konnect requests:", error);
          setIsAdmin(false);
          setHasPendingKonnectRequests(false);
        } finally {
          setProfileLoading(false);
        }
      } else {
        setIsAdmin(null);
        setHasPendingKonnectRequests(false);
        setProfileLoading(false);
      }
    });
    return () => unsubscribe();
  }, [refreshPendingKonnectRequests]);

  const clearPendingKonnectRequestsIndicator = useCallback(() => {
    setHasPendingKonnectRequests(false);
    // Optionally, you could also mark requests as "seen" in Firestore here if needed.
  }, []);

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{
      user,
      isAdmin,
      authLoading,
      profileLoading,
      hasPendingKonnectRequests,
      clearPendingKonnectRequestsIndicator,
      refreshPendingKonnectRequests
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
