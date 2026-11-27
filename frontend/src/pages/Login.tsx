import React, { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { usePageMeta } from '@/hooks/usePageMeta';
import { getCopyrightYears } from '@/utils/copyright';
import { Sun, Moon, ArrowLeft, Terminal } from 'lucide-react';
import { getErrorMessage } from '@/utils/errors';
import BrandLogo from '@/components/ui/BrandLogo';

const Login: React.FC = () => {
    const { loginWithGoogle, loginAsDevTestUser } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const [error, setError] = useState<string | null>(null);

    usePageMeta({
        title: 'Semester | Student Center',
        description: 'Sign in to Semester — your all-in-one student workspace for IPU. Track attendance, sync results, manage timetables, and develop your skills.',
        indexable: false,
    });

    return (
        <div className="min-h-screen w-full flex flex-col justify-between items-center relative overflow-hidden bg-background text-on-background font-sans py-8">
            {/* Subtle Ambient Orbs */}
            <div className="pointer-events-none fixed inset-0 overflow-hidden z-0" aria-hidden="true">
                <div
                    className="aurora-orb-1 absolute -top-24 -left-24 w-[480px] h-[480px] rounded-full opacity-[0.20] dark:opacity-[0.12]"
                    style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.52) 0%, transparent 70%)' }}
                />
                <div
                    className="aurora-orb-2 absolute bottom-[-120px] -right-24 w-[480px] h-[480px] rounded-full opacity-[0.18] dark:opacity-[0.10]"
                    style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.50) 0%, transparent 70%)' }}
                />
            </div>

            {/* Floating Top Header / Theme Toggle & Navigation */}
            <header className="w-full max-w-7xl px-6 flex justify-between items-center z-10">
                <Link
                    to="/"
                    className="no-fluid flex items-center gap-2 text-xs font-semibold text-on-surface-variant hover:text-on-surface transition-colors duration-200"
                >
                    <ArrowLeft size={14} />
                    <span>Back to Home</span>
                </Link>
                <button
                    onClick={toggleTheme}
                    className="no-fluid w-9 h-9 flex items-center justify-center rounded-2xl border border-on-surface/10 bg-surface/80 dark:bg-white/[0.06] hover:bg-primary/15 text-on-surface-variant hover:text-primary transition-all duration-200 cursor-pointer"
                    title="Toggle theme"
                >
                    {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                </button>
            </header>

            {/* Main Login Card Container */}
            <main className="flex-1 flex items-center justify-center w-full max-w-md px-4 z-10 my-8">
                <motion.div
                    initial={{ opacity: 0, y: 14, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    className="w-full text-center rounded-[28px] liquid-glass overflow-hidden select-none"
                >
                    <div className="h-[3px] w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400" />

                    <div className="p-8 md:p-10">
                        {/* Refreshed Brand Logo */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.92 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.06, duration: 0.3 }}
                            className="mb-6 flex justify-center"
                        >
                            <BrandLogo size={64} className="drop-shadow-[0_12px_22px_rgba(79,70,229,0.45)]" />
                        </motion.div>

                        {/* Branding Titles */}
                        <motion.div
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.12, duration: 0.3 }}
                            className="mb-7"
                        >
                            <h1 className="font-display text-3xl font-extrabold gradient-text tracking-tight mb-1.5">
                                Semester
                            </h1>
                            <p className="text-[11px] text-primary font-bold tracking-[0.16em] uppercase">
                                Student Workspace
                            </p>
                            <p className="text-xs text-on-surface-variant mt-2 font-medium">
                                Sign in with your Google account to sync your workspace
                            </p>
                        </motion.div>

                        {/* Google Login Component */}
                        <motion.div
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.18, duration: 0.3 }}
                            className="flex flex-col items-center gap-4 relative z-20"
                        >
                            <div className="hover:scale-[1.01] transition-transform duration-200">
                                <GoogleLogin
                                    onSuccess={async (credentialResponse) => {
                                        setError(null);
                                        try {
                                            if (!credentialResponse.credential) throw new Error('No credential received');
                                            await loginWithGoogle(credentialResponse.credential);
                                        } catch (err: unknown) {
                                            console.error('Backend login failed:', err);
                                            const errMsg = getErrorMessage(err, 'Login failed. Please try again.');
                                            setError(errMsg);
                                        }
                                    }}
                                    onError={() => {
                                        console.error('Google Login Failed');
                                        setError('Auth provider failed. Please try again.');
                                    }}
                                    theme={theme === 'dark' ? 'filled_black' : 'outline'}
                                    size="large"
                                    width={280}
                                    text="continue_with"
                                    shape="circle"
                                />
                            </div>
                            {error && (
                                <motion.p
                                    initial={{ opacity: 0, y: -6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="text-rose-500 text-xs font-semibold mt-1 bg-rose-500/10 border border-rose-500/20 py-2.5 px-4 rounded-2xl w-full text-center"
                                >
                                    {error}
                                </motion.p>
                            )}

                            <div className="w-full flex items-center gap-3 my-1">
                                <div className="flex-1 h-px bg-on-surface/10" />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/70">Local Preview</span>
                                <div className="flex-1 h-px bg-on-surface/10" />
                            </div>

                            <button
                                type="button"
                                onClick={() => {
                                    if (loginAsDevTestUser) {
                                        loginAsDevTestUser();
                                    }
                                }}
                                className="no-fluid w-full h-11 flex items-center justify-center gap-2 px-5 rounded-full btn-gradient font-bold text-xs cursor-pointer"
                            >
                                <Terminal size={14} />
                                <span>Enter Dev Test Mode</span>
                            </button>
                            <p className="text-[11px] text-on-surface-variant/75 -mt-1.5">
                                Offline mock workspace with live radar, timetable, notes &amp; results
                            </p>
                        </motion.div>

                        {/* Policies Agreement Info */}
                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.25, duration: 0.3 }}
                            className="mt-8 text-[11px] font-medium text-on-surface-variant/65 leading-relaxed pt-5 border-t border-on-surface/[0.08]"
                        >
                            By signing in, you accept the{' '}
                            <a href="/terms" className="text-on-surface-variant hover:text-primary transition-colors underline underline-offset-4 font-semibold">Terms of Service</a>
                            {' '}&amp;{' '}
                            <a href="/privacy" className="text-on-surface-variant hover:text-primary transition-colors underline underline-offset-4 font-semibold">Privacy Policy</a>
                        </motion.p>
                    </div>
                </motion.div>
            </main>

            {/* Footer */}
            <footer className="w-full max-w-7xl px-6 z-10">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-on-surface/[0.08]">
                    <p className="text-[11px] text-on-surface-variant/60 font-medium">
                        &copy; {getCopyrightYears(2025)} Semester &mdash; built by{' '}
                        <a
                            href="https://kuberbassi.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="glow-link font-semibold transition-all duration-300 hover:text-primary"
                        >
                            Kuber Bassi
                        </a>
                    </p>
                    <div className="flex gap-4">
                        <a href="/terms" className="text-[11px] text-on-surface-variant/60 hover:text-on-surface hover:underline transition-colors font-medium">Terms</a>
                        <a href="/privacy" className="text-[11px] text-on-surface-variant/60 hover:text-on-surface hover:underline transition-colors font-medium">Privacy</a>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default Login;
