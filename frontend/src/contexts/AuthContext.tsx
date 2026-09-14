import React, { useState, useEffect, type ReactNode } from 'react';
import axios from 'axios';
import type { User } from '@/types';
import { authService } from '@/services/auth.service';
import { AuthContext, type AuthContextValue } from './auth-context';

const FETCH_COOLDOWN = 5 * 60 * 1000;

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const initAuth = async () => {
            const storedUser = authService.getStoredUser();
            if (storedUser) {
                // Keep the cached identity provisional until the cookie-backed
                // session is verified. Protected routes stay gated by loading.
                setUser(storedUser);

                try {
                    const verifiedUser = await authService.getCurrentUser();
                    if (!verifiedUser) {
                        setUser(null);
                        authService.clearLocalSession();
                    } else {
                        // Update state AND storage with fresh data (e.g. new PFP)
                        setUser(verifiedUser);
                        authService.storeUser(verifiedUser);
                    }
                } catch (error: unknown) {
                    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
                    const code = axios.isAxiosError<{ code?: string }>(error) ? error.response?.data?.code : undefined;
                    const isSessionInvalid = status === 401 || status === 403 || code === 'TOKEN_EXPIRED' || code === 'TOKEN_INVALID' || code === 'REFRESH_INVALID' || code === 'REFRESH_EXPIRED';
                    
                    if (isSessionInvalid) {
                        console.warn('Session invalid/expired, logging out');
                        setUser(null);
                        authService.clearLocalSession();
                    } else {
                        console.warn('Failed to verify session on startup (network/server error). Keeping cached session.', error);
                    }
                } finally {
                    setLoading(false);
                }
            } else {
                setLoading(false);
            }
        };

        initAuth();
    }, []);

    // CRITICAL: Refetch user data when returning to the tab (Cross-Device Sync)
    // If user updates PFP on mobile, focusing the web tab will now update the header instantly.
    const lastFetchRef = React.useRef<number>(0);
    const isLoggedIn = !!user; // use primitive so effect doesn't re-attach on every user object change

    useEffect(() => {
        const handleFocus = async () => {
            const now = Date.now();
            // Only fetch if tab is visible, we are logged in, and cooldown has passed
            if (document.visibilityState === 'visible' && isLoggedIn && (now - lastFetchRef.current > FETCH_COOLDOWN)) {
                try {
                    lastFetchRef.current = now;
                    const freshUser = await authService.getCurrentUser();
                    if (freshUser) {
                        setUser(freshUser);
                        authService.storeUser(freshUser);
                    }
                } catch {
                    // Ignore errors on background check
                }
            }
        };

        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleFocus);

        return () => {
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('visibilitychange', handleFocus);
        };
    }, [isLoggedIn]); // primitive bool — only re-attaches on actual login/logout

    const login = () => {
        // Legacy login (redirect) - largely unused now
        authService.initiateLogin();
    };

    const loginWithGoogle = async (code: string) => {

        setLoading(true);
        try {
            const user = await authService.loginWithGoogle(code);

            if (user) {
                setUser(user);
                authService.storeUser(user);

            } else {
                console.error('❌ No user returned from backend');
                throw new Error('No user data received');
            }
        } catch (error) {
            console.error("❌ Login failed:", error);
            throw error; // Re-throw so Login.tsx can catch it
        } finally {
            setLoading(false);
        }
    }

    const logout = async () => {
        await authService.logout();
        setUser(null);
    };

    const value: AuthContextValue = {
        user,
        isAuthenticated: !!user,
        loading,
        login,
        loginWithGoogle,
        logout,
        setUser,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
