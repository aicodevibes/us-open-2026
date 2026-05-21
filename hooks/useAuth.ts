/**
 * @file hooks/useAuth.ts
 * @description Custom React hook for Firebase Authentication and authorization checks.
 * Encapsulates the Google authentication flow and validates the logged-in user against the admin whitelist.
 */

import { useState, useEffect } from 'react';
import { auth } from '@/lib/firebase';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User 
} from 'firebase/auth';
import { getAuthorizedEmails } from '@/lib/constants';

/**
 * Custom hook returning auth state and action handlers.
 * 
 * @returns {object} Auth state and functions.
 * @returns {User | null} user - The currently authenticated Firebase User object.
 * @returns {boolean} loading - True if authentication state is still initializing.
 * @returns {boolean} isAdmin - True if the user is authenticated and authorized in the admin whitelist.
 * @returns {Function} login - Initiates Google OAuth popup login.
 * @returns {Function} logout - Signs out the current user.
 */
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      
      if (currentUser && currentUser.email) {
        const authorizedEmails = getAuthorizedEmails();
        const userEmail = currentUser.email.toLowerCase().trim();
        setIsAdmin(authorizedEmails.includes(userEmail));
      } else {
        setIsAdmin(false);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  /**
   * Triggers the Google Sign-In popup flow.
   */
  const login = async () => {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Google login flow error:', error);
      setLoading(false);
      throw error;
    }
  };

  /**
   * Signs the current user out of the application.
   */
  const logout = async () => {
    setLoading(true);
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Firebase sign-out error:', error);
      setLoading(false);
      throw error;
    }
  };

  return {
    user,
    loading,
    isAdmin,
    login,
    logout,
  };
}
