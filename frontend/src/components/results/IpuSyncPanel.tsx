import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck, Landmark, Eye, EyeOff, Lock, User } from 'lucide-react';
import { desktopDb, type IpuCaptchaSession } from '@/services/desktopDb';
import { useToast } from '@/components/ui/toast-context';
import { useAuth } from '@/contexts/auth-context';
import { getErrorMessage } from '@/utils/errors';

/**
 * Direct IPU ExamWeb Portal Sync (examweb.ggsipu.ac.in):
 * - Fetches live session cookies & CAPTCHA image directly from the portal
 * - User always solves the CAPTCHA manually (zero OCR or bypass)
 * - Hashes password identically to the portal's live crypt.js before POSTing
 * - Concurrently fetches all published semesters and saves them offline to SQLite
 */
const IpuSyncPanel: React.FC<{ onDone: () => void | Promise<void> }> = ({ onDone }) => {
    const { showToast } = useToast();
    const { user, setUser } = useAuth();
    const [enrollment, setEnrollment] = useState(user?.enrollment_number || '');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [captcha, setCaptcha] = useState('');
    const [session, setSession] = useState<IpuCaptchaSession | null>(null);
    const [loadingCaptcha, setLoadingCaptcha] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!enrollment && user?.enrollment_number) {
            setEnrollment(user.enrollment_number);
        }
    }, [user?.enrollment_number]);

    const loadCaptcha = useCallback(async (preserveError = false) => {
        setLoadingCaptcha(true);
        if (!preserveError) setError(null);
        setCaptcha('');
        try {
            const res = await desktopDb.ipuFetchCaptcha();
            setSession(res);
        } catch (err) {
            setSession(null);
            if (!preserveError) {
                const msg = getErrorMessage(
                    err,
                    'Could not reach examweb.ggsipu.ac.in. Check your internet connection and retry.'
                );
                setError(msg);
            }
        } finally {
            setLoadingCaptcha(false);
        }
    }, []);

    useEffect(() => {
        void loadCaptcha(false);
    }, [loadCaptcha]);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!session || syncing) return;
        if (!enrollment.trim() || !password || !captcha.trim()) {
            setError('Please enter your enrollment number, password, and the CAPTCHA text.');
            return;
        }
        setSyncing(true);
        setError(null);
        try {
            await desktopDb.ipuSyncResults({
                enrollmentNumber: enrollment.trim(),
                password,
                captcha: captcha.trim(),
                hiddenFields: session.hidden_fields,
                fieldNames: session.field_names,
                loginAction: session.login_action,
                hashPassword: session.hash_password,
            });
            try {
                const freshProfile = await desktopDb.getProfile();
                if (freshProfile) setUser(freshProfile);
            } catch {
                // non-critical profile refresh
            }
            showToast('success', 'All published IPU semesters synced & saved offline');
            setPassword('');
            setCaptcha('');
            await onDone();
        } catch (err) {
            const msg = getErrorMessage(err, 'Portal sync failed. Verify your credentials and case-sensitive CAPTCHA.');
            setError(msg);
            showToast('error', msg);
            void loadCaptcha(true);
        } finally {
            setSyncing(false);
        }
    };

    const field =
        'w-full h-11 px-4 rounded-2xl border border-on-surface/[0.11] bg-on-surface/[0.04] text-on-surface text-xs font-medium placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all';

    return (
        <form onSubmit={submit} className="liquid-glass rounded-[28px] overflow-hidden">
            <div className="h-[2.5px] w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400" />
            <div className="p-6 sm:p-8 space-y-5">
                <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500/18 to-cyan-500/18 border border-primary/25 flex items-center justify-center text-primary shrink-0">
                        <Landmark size={22} />
                    </div>
                    <div>
                        <h2 className="font-display text-lg font-extrabold text-on-surface tracking-tight">
                            Sync from IPU ExamWeb Portal
                        </h2>
                        <p className="text-xs text-on-surface-variant/75 mt-0.5">
                            Sign in once to fetch every published semester and view your results offline anytime.
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                        <label className="block text-[11px] font-semibold text-on-surface-variant mb-1.5 ml-1">
                            Enrollment Number
                        </label>
                        <div className="relative">
                            <User size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant/50 pointer-events-none" />
                            <input
                                className={`${field} pl-9 font-mono`}
                                placeholder="e.g. 04216403223"
                                inputMode="numeric"
                                value={enrollment}
                                onChange={(e) => setEnrollment(e.target.value)}
                                required
                                autoComplete="off"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-[11px] font-semibold text-on-surface-variant mb-1.5 ml-1">
                            ExamWeb Password
                        </label>
                        <div className="relative">
                            <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant/50 pointer-events-none" />
                            <input
                                className={`${field} pl-9 pr-10`}
                                placeholder="Portal password"
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                autoComplete="off"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((v) => !v)}
                                className="no-fluid absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full text-on-surface-variant/65 hover:text-on-surface flex items-center justify-center cursor-pointer"
                                title={showPassword ? 'Hide password' : 'Show password'}
                            >
                                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                        </div>
                    </div>
                </div>

                <div>
                    <div className="flex items-center justify-between mb-1.5 px-1">
                        <label className="text-[11px] font-semibold text-on-surface-variant">
                            Security Check (CAPTCHA)
                        </label>
                        <span className="text-[10px] font-semibold text-on-surface-variant/65">
                            Case-sensitive
                        </span>
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                        <div className="flex items-center gap-2 shrink-0">
                            <div className="h-12 w-[168px] rounded-2xl border border-on-surface/[0.12] bg-white flex items-center justify-center overflow-hidden px-2">
                                {loadingCaptcha ? (
                                    <span className="text-[11px] font-semibold text-slate-500 animate-pulse">
                                        Loading CAPTCHA…
                                    </span>
                                ) : session?.captcha_image ? (
                                    <img
                                        src={session.captcha_image}
                                        alt="IPU Portal CAPTCHA"
                                        className="h-10 max-w-full object-contain select-none"
                                    />
                                ) : (
                                    <span className="text-[11px] font-semibold text-rose-500">
                                        Click refresh
                                    </span>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => void loadCaptcha(false)}
                                disabled={loadingCaptcha || syncing}
                                className="no-fluid h-12 w-12 rounded-2xl border border-on-surface/[0.12] bg-on-surface/[0.04] hover:bg-primary/14 hover:border-primary/35 text-on-surface-variant hover:text-primary flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                                title="Load fresh CAPTCHA"
                            >
                                <RefreshCw size={15} className={loadingCaptcha ? 'animate-spin' : ''} />
                            </button>
                        </div>

                        <input
                            className={`${field} flex-1 font-mono tracking-wider`}
                            placeholder="Type the characters shown"
                            value={captcha}
                            onChange={(e) => setCaptcha(e.target.value)}
                            required
                            autoComplete="off"
                        />
                    </div>
                </div>

                {error && (
                    <div className="text-xs font-semibold text-rose-500 dark:text-rose-400 bg-rose-500/10 border border-rose-500/25 rounded-2xl px-4 py-3 leading-relaxed break-words">
                        {error}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={!session || syncing || loadingCaptcha}
                    data-tooltip="Authenticate directly with examweb.ggsipu.ac.in and save all semesters offline"
                    className="no-fluid w-full h-11 rounded-full btn-gradient text-xs font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                    {syncing ? (
                        <>
                            <RefreshCw size={14} className="animate-spin" />
                            <span>Signing in &amp; fetching all semesters…</span>
                        </>
                    ) : (
                        <span>Sign in &amp; Sync All Semesters</span>
                    )}
                </button>

                <div className="rounded-2xl bg-on-surface/[0.03] border border-on-surface/[0.07] px-4 py-3 text-[11px] text-on-surface-variant/75 flex items-start gap-2.5 leading-relaxed">
                    <ShieldCheck size={14} className="text-primary shrink-0 mt-0.5" />
                    <span>
                        Your password is hashed client-side exactly like <span className="font-mono text-on-surface/85">examweb.ggsipu.ac.in</span>, sent straight to the official university portal, and never saved. Synced results are stored permanently in your local database.
                    </span>
                </div>
            </div>
        </form>
    );
};

export default IpuSyncPanel;
