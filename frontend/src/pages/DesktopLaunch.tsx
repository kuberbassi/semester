import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Sun, Moon, ArrowRight, ShieldCheck, HardDrive, WifiOff, Cloud } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { usePageMeta } from '@/hooks/usePageMeta';
import { getCopyrightYears } from '@/utils/copyright';
import { getErrorMessage } from '@/utils/errors';
import BrandLogo from '@/components/ui/BrandLogo';
import ExternalLink from '@/components/ui/ExternalLink';

/**
 * Native full-screen desktop launch screen (replaces marketing Landing/Login in the Tauri app).
 * Both entries open the REAL local SQLite workspace — no mock data.
 */
const DesktopLaunch: React.FC = () => {
    const { loginWithGoogleDesktop, enterLocalWorkspace } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<'google' | 'local' | null>(null);

    usePageMeta({ title: 'Semester', description: 'Semester Desktop Workspace', indexable: false });

    const run = async (kind: 'google' | 'local') => {
        setError(null);
        setBusy(kind);
        try {
            if (kind === 'google') await loginWithGoogleDesktop?.();
            else await enterLocalWorkspace?.();
        } catch (err: unknown) {
            setError(getErrorMessage(err, kind === 'google' ? 'Google sign-in was cancelled or failed.' : 'Could not open the workspace.'));
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="min-h-screen w-full flex flex-col justify-between relative overflow-hidden bg-background text-on-background font-sans select-none">
            <div className="pointer-events-none fixed inset-0 overflow-hidden z-0" aria-hidden="true">
                <div className="absolute -top-28 -left-24 w-[560px] h-[560px] rounded-full opacity-[0.24] dark:opacity-[0.14]"
                    style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.55) 0%, rgba(59,130,246,0.22) 45%, transparent 72%)' }} />
                <div className="absolute top-[14%] -right-28 w-[560px] h-[560px] rounded-full opacity-[0.22] dark:opacity-[0.13]"
                    style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.52) 0%, rgba(56,189,248,0.22) 45%, transparent 72%)' }} />
            </div>

            <header className="relative z-10 w-full px-7 pt-6 flex items-center justify-between">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-on-surface/[0.04] border border-on-surface/[0.08] text-[11px] font-semibold text-on-surface-variant">
                    <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400" />
                    Semester Desktop
                </div>
                <button type="button" onClick={toggleTheme}
                    className="no-fluid w-9 h-9 rounded-full bg-surface/80 dark:bg-white/[0.06] border border-on-surface/[0.10] hover:border-primary/40 text-on-surface-variant hover:text-primary flex items-center justify-center transition-colors cursor-pointer"
                    title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
                    {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                </button>
            </header>

            <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-8">
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    className="w-full max-w-[460px] flex flex-col items-center text-center"
                >
                    <div className="relative mb-6">
                        <div className="absolute -inset-6 rounded-full opacity-30 blur-2xl pointer-events-none"
                            style={{ background: 'linear-gradient(135deg, #4f46e5, #06b6d4)' }} />
                        <BrandLogo size={78} className="relative drop-shadow-[0_14px_24px_rgba(79,70,229,0.48)]" />
                    </div>

                    <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight gradient-text leading-none">Semester</h1>
                    <p className="mt-3 text-sm text-on-surface-variant font-medium max-w-[340px] leading-relaxed">
                        Your native academic workspace for attendance, timetables, results, and study notes.
                    </p>

                    <div className="mt-8 w-full rounded-[28px] liquid-glass overflow-hidden">
                        <div className="h-[2.5px] w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400" />
                        <div className="p-6 sm:p-7 flex flex-col items-center gap-3">
                            <button type="button" disabled={busy !== null} onClick={() => void run('google')}
                                className="no-fluid group w-full h-11 px-6 rounded-full btn-gradient font-bold text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60">
                                <Cloud size={15} />
                                <span>{busy === 'google' ? 'Waiting for Google in your browser…' : 'Continue with Google & Auto-Sync'}</span>
                            </button>
                            <button type="button" disabled={busy !== null} onClick={() => void run('local')}
                                className="no-fluid group w-full h-11 px-6 rounded-full border border-on-surface/[0.14] bg-on-surface/[0.04] hover:bg-primary/12 hover:border-primary/35 text-on-surface font-bold text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 transition-colors">
                                <span>{busy === 'local' ? 'Opening…' : 'Open Local Workspace'}</span>
                                <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
                            </button>
                            <p className="text-[11px] text-on-surface-variant/70 leading-relaxed">
                                Google sync keeps desktop and mobile identical via your private Drive AppData folder. You can connect it later from Settings.
                            </p>
                            {error && (
                                <p className="text-rose-500 text-xs font-semibold bg-rose-500/10 border border-rose-500/20 py-2 px-3.5 rounded-2xl w-full text-center">{error}</p>
                            )}
                        </div>
                    </div>

                    <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-[11px] font-semibold text-on-surface-variant/75">
                        <span className="inline-flex items-center gap-1.5"><HardDrive size={12} className="text-primary" />Local SQLite</span>
                        <span className="opacity-30">·</span>
                        <span className="inline-flex items-center gap-1.5"><WifiOff size={12} className="text-cyan-500 dark:text-cyan-400" />Offline Ready</span>
                        <span className="opacity-30">·</span>
                        <span className="inline-flex items-center gap-1.5"><ShieldCheck size={12} className="text-violet-500 dark:text-violet-400" />Private by Default</span>
                    </div>
                </motion.div>
            </main>

            <footer className="relative z-10 w-full px-7 py-4 border-t border-on-surface/[0.06]">
                <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-on-surface-variant/55 font-medium">
                    <span>
                        &copy; {getCopyrightYears(2025)} Semester &middot; Built by{' '}
                        <ExternalLink href="https://kuberbassi.com" className="hover:text-primary transition-colors">Kuber Bassi</ExternalLink>
                    </span>
                    <div className="flex items-center gap-4">
                        <ExternalLink href="https://kuberbassi.com" className="hover:text-on-surface transition-colors">kuberbassi.com</ExternalLink>
                        <ExternalLink href="mailto:me@kuberbassi.com" className="hover:text-on-surface transition-colors">me@kuberbassi.com</ExternalLink>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default DesktopLaunch;
