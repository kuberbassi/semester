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
import UserAvatar from '@/components/ui/UserAvatar';
import { useAuth } from '@/contexts/auth-context';
import { isDevTestMode } from '@/utils/devTestData';
import { isTauriDesktop } from '@/utils/platform';
import { desktopDb } from '@/services/desktopDb';
import PageHeader from '@/components/ui/PageHeader';
import { Settings as SettingsIcon } from 'lucide-react';
import { useTheme } from '@/contexts/theme-context';
import { useSemester } from '@/contexts/semester-context';
import Select from '@/components/ui/Select';
import { WakeSlider, RubberSegment } from '@/components/react-bits';
import { useToast } from '@/components/ui/toast-context';
import { attendanceService } from '@/services/attendance.service';
import { authService } from '@/services/auth.service';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { useSearchParams } from 'react-router-dom';
import SystemLogsSection from '@/components/settings/SystemLogsSection';
import SettingsDataSection from '@/components/settings/SettingsDataSection';

import SettingsAISection from '@/components/settings/SettingsAISection';

import { useConfirm } from '@/contexts/confirm-context';
import { getErrorMessage } from '@/utils/errors';

type TabKey = 'profile' | 'ai' | 'activity' | 'data';

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

    const [searchParams, setSearchParams] = useSearchParams();
    const validTabs: TabKey[] = ['profile', 'ai', 'activity', 'data'];
    const initialTab = validTabs.includes(searchParams.get('tab') as TabKey) ? (searchParams.get('tab') as TabKey) : 'profile';
    const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
    useEffect(() => {
        const param = searchParams.get('tab') as TabKey | null;
        if (param && validTabs.includes(param) && param !== activeTab) setActiveTab(param);
    }, [searchParams]);
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
            if (isDevTestMode() && user) {
                const updatedUser = {
                    ...user,
                    name: name.trim() || user.name,
                    ...profileForm,
                    current_semester: profileForm.semester,
                };
                authService.storeUser(updatedUser);
                setUser(updatedUser);
                setCurrentSemester(profileForm.semester);
                setIsEditingProfile(false);
                showToast('success', 'Profile Updated');
                return;
            }

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
            title: 'Clear Academic Data',
            message: 'This erases your subjects, attendance logs, timetables, results, notes, and checklists while keeping your profile, Google Drive link, and AI keys. A safety snapshot is saved automatically. Type DELETE below to proceed.',
            requireDeleteText: true,
            confirmText: 'Clear Academic Data'
        });
        if (!isConfirmed) return;

        try {
            showToast('info', 'Creating safety backup...');
            const backupRes = await attendanceService.createBackup();
            if (!backupRes?.backup_id) {
                showToast('error', 'Backup failed. Aborting clear for safety.');
                return;
            }

            await attendanceService.deleteAllData(user?.email || '', backupRes.backup_id);
            attendanceService.clearAllLocalCaches();
            showToast('success', 'Academic data cleared');
            setTimeout(() => window.location.reload(), 1200);
        } catch (err: unknown) {
            console.error(err);
            showToast('error', getErrorMessage(err, 'Clear failed'));
        }
    };

    const handleDeleteAccount = async () => {
        if (!isTauriDesktop() && !user?.email) { showToast('error', 'Account email unavailable'); return; }
        const isConfirmed = await confirm({
            title: isTauriDesktop() ? 'Factory Reset App' : 'Delete Account Permanently',
            message: isTauriDesktop()
                ? 'This resets Semester back to a fresh install — clearing your profile, academic logs, results, courses, notes, Google Drive link, and saved AI keys. A safety snapshot is kept in app data. Type DELETE below to proceed.'
                : 'This permanently deletes your account and data. Type DELETE below to proceed.',
            requireDeleteText: true,
            confirmText: isTauriDesktop() ? 'Factory Reset' : 'Delete Account'
        });
        if (!isConfirmed) return;

        try {
            if (isTauriDesktop()) {
                await desktopDb.resetAccountCompletely();
                attendanceService.clearAllLocalCaches();
                localStorage.removeItem('semester_desktop_entered');
                localStorage.removeItem('user');
                setUser(null);
                showToast('success', 'App factory reset complete');
                setTimeout(() => { window.location.replace('/'); }, 700);
                return;
            }
            await authService.deleteAccount(user!.email);
            showToast('success', 'Account deleted');
            setTimeout(() => { window.location.href = '/login'; }, 800);
        } catch (err: unknown) {
            console.error(err);
            showToast('error', getErrorMessage(err, isTauriDesktop() ? 'Factory reset failed' : 'Account deletion failed'));
        }
    };

    const tabs: { key: TabKey; label: string }[] = [
        { key: 'profile', label: 'Profile' },
        ...(isTauriDesktop() ? [{ key: 'ai' as TabKey, label: 'AI & Keys' }] : []),
        { key: 'activity', label: 'Activity' },

        { key: 'data', label: 'Data' },
    ];

    const inputCls = "w-full h-10 px-3.5 rounded-xl border border-on-surface/[0.10] bg-on-surface/[0.04] text-on-surface text-xs font-medium placeholder:text-on-surface-variant/45 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all disabled:opacity-60 disabled:cursor-not-allowed";
    const displayName = (user?.name || 'Student').replace(/\s*\(Dev Mode\)/i, '').trim();

    return (
        <div className="w-full pb-12">
            <PageHeader
                title="Settings"
                icon={SettingsIcon}
                actions={
                    <button
                        onClick={toggleTheme}
                        className="no-fluid flex items-center justify-center w-9 h-9 rounded-full bg-on-surface/[0.06] border border-on-surface/[0.10] text-on-surface hover:bg-primary/15 hover:text-primary transition-all cursor-pointer"
                        title="Toggle Theme"
                    >
                        {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
                    </button>
                }
            />

            {/* Profile Hero — Unified Synced Avatar & Crisp Badges */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-5 p-5 sm:p-6 rounded-[24px] liquid-glass mb-6">
                {/* Avatar */}
                <div className="relative group shrink-0 self-start sm:self-auto">
                    <UserAvatar user={user} size={60} rounded="2xl" />
                    <label
                        title="Change profile photo"
                        className={`absolute inset-0 bg-black/55 flex items-center justify-center cursor-pointer transition-opacity rounded-2xl ${
                            isUploadingPfp ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        }`}
                    >
                        {isUploadingPfp ? <Loader size={18} /> : <Camera size={18} className="text-white" />}
                        <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={isUploadingPfp}
                            onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file || !user) return;
                                setIsUploadingPfp(true);

                                if (isDevTestMode() || isTauriDesktop()) {
                                    const reader = new FileReader();
                                    reader.onload = () => {
                                        const dataUrl = typeof reader.result === 'string' ? reader.result : '';
                                        if (dataUrl) {
                                            const finalUser = { ...user, picture: dataUrl };
                                            authService.storeUser(finalUser);
                                            setUser(finalUser);
                                            setProfileForm(prev => ({ ...prev, picture: dataUrl }));
                                            if (isTauriDesktop()) void attendanceService.updateProfile({ picture: dataUrl });
                                            showToast('success', 'Photo synced across app');
                                        }
                                        setIsUploadingPfp(false);
                                    };
                                    reader.onerror = () => {
                                        showToast('error', 'Could not read image');
                                        setIsUploadingPfp(false);
                                    };
                                    reader.readAsDataURL(file);
                                    e.target.value = '';
                                    return;
                                }

                                const objectUrl = URL.createObjectURL(file);
                                const backupPicture = user.picture;
                                setUser({ ...user, picture: objectUrl });
                                setProfileForm(prev => ({ ...prev, picture: objectUrl }));
                                try {
                                    const fd = new FormData();
                                    fd.append('file', file);
                                    const res = await attendanceService.uploadPfp(fd);
                                    setProfileForm(prev => ({ ...prev, picture: res.url }));
                                    const finalUser = { ...user, picture: res.url };
                                    authService.storeUser(finalUser);
                                    setUser(finalUser);
                                    showToast('success', 'Photo updated');
                                } catch {
                                    setUser({ ...user, picture: backupPicture || '' });
                                    setProfileForm(prev => ({ ...prev, picture: backupPicture || '' }));
                                    showToast('error', 'Upload failed');
                                } finally {
                                    setIsUploadingPfp(false);
                                    URL.revokeObjectURL(objectUrl);
                                    e.target.value = '';
                                }
                            }}
                        />
                    </label>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center flex-wrap gap-2 mb-1">
                        <p className="font-display font-extrabold text-on-surface text-lg tracking-tight truncate">
                            {displayName}
                        </p>
                        <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-gradient-to-r from-indigo-500/15 to-cyan-500/15 border border-primary/25 text-primary shrink-0">
                            Active
                        </span>
                        {isDevTestMode() && (
                            <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-on-surface/[0.06] border border-on-surface/[0.10] text-on-surface-variant shrink-0">
                                Local Workspace
                            </span>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-on-surface-variant">
                        <span className="inline-flex items-center gap-1.5 truncate">
                            <Mail size={12} className="text-primary/70 shrink-0" />
                            {user?.email}
                        </span>
                        <span className="inline-flex items-center gap-1.5 font-mono text-on-surface-variant/80">
                            <Hash size={12} className="text-primary/70 shrink-0" />
                            {user?.enrollment_number || '—'}
                        </span>
                    </div>
                </div>

                {/* Stats */}
                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-1.5 pt-3 sm:pt-0 border-t sm:border-t-0 border-on-surface/[0.08] shrink-0">
                    <div className="inline-flex items-center gap-1.5 text-xs font-bold text-primary">
                        <Activity size={13} />
                        <span className="tabular-nums">{dashboardStats?.attendance.toFixed(1) ?? '—'}% attendance</span>
                    </div>
                    <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant">
                        <GraduationCap size={13} />
                        <span>Semester {currentSemester}</span>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="mb-6 overflow-x-auto no-scrollbar">
                <RubberSegment<TabKey>
                    options={tabs.map(t => ({ id: t.key, label: t.label }))}
                    value={activeTab}
                    onChange={(tab) => { setActiveTab(tab); setSearchParams(tab === 'profile' ? {} : { tab }, { replace: true }); }}
                    size="md"
                    variant="white"
                    layoutId="settings-tabs-rubber"
                />
            </div>

            {/* Tab Content */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.14 }}
                >
                    {/* PROFILE TAB */}
                    {activeTab === 'profile' && (
                        <div className="liquid-glass rounded-[24px] overflow-hidden">
                            {/* Section header */}
                            <div className="flex items-center justify-between px-6 py-4 border-b border-on-surface/[0.08] bg-on-surface/[0.015]">
                                <div className="flex items-center gap-2.5">
                                    <span className="w-8 h-8 rounded-xl bg-primary/14 border border-primary/25 text-primary flex items-center justify-center">
                                        <User size={15} />
                                    </span>
                                    <div>
                                        <span className="font-display text-sm font-extrabold text-on-surface block leading-tight">Profile Details</span>
                                        <span className="text-[11px] text-on-surface-variant">Hover your avatar above to update photo anytime</span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => isEditingProfile ? handleProfileSave() : setIsEditingProfile(true)}
                                    className={`no-fluid h-8 px-4 text-xs font-bold rounded-full transition-all cursor-pointer ${
                                        isEditingProfile
                                            ? 'btn-gradient'
                                            : 'bg-surface/80 dark:bg-white/[0.06] border border-primary/25 text-on-surface hover:border-primary/45 hover:text-primary'
                                    }`}
                                >
                                    {isEditingProfile ? 'Save Changes' : 'Edit Profile'}
                                </button>
                            </div>

                            <div className="p-6 space-y-5">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[11px] font-semibold text-on-surface-variant mb-1.5 ml-0.5">Full Name</label>
                                        <input value={name} onChange={e => setName(e.target.value)} disabled={!isEditingProfile} className={inputCls} />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-semibold text-on-surface-variant mb-1.5 ml-0.5">Enrollment Number</label>
                                        <input value={profileForm.enrollment_number} onChange={e => setProfileForm({ ...profileForm, enrollment_number: e.target.value })} disabled={!isEditingProfile} className={inputCls} placeholder="00000000000" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[11px] font-semibold text-on-surface-variant mb-1.5 ml-0.5">College / Institution</label>
                                    <input value={profileForm.college} onChange={e => setProfileForm({ ...profileForm, college: e.target.value })} disabled={!isEditingProfile} className={inputCls} />
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div>
                                        <label className="block text-[11px] font-semibold text-on-surface-variant mb-1.5 ml-0.5">Course</label>
                                        <input value={profileForm.course} onChange={e => setProfileForm({ ...profileForm, course: e.target.value })} disabled={!isEditingProfile} className={inputCls} placeholder="B.Tech" />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-semibold text-on-surface-variant mb-1.5 ml-0.5">Branch</label>
                                        <input value={profileForm.branch} onChange={e => setProfileForm({ ...profileForm, branch: e.target.value })} disabled={!isEditingProfile} className={inputCls} placeholder="CSE" />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-semibold text-on-surface-variant mb-1.5 ml-0.5">Batch</label>
                                        <input value={profileForm.batch} onChange={e => setProfileForm({ ...profileForm, batch: e.target.value })} disabled={!isEditingProfile} className={inputCls} />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-semibold text-on-surface-variant mb-1.5 ml-0.5">Semester</label>
                                        <Select
                                            value={profileForm.semester}
                                            options={[1, 2, 3, 4, 5, 6, 7, 8].map(s => ({ value: s, label: `Sem ${s}` }))}
                                            disabled={!isEditingProfile}
                                            className="h-10 rounded-xl"
                                            onChange={e => setProfileForm({ ...profileForm, semester: parseInt(e.target.value) })}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Thresholds section */}
                            <div className="border-t border-on-surface/[0.08]">
                                <div className="flex items-center justify-between px-6 py-3.5 border-b border-on-surface/[0.06] bg-on-surface/[0.015]">
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Attendance Targets</span>
                                    <span className="text-[11px] font-medium text-on-surface-variant/65">
                                        {isEditingProfile ? 'Drag sliders to customize' : 'Click Edit Profile to adjust'}
                                    </span>
                                </div>
                                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <WakeSlider
                                        label="Goal Target"
                                        value={profileForm.attendance_threshold}
                                        min={50}
                                        max={100}
                                        step={1}
                                        unit="%"
                                        color="indigo"
                                        disabled={!isEditingProfile}
                                        onChange={val => setProfileForm({ ...profileForm, attendance_threshold: val })}
                                    />
                                    <WakeSlider
                                        label="Warning Threshold"
                                        value={profileForm.warning_threshold}
                                        min={50}
                                        max={100}
                                        step={1}
                                        unit="%"
                                        color="amber"
                                        disabled={!isEditingProfile}
                                        onChange={val => setProfileForm({ ...profileForm, warning_threshold: val })}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* AI & KEYS TAB */}
                    {activeTab === 'ai' && <SettingsAISection showToast={showToast} />}

                    {/* ACTIVITY TAB */}
                    {activeTab === 'activity' && <SystemLogsSection />}




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

