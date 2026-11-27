import React, { useState, useEffect, type ReactNode } from 'react';
import axios from 'axios';
import type { User } from '@/types';
import { authService } from '@/services/auth.service';
import { AuthContext, type AuthContextValue } from './auth-context';
import { isDevTestMode, DEV_TEST_USER, enableDevTestMode, disableDevTestMode } from '@/utils/devTestData';
import { isTauriDesktop } from '@/utils/platform';
import { desktopDb } from '@/services/desktopDb';

const DESKTOP_ENTERED_KEY = 'semester_desktop_entered';

const FETCH_COOLDOWN = 5 * 60 * 1000;

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const initAuth = async () => {
            if (isTauriDesktop()) {
                try {
                    if (localStorage.getItem(DESKTOP_ENTERED_KEY) === '1') {
                        const profile = await desktopDb.getProfile();
                        setUser(profile);
                        authService.storeUser(profile);
                        if (profile.current_semester && !localStorage.getItem('zenith_semester')) {
                            localStorage.setItem('zenith_semester', String(profile.current_semester));
                        }
                    }
                } catch (err) {
                    console.error('Failed to load local profile', err);
                } finally {
                    setLoading(false);
                }
                return;
            }

            if (isDevTestMode()) {
                const storedDev = authService.getStoredUser();
                const devUser = storedDev && (storedDev._id === 'dev-test-user-id' || storedDev.email === 'dev@semester.app')
                    ? { ...DEV_TEST_USER, ...storedDev }
                    : DEV_TEST_USER;
                authService.storeUser(devUser);
                setUser(devUser);
                setLoading(false);
                return;
            }

            const storedUser = authService.getStoredUser();
            if (storedUser) {
                if (storedUser._id === 'dev-test-user-id' || storedUser.email === 'dev@semester.app') {
                    const devUser = { ...DEV_TEST_USER, ...storedUser };
                    setUser(devUser);
                    setLoading(false);
                    return;
                }
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
    }, [isLoggedIn]); // primitive bool â€” only re-attaches on actual login/logout

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
                console.error('âŒ No user returned from backend');
                throw new Error('No user data received');
            }
        } catch (error) {
            console.error("âŒ Login failed:", error);
            throw error; // Re-throw so Login.tsx can catch it
        } finally {
            setLoading(false);
        }
    }

    const loginAsDevTestUser = () => {
        enableDevTestMode();
        const stored = authService.getStoredUser();
        const devUser = stored && (stored._id === 'dev-test-user-id' || stored.email === 'dev@semester.app')
            ? { ...DEV_TEST_USER, ...stored }
            : DEV_TEST_USER;
        authService.storeUser(devUser);
        if (!localStorage.getItem('zenith_semester') && devUser.current_semester) {
            localStorage.setItem('zenith_semester', String(devUser.current_semester));
        }
        setUser(devUser);
        setLoading(false);
    };

    const enterLocalWorkspace = async () => {
        const profile = await desktopDb.getProfile();
        localStorage.setItem(DESKTOP_ENTERED_KEY, '1');
        authService.storeUser(profile);
        setUser(profile);
    };

    const loginWithGoogleDesktop = async () => {
        const res = await desktopDb.googleOAuthConnect();
        const profile = await desktopDb.getProfile();
        localStorage.setItem(DESKTOP_ENTERED_KEY, '1');
        const merged = { ...profile, ...(res?.user || {}) } as User;
        authService.storeUser(merged);
        setUser(merged);
    };

    const logout = async () => {
        if (isTauriDesktop()) {
            localStorage.removeItem(DESKTOP_ENTERED_KEY);
            setUser(null);
            window.location.replace('/');
            return;
        }
        if (isDevTestMode()) {
            disableDevTestMode();
            setUser(null);
            window.location.href = '/';
            return;
        }
        await authService.logout();
        setUser(null);
    };

    const value: AuthContextValue = {
        user,
        isAuthenticated: !!user,
        loading,
        login,
        loginWithGoogle,
        loginWithGoogleDesktop,
        enterLocalWorkspace,
        loginAsDevTestUser: isTauriDesktop() ? undefined : loginAsDevTestUser,
        logout,
        setUser,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};