import React, { lazy, Suspense } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './queryClient';
import { Analytics as VercelAnalytics } from "@vercel/analytics/react";

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './contexts/auth-context';
import { ThemeProvider } from './contexts/ThemeContext';
import { SemesterProvider } from './contexts/SemesterContext';
import { ToastProvider } from './components/ui/Toast';
import { ConfirmProvider } from './contexts/ConfirmContext';
import LoadingSpinner from './components/ui/LoadingSpinner';
import ErrorBoundary from './components/ui/ErrorBoundary';
import './index.css';

// Hooks
import { useAutoUpdate } from './hooks/useAutoUpdate';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useHaptics } from './hooks/useHaptics';

// Layout
import PageTransition from './components/ui/PageTransition';

// Keep the landing page in the entry bundle and split everything else by route.
// This prevents dashboard-only editors, charts and PDF tools from delaying the
// public page's first render.
import Landing from './pages/Landing';
const AppLayout = lazy(() => import('./components/layout/AppLayout'));
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Settings = lazy(() => import('./pages/Settings'));
const Calendar = lazy(() => import('./pages/Calendar'));
const TimeTable = lazy(() => import('./pages/TimeTable'));
const Courses = lazy(() => import('./pages/Courses'));
const Practicals = lazy(() => import('./pages/Practicals'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const TermsOfService = lazy(() => import('./pages/TermsOfService'));
const NotFound = lazy(() => import('./pages/NotFound'));

// ── Route Guards ─────────────────────────────────────────────────────────────

const ProtectedRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <LoadingSpinner fullScreen />;
  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

const PublicRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <LoadingSpinner fullScreen />;
  return !isAuthenticated ? children : <Navigate to="/dashboard" replace />;
};

// ── Main App Routes ───────────────────────────────────────────────────────────

const AppRoutes: React.FC = () => {
  return (
    <Routes>

      {/* ── Public Routes ──────────────────────────────────── */}
      <Route
        path="/"
        element={
          <Landing />
        }
      />
      <Route
        path="/login"
        element={
          <PublicRoute>
            <PageTransition>
              <Login />
            </PageTransition>
          </PublicRoute>
        }
      />

      {/* ── Legal Pages ────────────────────────────────────── */}
      <Route
        path="/privacy"
        element={
          <PageTransition>
            <PrivacyPolicy />
          </PageTransition>
        }
      />
      <Route
        path="/terms"
        element={
          <PageTransition>
            <TermsOfService />
          </PageTransition>
        }
      />

      {/* ── 404 (outside AppLayout) ────────────────────────── */}
      <Route
        path="/404"
        element={
          <PageTransition>
            <NotFound />
          </PageTransition>
        }
      />

      {/* ── Protected Routes inside App Shell ──────────────── */}
      <Route element={<AppLayout />}>
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/timetable"
          element={
            <ProtectedRoute>
              <TimeTable />
            </ProtectedRoute>
          }
        />
        <Route
          path="/calendar"
          element={
            <ProtectedRoute>
              <Calendar />
            </ProtectedRoute>
          }
        />
        <Route
          path="/courses"
          element={
            <ProtectedRoute>
              <Courses />
            </ProtectedRoute>
          }
        />
        <Route
          path="/practicals"
          element={
            <ProtectedRoute>
              <Practicals />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />

      </Route>

      {/* ── Catch-all → 404 ────────────────────────────────── */}
      <Route
        path="*"
        element={
          <PageTransition>
            <NotFound />
          </PageTransition>
        }
      />

    </Routes>
  );
};

// ── Keyboard Shortcuts (needs BrowserRouter context) ─────────────────────────

const KeyboardShortcutsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useKeyboardShortcuts();
  return <>{children}</>;
};

// ── App Content ───────────────────────────────────────────────────────────────

const AppContent: React.FC = () => {
  useAutoUpdate();
  useHaptics();

  return (
    <div className="min-h-screen bg-background text-on-background font-sans transition-colors duration-300 selection:bg-primary-container selection:text-primary">
      <Suspense fallback={<LoadingSpinner fullScreen />}>
        <AppRoutes />
      </Suspense>
      {import.meta.env.PROD && !['localhost', '127.0.0.1'].includes(window.location.hostname) && <VercelAnalytics />}
    </div>
  );
};

// ── Root App ──────────────────────────────────────────────────────────────────

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'missing-client-id';

const App: React.FC = () => {
  if (GOOGLE_CLIENT_ID === 'missing-client-id') {
    console.warn('Missing VITE_GOOGLE_CLIENT_ID. Google Login will not work. Please configure the frontend environment before starting the app.');
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ThemeProvider>
            <AuthProvider>
              <SemesterProvider>
                <ToastProvider>
                  <ConfirmProvider>
                    <ErrorBoundary>
                      <KeyboardShortcutsProvider>
                        <AppContent />
                      </KeyboardShortcutsProvider>
                    </ErrorBoundary>
                  </ConfirmProvider>
                </ToastProvider>
              </SemesterProvider>
            </AuthProvider>
          </ThemeProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </GoogleOAuthProvider>
  );
};

export default App;

