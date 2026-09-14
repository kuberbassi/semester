import React, { useCallback, useState, useEffect } from 'react';
import { usePageMeta } from '@/hooks/usePageMeta';
import { motion, AnimatePresence } from 'framer-motion';
import {
    User,
    Activity, Camera,
    GraduationCap,
    Mail, Hash, Sun, Moon
} from 'lucide-react';
import Loader from '@/components/ui/Loader';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useSemester } from '@/contexts/semester-context';
import Select from '@/components/ui/Select';
import { useToast } from '@/components/ui/toast-context';
import { attendanceService } from '@/services/attendance.service';
import { authService } from '@/services/auth.service';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import SystemLogsSection from '@/components/settings/SystemLogsSection';
import SettingsDataSection from '@/components/settings/SettingsDataSection';
import SessionsSection from '@/components/settings/SessionsSection';

import { useConfirm } from '@/contexts/confirm-context';
import { getErrorMessage } from '@/utils/errors';

type TabKey = 'profile' | 'activity' | 'data' | 'sessions';

const Settings: React.FC = () => {
    const confirm = useConfirm();
    const { user, logout, setUser } = useAuth();
    const { theme, toggleTheme, setAccentColor } = useTheme();
    const { currentSemester, setCurrentSemester } = useSemester();
    const { showToast } = useToast();

    usePageMeta({
        title: 'Settings | Semester',
        description: 'Manage your Semester profile, preferences, semester settings, and account data.',
    });

    const [activeTab, setActiveTab] = useState<TabKey>('profile');
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [isUploadingPfp, setIsUploadingPfp] = useState(false);
    const [dashboardStats, setDashboardStats] = useState<{ attendance: number; totalSubjects: number } | null>(null);

    const [name, setName] = useState(user?.name || '');
    const [profileForm, setProfileForm] = useState({
        course: '', branch: '', college: '', semester: 1, batch: '', picture: '', enrollment_number: '',
        attendance_threshold: 75, warning_threshold: 76,
        
    });

    useEffect(() => {
        if (user) {
            setProfileForm({
                course: user.course || '', branch: user.branch || '', college: user.college || '',
                semester: user.semester || user.current_semester || 1, batch: user.batch || '',
                picture: user.picture || '', enrollment_number: user.enrollment_number || '',
                attendance_threshold: user.attendance_threshold || 75,
                warning_threshold: user.warning_threshold || 76,
                
            });
            setName(user.name);
        }
    }, [user]);

    useUnsavedChanges(isEditingProfile);

    const loadDashboardStats = useCallback(async () => {
        try {
            const data = await attendanceService.getDashboardData(currentSemester);
            setDashboardStats({ attendance: data.overall_attendance || 0, totalSubjects: data.total_subjects || 0 });
        } catch { /* ignore */ }
    }, [currentSemester]);

    const loadPreferences = useCallback(async () => {
        try {
            const prefs = await attendanceService.getPreferences();
            if (prefs && prefs.accent_color) setAccentColor(prefs.accent_color);
        } catch { /* ignore */ }
    }, [setAccentColor]);

    useEffect(() => {
        void loadPreferences();
        void loadDashboardStats();
    }, [loadPreferences, loadDashboardStats]);

    const handleProfileSave = async () => {
        try {
            const { picture, ...profileFormData } = profileForm;
            void picture;
            await attendanceService.updateProfile({ name, ...profileFormData });

            if (profileForm.attendance_threshold || profileForm.warning_threshold) {
                await attendanceService.updatePreferences({
                    attendance_threshold: profileForm.attendance_threshold,
                    warning_threshold: profileForm.warning_threshold,
                }).catch(() => { /* non-critical */ });
            }

            try {
                const freshProfile = await attendanceService.getProfile();
                if (freshProfile && user) {
                    const updatedUser = { ...user, ...freshProfile };
                    authService.storeUser(updatedUser);
                    setUser(updatedUser);
                    setCurrentSemester(freshProfile.current_semester || freshProfile.semester || profileForm.semester);
                }
            } catch {
                if (user) {
                    const updatedUser = { ...user, name, ...profileForm };
                    authService.storeUser(updatedUser); setUser(updatedUser); setCurrentSemester(profileForm.semester);
                }
            }

            setIsEditingProfile(false); showToast('success', 'Profile Updated');
        } catch { showToast('error', 'Save Failed'); }
    };

    const handleDeleteAllData = async () => {
        const isConfirmed = await confirm({
            title: 'Wipe All Data',
            message: '⚠️ IRREVERSIBLE ACTION: Delete all records? This will purge all your attendance logs, subjects, timetable, notes, and task checklists. To proceed, please type DELETE below.',
            requireDeleteText: true,
            confirmText: 'Purge Everything'
        });
        if (!isConfirmed) return;

        try {
            showToast('info', 'Creating safety backup...');
            const backupRes = await attendanceService.createBackup();
            if (!backupRes?.backup_id) {
                showToast('error', 'Backup failed. Aborting wipe for safety.');
                return;
            }

            await attendanceService.deleteAllData(user?.email || '', backupRes.backup_id);
            attendanceService.clearAllLocalCaches();
            showToast('success', 'Data Purged');
            setTimeout(() => window.location.reload(), 1500);
        } catch (err: unknown) {
            console.error(err);
            showToast('error', getErrorMessage(err, 'Purge Failed'));
        }
    };

    const handleDeleteAccount = async () => {
        if (!user?.email) { showToast('error', 'Account email unavailable'); return; }
        const isConfirmed = await confirm({
            title: 'Delete Account Permanently',
            message: '⚠️ CRITICAL WARNING: Delete your account permanently? This removes all access, academic logs, skills progress, course data, and linked accounts. To proceed, please type DELETE below.',
            requireDeleteText: true,
            confirmText: 'Delete Account'
        });
        if (!isConfirmed) return;

        try {
            await authService.deleteAccount(user.email);
            showToast('success', 'Account deleted');
            setTimeout(() => { window.location.href = '/login'; }, 800);
        } catch (err: unknown) {
            console.error(err);
            showToast('error', getErrorMessage(err, 'Account deletion failed'));
        }
    };

    const tabs: { key: TabKey; label: string }[] = [
        { key: 'profile', label: 'Profile' },
        { key: 'activity', label: 'Activity' },
        { key: 'sessions', label: 'Sessions' },
        { key: 'data', label: 'Data' },
    ];

    const inputCls = "w-full px-3 py-2.5 rounded-lg border border-outline bg-surface text-on-surface text-sm placeholder-on-surface-variant/30 focus:outline-none focus:border-on-surface/40 focus:ring-1 focus:ring-on-surface/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed";

    return (
        <div className="max-w-3xl mx-auto pb-36">
            {/* Page Header */}
            <div className="mb-8">
                <div className="flex justify-between items-center">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40 mb-2">
                            Account / Settings
                        </p>
                        <h1 className="text-2xl font-bold text-on-surface tracking-tight">Settings</h1>
                        <p className="text-xs text-on-surface-variant/60 mt-1">
                            💡 Tip: Pressing <kbd className="px-1.5 py-0.5 rounded bg-surface-container border border-outline text-[10px] font-mono font-bold">Shift + /</kbd> (or <kbd className="px-1.5 py-0.5 rounded bg-surface-container border border-outline text-[10px] font-mono font-bold">?</kbd>) anywhere will display all quick keyboard navigation shortcuts.
                        </p>
                    </div>
                    <button
                        onClick={toggleTheme}
                        className="flex items-center justify-center w-9 h-9 rounded-lg border border-outline bg-surface text-on-surface hover:bg-surface-container transition-all cursor-pointer shadow-sm"
                        title="Toggle Theme"
                    >
                        {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
                    </button>
                </div>
                <div className="mt-4 h-px bg-outline" />
            </div>

            {/* Profile Hero — compact */}
            <div className="flex items-center gap-5 p-5 rounded-xl border border-outline bg-surface mb-6">
                {/* Avatar */}
                <div className="relative group flex-shrink-0">
                    <div className="w-14 h-14 rounded-xl overflow-hidden bg-surface-container border border-outline">
                        {user?.picture ? (
                            <img src={user.picture} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-xl font-bold text-on-surface-variant/50">
                                {(user?.name || 'P').charAt(0)}
                            </div>
                        )}
                        {isEditingProfile && (
                            <label className={`absolute inset-0 bg-black/60 flex items-center justify-center cursor-pointer transition-opacity rounded-xl ${isUploadingPfp ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                {isUploadingPfp ? <Loader size={16} /> : <Camera size={18} className="text-white" />}
                                <input type="file" accept="image/*" className="hidden" disabled={isUploadingPfp} onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    const objectUrl = URL.createObjectURL(file);
                                    const backupPicture = user?.picture;
                                    setUser({ ...user!, picture: objectUrl });
                                    setProfileForm({ ...profileForm, picture: objectUrl });
                                    setIsUploadingPfp(true);
                                    try {
                                        const fd = new FormData(); fd.append('file', file);
                                        const res = await attendanceService.uploadPfp(fd);
                                        setProfileForm(prev => ({ ...prev, picture: res.url }));
                                        const finalUser = { ...user!, picture: res.url };
                                        authService.storeUser(finalUser); setUser(finalUser);
                                        showToast('success', 'Photo updated');
                                    } catch {
                                        setUser({ ...user!, picture: backupPicture || '' });
                                        setProfileForm(prev => ({ ...prev, picture: backupPicture || '' }));
                                        showToast('error', 'Upload failed');
                                    } finally {
                                        setIsUploadingPfp(false);
                                        URL.revokeObjectURL(objectUrl);
                                    }
                                }} />
                            </label>
                        )}
                    </div>
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                        <p className="font-semibold text-on-surface text-sm truncate">{user?.name || 'Student'}</p>
                        <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded border border-outline text-on-surface-variant/50">Active</span>
                    </div>
                    <p className="text-xs text-on-surface-variant/50 flex items-center gap-1.5 truncate">
                        <Mail size={11} /> {user?.email}
                    </p>
                    <p className="text-xs text-on-surface-variant/30 flex items-center gap-1.5 mt-0.5 font-mono">
                        <Hash size={11} /> {user?.enrollment_number || '—'}
                    </p>
                </div>
                {/* Stats */}
                <div className="hidden sm:flex flex-col gap-1.5 text-right flex-shrink-0">
                    <div className="flex items-center gap-1.5 justify-end text-xs text-on-surface-variant/50">
                        <Activity size={11} />
                        <span>{dashboardStats?.attendance.toFixed(1) ?? '—'}% attendance</span>
                    </div>
                    <div className="flex items-center gap-1.5 justify-end text-xs text-on-surface-variant/50">
                        <GraduationCap size={11} />
                        <span>Semester {user?.semester || currentSemester}</span>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-0 border-b border-outline mb-8 overflow-x-auto no-scrollbar">
                {tabs.map(t => (
                    <button
                        key={t.key}
                        onClick={() => setActiveTab(t.key)}
                        className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap cursor-pointer ${
                            activeTab === t.key
                                ? 'border-on-surface text-on-surface'
                                : 'border-transparent text-on-surface-variant/40 hover:text-on-surface-variant hover:border-outline'
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                >
                    {/* PROFILE TAB */}
                    {activeTab === 'profile' && (
                        <div className="space-y-0 border border-outline rounded-xl overflow-hidden">
                            {/* Section header */}
                            <div className="flex items-center justify-between px-5 py-4 border-b border-outline bg-surface-container/50">
                                <div className="flex items-center gap-2">
                                    <User size={14} className="text-on-surface-variant/50" />
                                    <span className="text-xs font-semibold text-on-surface">Profile Info</span>
                                </div>
                                <button
                                    onClick={() => isEditingProfile ? handleProfileSave() : setIsEditingProfile(true)}
                                    className={`h-7 px-3 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                                        isEditingProfile
                                            ? 'bg-on-surface text-surface'
                                            : 'border border-outline bg-surface text-on-surface hover:bg-surface-container'
                                    }`}
                                >
                                    {isEditingProfile ? 'Save' : 'Edit'}
                                </button>
                            </div>

                            <div className="p-5 space-y-5">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[11px] font-medium text-on-surface-variant/50 mb-1.5">Full Name</label>
                                        <input value={name} onChange={e => setName(e.target.value)} disabled={!isEditingProfile} className={inputCls} />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-medium text-on-surface-variant/50 mb-1.5">Enrollment Number</label>
                                        <input value={profileForm.enrollment_number} onChange={e => setProfileForm({ ...profileForm, enrollment_number: e.target.value })} disabled={!isEditingProfile} className={inputCls} placeholder="00000000000" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[11px] font-medium text-on-surface-variant/50 mb-1.5">College</label>
                                    <input value={profileForm.college} onChange={e => setProfileForm({ ...profileForm, college: e.target.value })} disabled={!isEditingProfile} className={inputCls} />
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div>
                                        <label className="block text-[11px] font-medium text-on-surface-variant/50 mb-1.5">Course</label>
                                        <input value={profileForm.course} onChange={e => setProfileForm({ ...profileForm, course: e.target.value })} disabled={!isEditingProfile} className={inputCls} placeholder="B.Tech" />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-medium text-on-surface-variant/50 mb-1.5">Branch</label>
                                        <input value={profileForm.branch} onChange={e => setProfileForm({ ...profileForm, branch: e.target.value })} disabled={!isEditingProfile} className={inputCls} placeholder="CSE" />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-medium text-on-surface-variant/50 mb-1.5">Batch</label>
                                        <input value={profileForm.batch} onChange={e => setProfileForm({ ...profileForm, batch: e.target.value })} disabled={!isEditingProfile} className={inputCls} />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-medium text-on-surface-variant/50 mb-1.5">Semester</label>
                                        <Select
                                            value={profileForm.semester}
                                            options={[1, 2, 3, 4, 5, 6, 7, 8].map(s => ({ value: s, label: `Sem ${s}` }))}
                                            disabled={!isEditingProfile}
                                            onChange={e => setProfileForm({ ...profileForm, semester: parseInt(e.target.value) })}
                                        />
                                    </div>
                                </div>
                            </div>


                            {/* Thresholds section */}
                            <div className="border-t border-outline">
                                <div className="flex items-center gap-2 px-5 py-3 border-b border-outline bg-surface-container/30">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40">Attendance Targets</span>
                                </div>
                                <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <div className="flex justify-between mb-2">
                                            <label className="text-[11px] font-medium text-on-surface-variant/50">Goal</label>
                                            <span className="text-xs font-bold text-on-surface">{profileForm.attendance_threshold}%</span>
                                        </div>
                                        <input type="range" min="50" max="100" value={profileForm.attendance_threshold} onChange={e => setProfileForm({ ...profileForm, attendance_threshold: parseInt(e.target.value) })} disabled={!isEditingProfile} className="w-full accent-primary h-1 bg-on-surface/15 rounded-full appearance-none cursor-pointer disabled:opacity-50" />
                                    </div>
                                    <div>
                                        <div className="flex justify-between mb-2">
                                            <label className="text-[11px] font-medium text-on-surface-variant/50">Warning</label>
                                            <span className="text-xs font-bold text-red-500">{profileForm.warning_threshold}%</span>
                                        </div>
                                        <input type="range" min="50" max="100" value={profileForm.warning_threshold} onChange={e => setProfileForm({ ...profileForm, warning_threshold: parseInt(e.target.value) })} disabled={!isEditingProfile} className="w-full accent-red-500 h-1 bg-on-surface/15 rounded-full appearance-none cursor-pointer disabled:opacity-50" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ACTIVITY TAB */}
                    {activeTab === 'activity' && <SystemLogsSection />}

                    {/* SESSIONS TAB */}
                    {activeTab === 'sessions' && <SessionsSection showToast={showToast} />}

                    {/* DATA TAB */}
                    {activeTab === 'data' && (
                        <SettingsDataSection
                            onLogout={logout}
                            onDeleteAllData={handleDeleteAllData}
                            onDeleteAccount={handleDeleteAccount}
                            showToast={showToast}
                        />
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    );
};

export default Settings;

