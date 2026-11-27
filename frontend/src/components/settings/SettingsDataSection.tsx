import React, { useState, useEffect } from 'react';
import { Download, Shield, ShieldAlert, Upload, Copy, Check, Cloud, RefreshCw, Unlink } from 'lucide-react';
import { useGoogleLogin } from '@react-oauth/google';
import Select from '@/components/ui/Select';
import { attendanceService } from '@/services/attendance.service';
import { useConfirm } from '@/contexts/confirm-context';
import { getErrorMessage } from '@/utils/errors';
import type { DriveBackup, DriveStatus } from '@/types';
import { HoldButton } from '@/components/react-bits/HoldButton';
import { isTauriDesktop } from '@/utils/platform';
import DesktopDriveSyncCard from './DesktopDriveSyncCard';
import { desktopDb } from '@/services/desktopDb';
import { authService } from '@/services/auth.service';

type SettingsDataSectionProps = {
    onLogout: () => void | Promise<void>;
    onDeleteAllData: () => void | Promise<void>;
    onDeleteAccount: () => void | Promise<void>;
    showToast: (type: 'success' | 'error' | 'warning' | 'info', message: string) => void;
};

const SettingsDataSection: React.FC<SettingsDataSectionProps> = ({ onLogout, onDeleteAllData, onDeleteAccount, showToast }) => {
    const confirm = useConfirm();
    const [migrationKey, setMigrationKey] = useState('');
    const [copied, setCopied] = useState(false);
    const [inputKey, setInputKey] = useState('');
    const [migrating, setMigrating] = useState(false);

    // Google Drive Sync states
    const [driveStatus, setDriveStatus] = useState<DriveStatus | null>(null);
    const [driveBackups, setDriveBackups] = useState<DriveBackup[]>([]);
    const [driveLoading, setDriveLoading] = useState(false);

    const fetchDriveStatus = async () => {
        try {
            const status = await attendanceService.getDriveStatus();
            setDriveStatus(status);
            if (status.google_drive_linked) {
                const backupsRes = await attendanceService.listDriveBackups();
                setDriveBackups(backupsRes.backups || []);
            }
        } catch (err) {
            console.error('Failed to fetch Google Drive status:', err);
        }
    };

    useEffect(() => {
        fetchDriveStatus();
    }, []);

    const linkDrive = useGoogleLogin({
        flow: 'auth-code',
        scope: 'openid email profile https://www.googleapis.com/auth/drive.appdata',
        select_account: true,
        onSuccess: async (codeResponse) => {
            try {
                setDriveLoading(true);
                await attendanceService.linkGoogleDrive(codeResponse.code);
                showToast('success', 'Google Drive linked successfully!');
                await fetchDriveStatus();
            } catch (err: unknown) {
                console.error(err);
                showToast('error', getErrorMessage(err, 'Failed to link Google Drive'));
            } finally {
                setDriveLoading(false);
            }
        },
        onError: () => {
            showToast('error', 'Google Drive authorization failed');
        }
    });

    const handleDriveBackup = async () => {
        try {
            setDriveLoading(true);
            await attendanceService.performDriveBackup();
            showToast('success', 'Backup saved to Google Drive!');
            await fetchDriveStatus();
        } catch (err: unknown) {
            showToast('error', getErrorMessage(err, 'Drive backup failed'));
        } finally {
            setDriveLoading(false);
        }
    };

    const handleDriveRestore = async (fileId: string) => {
        const isConfirmed = await confirm({
            title: 'Restore Backup',
            message: 'Warning: Restoring from backup will overwrite all current attendance logs, subjects, and timetables. Are you sure you want to proceed?',
        });
        if (!isConfirmed) {
            return;
        }
        try {
            setDriveLoading(true);
            await attendanceService.restoreDriveBackup(fileId);
            attendanceService.clearAllLocalCaches();
            showToast('success', 'Backup restored successfully!');
            window.location.reload();
        } catch (err: unknown) {
            showToast('error', getErrorMessage(err, 'Drive restore failed'));
        } finally {
            setDriveLoading(false);
        }
    };

    const handleDriveDownload = async (fileId: string, createdAt: string) => {
        try {
            setDriveLoading(true);
            const blob = await attendanceService.downloadDriveBackup(fileId);
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            const dateStr = new Date(createdAt).toISOString().split('T')[0];
            anchor.download = `semester_cloud_backup_${dateStr}_${fileId}.json`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(url);
            showToast('success', 'Cloud backup downloaded successfully!');
        } catch (err: unknown) {
            showToast('error', getErrorMessage(err, 'Drive download failed'));
        } finally {
            setDriveLoading(false);
        }
    };

    const handleUpdateFrequency = async (freq: string) => {
        try {
            setDriveLoading(true);
            await attendanceService.updateDriveSettings(freq);
            showToast('success', `Backup frequency set to ${freq}`);
            await fetchDriveStatus();
        } catch {
            showToast('error', 'Failed to update frequency');
        } finally {
            setDriveLoading(false);
        }
    };

    const handleDisconnectDrive = async () => {
        const isConfirmed = await confirm({
            title: 'Disconnect Google Drive',
            message: 'Are you sure you want to disconnect Google Drive? Auto-backups will be disabled.',
        });
        if (!isConfirmed) {
            return;
        }
        try {
            setDriveLoading(true);
            await attendanceService.disconnectDrive();
            showToast('success', 'Google Drive disconnected');
            setDriveStatus(null);
            setDriveBackups([]);
        } catch {
            showToast('error', 'Failed to disconnect');
        } finally {
            setDriveLoading(false);
        }
    };

    const handleExport = async () => {
        try {
            if (isTauriDesktop()) {
                const res = await desktopDb.exportBackupToDownloads();
                showToast('success', `Backup saved to Downloads: ${res.filename}`);
                return;
            }
            const blob = await attendanceService.exportData();
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `semester_config_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1500);
            showToast('success', 'Backup exported');
        } catch (err) {
            showToast('error', getErrorMessage(err, 'Export failed'));
        }
    };

    const handleImportFile = async (file: File) => {
        const text = await file.text();
        const data = JSON.parse(text);
        const isConfirmed = await confirm({
            title: 'Import Backup Configuration',
            message: 'Importing this backup will replace all your current subjects, attendance logs, timetables, and courses with the backup data. Do you want to proceed?',
        });
        if (!isConfirmed) return;

        showToast('info', 'Importing data...');
        await attendanceService.importData(data);
        attendanceService.clearAllLocalCaches();
        if (isTauriDesktop()) {
            try {
                const refreshed = await desktopDb.getProfile();
                if (refreshed) {
                    authService.storeUser(refreshed);
                    const sem = Number(refreshed.current_semester || refreshed.semester || 0);
                    if (sem >= 1 && sem <= 8) {
                        localStorage.setItem('zenith_semester', String(sem));
                    }
                    const prefs = (refreshed as { preferences?: { timetable_view?: string } }).preferences;
                    if (prefs?.timetable_view === 'grid' || prefs?.timetable_view === 'list') {
                        localStorage.setItem('Semester_timetable_view', prefs.timetable_view);
                    }
                }
            } catch { /* reload will rehydrate */ }
        }
        showToast('success', 'Backup imported cleanly');
        setTimeout(() => window.location.reload(), 800);
    };

    const handleGenerateKey = async () => {
        try {
            showToast('info', 'Generating migration key...');
            const res = await attendanceService.initiateMigration();
            setMigrationKey(res.key);
            showToast('success', 'Migration key generated! Copy it and use it on your destination account.');
        } catch (err: unknown) {
            showToast('error', getErrorMessage(err, 'Failed to generate key'));
        }
    };

    const handleCopyKey = () => {
        if (!migrationKey) return;
        navigator.clipboard.writeText(migrationKey);
        setCopied(true);
        showToast('success', 'Key copied to clipboard!');
        setTimeout(() => setCopied(false), 2000);
    };

    const handleCompleteMigration = async () => {
        if (!inputKey.trim()) {
            showToast('error', 'Please enter a migration key');
            return;
        }
        const isConfirmed = await confirm({
            title: 'Complete Account Migration',
            message: 'Completing migration will permanently overwrite all current subjects, attendance logs, and results on this account with the migrated data.',
        });
        if (!isConfirmed) {
            return;
        }
        setMigrating(true);
        try {
            showToast('info', 'Migrating account records...');
            await attendanceService.completeMigration(inputKey);
            attendanceService.clearAllLocalCaches();
            showToast('success', 'Migration completed successfully! Reloading...');
            setTimeout(() => window.location.reload(), 1500);
        } catch (err: unknown) {
            showToast('error', getErrorMessage(err, 'Migration failed'));
        } finally {
            setMigrating(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Section 1: Offline Backup & Restore */}
            <div className="liquid-glass rounded-[24px] overflow-hidden">
                <div className="flex items-center gap-2.5 px-6 py-4 border-b border-on-surface/[0.08] bg-on-surface/[0.015]">
                    <span className="w-7 h-7 rounded-xl bg-primary/14 border border-primary/25 text-primary flex items-center justify-center">
                        <Shield size={14} />
                    </span>
                    <span className="font-display text-sm font-extrabold text-on-surface">Offline Backup &amp; Restore</span>
                </div>

                <div className="p-6 divide-y divide-on-surface/[0.07] space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 last:pb-0 last:border-b-0">
                        <div className="max-w-md">
                            <h4 className="text-xs font-bold text-on-surface">Export Configuration</h4>
                            <p className="text-[11px] text-on-surface-variant/75 mt-0.5">Save your entire profile, attendance logs, and app preferences to a local JSON file.</p>
                        </div>
                        <button
                            onClick={handleExport}
                            className="no-fluid shrink-0 h-9 px-4 border border-on-surface/[0.11] bg-on-surface/[0.04] hover:bg-primary/14 hover:border-primary/35 hover:text-primary rounded-full inline-flex items-center justify-center gap-1.5 text-on-surface text-xs font-bold cursor-pointer transition-all whitespace-nowrap"
                        >
                            <Download size={13} /> Export Backup
                        </button>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 last:pb-0 last:border-b-0">
                        <div className="max-w-md">
                            <h4 className="text-xs font-bold text-on-surface">Import Configuration</h4>
                            <p className="text-[11px] text-on-surface-variant/75 mt-0.5">Load a previously saved backup file. This replaces your current settings and data.</p>
                        </div>
                        <label className="no-fluid shrink-0 h-9 px-4 border border-on-surface/[0.11] bg-on-surface/[0.04] hover:bg-primary/14 hover:border-primary/35 hover:text-primary rounded-full inline-flex items-center justify-center gap-1.5 text-on-surface text-xs font-bold cursor-pointer transition-all whitespace-nowrap">
                            <Upload size={13} /> Import Backup
                            <input
                                type="file"
                                className="hidden"
                                accept=".json"
                                onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    try {
                                        await handleImportFile(file);
                                    } catch (err: unknown) {
                                        console.error('Import Error:', err);
                                        showToast('error', `Import failed: ${getErrorMessage(err, 'Invalid JSON')}`);
                                    } finally {
                                        e.target.value = '';
                                    }
                                }}
                            />
                        </label>
                    </div>
                </div>
            </div>

            {isTauriDesktop() && <DesktopDriveSyncCard showToast={showToast} />}

            {/* Section 2: Cloud Sync & Migration (web only on desktop Drive is handled above) */}
            <div className={isTauriDesktop() ? 'hidden' : 'liquid-glass rounded-[24px] overflow-hidden'}>
                <div className="flex items-center gap-2.5 px-6 py-4 border-b border-on-surface/[0.08] bg-on-surface/[0.015]">
                    <span className="w-7 h-7 rounded-xl bg-cyan-500/14 border border-cyan-500/25 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
                        <Cloud size={14} />
                    </span>
                    <span className="font-display text-sm font-extrabold text-on-surface">Cloud Sync &amp; Migration</span>
                </div>

                <div className="p-6 divide-y divide-on-surface/[0.07] space-y-4">
                    {/* Google Drive Sync */}
                    <div className="pb-4 last:pb-0 last:border-b-0">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="max-w-md">
                                <div className="flex items-center gap-2">
                                    <h4 className="text-xs font-bold text-on-surface">Google Drive Sync</h4>
                                    {driveStatus?.google_drive_linked && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/12 border border-emerald-500/25 text-emerald-500 text-[10px] font-bold leading-none">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                            Linked
                                        </span>
                                    )}
                                </div>
                                <p className="text-[11px] text-on-surface-variant/75 mt-0.5">
                                    Securely back up all your academic data to your private Google Drive AppData folder.
                                </p>
                            </div>

                            <div className="shrink-0 w-full sm:w-auto">
                                {!driveStatus?.google_drive_linked ? (
                                    <button
                                        disabled={driveLoading}
                                        onClick={() => linkDrive()}
                                        className="no-fluid h-9 px-4 rounded-full btn-gradient text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0 w-full sm:w-auto"
                                    >
                                        <Cloud size={13} /> Connect Drive
                                    </button>
                                ) : (
                                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                                        <Select
                                            value={driveStatus.google_drive_backup_frequency}
                                            onChange={(e) => handleUpdateFrequency(e.target.value)}
                                            options={[
                                                { value: 'daily', label: 'Daily' },
                                                { value: 'weekly', label: 'Weekly' },
                                                { value: 'monthly', label: 'Monthly' },
                                                { value: 'never', label: 'Manual' }
                                            ]}
                                            className="!py-1 !px-3 !rounded-full !text-xs !h-9 w-full sm:!w-28 whitespace-nowrap shrink-0"
                                        />
                                        <div className="flex gap-2 items-center w-full">
                                            <button
                                                disabled={driveLoading}
                                                onClick={handleDriveBackup}
                                                className="no-fluid h-9 px-4 rounded-full btn-gradient text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0 flex-1 sm:flex-initial"
                                            >
                                                <RefreshCw size={12} className={driveLoading ? 'animate-spin' : ''} /> Sync Now
                                            </button>
                                            <button
                                                disabled={driveLoading}
                                                onClick={handleDisconnectDrive}
                                                className="no-fluid h-9 w-9 rounded-full border border-on-surface/[0.11] hover:border-rose-500/35 hover:bg-rose-500/10 text-on-surface-variant hover:text-rose-500 transition-all flex items-center justify-center cursor-pointer whitespace-nowrap shrink-0"
                                                title="Disconnect Drive"
                                            >
                                                <Unlink size={13} />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Last sync info */}
                        {driveStatus?.google_drive_linked && (
                            <p className="text-[11px] text-on-surface-variant/60 mt-2 font-mono">
                                Last Sync: {driveStatus.google_drive_last_backup
                                    ? new Date(driveStatus.google_drive_last_backup).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
                                    : 'Never'}
                            </p>
                        )}

                        {/* Backups List */}
                        {driveStatus?.google_drive_linked && driveBackups.length > 0 && (
                            <div className="mt-4 pt-3.5 border-t border-on-surface/[0.07] space-y-2">
                                <p className="text-[10px] font-bold uppercase text-on-surface-variant/60 tracking-wider">Available Cloud Backups</p>
                                <div className="max-h-[140px] overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                                    {driveBackups.map((b) => (
                                        <div key={b.id} className="flex flex-col sm:flex-row sm:items-center justify-between px-3.5 py-2.5 gap-2 rounded-2xl bg-on-surface/[0.03] border border-on-surface/[0.07] text-xs">
                                            <div className="flex items-baseline flex-wrap gap-x-2">
                                                <span className="font-semibold text-on-surface">
                                                    {new Date(b.created_at).toLocaleDateString()} at {new Date(b.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                                <span className="text-[10px] text-on-surface-variant/60">({(b.size / 1024).toFixed(1)} KB)</span>
                                            </div>
                                            <div className="flex gap-1.5 shrink-0 self-end sm:self-auto">
                                                <button
                                                    disabled={driveLoading}
                                                    onClick={() => handleDriveDownload(b.id, b.created_at)}
                                                    className="no-fluid h-7 px-3 text-[11px] font-bold border border-on-surface/[0.11] hover:bg-on-surface/[0.08] rounded-full transition-all cursor-pointer text-on-surface whitespace-nowrap shrink-0 flex items-center justify-center"
                                                >
                                                    Download
                                                </button>
                                                <button
                                                    disabled={driveLoading}
                                                    onClick={() => handleDriveRestore(b.id)}
                                                    className="no-fluid h-7 px-3 text-[11px] font-bold btn-gradient rounded-full transition-all cursor-pointer whitespace-nowrap shrink-0 flex items-center justify-center"
                                                >
                                                    Restore
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Account Migration */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 last:pb-0 last:border-b-0">
                        <div className="max-w-md">
                            <h4 className="text-xs font-bold text-on-surface">Migrate Account Data</h4>
                            <p className="text-[11px] text-on-surface-variant/75 mt-0.5">Transfer all your subjects, settings, and logs to a new Google account seamlessly.</p>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2 shrink-0 items-stretch sm:items-center w-full sm:w-auto">
                            {migrationKey ? (
                                <div className="flex gap-1.5 items-center bg-on-surface/[0.05] border border-on-surface/[0.10] rounded-full px-3.5 h-9 whitespace-nowrap shrink-0 justify-between w-full sm:w-auto">
                                    <span className="font-mono text-[11px] text-on-surface max-w-[120px] truncate">{migrationKey}</span>
                                    <button
                                        onClick={handleCopyKey}
                                        className="no-fluid p-1 hover:bg-on-surface/[0.10] rounded-full text-on-surface transition-all cursor-pointer shrink-0"
                                    >
                                        {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={handleGenerateKey}
                                    className="no-fluid h-9 px-4 rounded-full border border-on-surface/[0.11] bg-on-surface/[0.04] hover:bg-primary/14 hover:border-primary/35 hover:text-primary text-xs font-bold text-on-surface transition-all cursor-pointer whitespace-nowrap shrink-0 w-full sm:w-auto flex items-center justify-center"
                                >
                                    Generate Key
                                </button>
                            )}

                            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center w-full">
                                <input
                                    type="text"
                                    placeholder="Paste migration key…"
                                    value={inputKey}
                                    onChange={(e) => setInputKey(e.target.value)}
                                    className="px-3.5 text-xs rounded-xl border border-on-surface/[0.10] bg-on-surface/[0.04] text-on-surface placeholder:text-on-surface-variant/45 focus:outline-none focus:border-primary h-9 w-full sm:w-44 transition-all shrink-0"
                                />
                                <button
                                    disabled={migrating}
                                    onClick={handleCompleteMigration}
                                    className="no-fluid h-9 px-4 rounded-full btn-gradient text-xs font-bold transition-all disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0 w-full sm:w-auto flex items-center justify-center"
                                >
                                    Migrate
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Section 3: Danger Zone */}
            <div className="border border-rose-500/25 rounded-[24px] overflow-hidden bg-rose-500/[0.03]">
                <div className="flex items-center gap-2.5 px-6 py-4 border-b border-rose-500/20 bg-rose-500/[0.04]">
                    <span className="w-7 h-7 rounded-xl bg-rose-500/14 border border-rose-500/25 text-rose-500 dark:text-rose-400 flex items-center justify-center">
                        <ShieldAlert size={14} />
                    </span>
                    <span className="font-display text-sm font-extrabold text-rose-500 dark:text-rose-400">Danger Zone</span>
                </div>

                <div className="p-6 divide-y divide-rose-500/12 space-y-4">
                    {!isTauriDesktop() && (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 last:pb-0 last:border-b-0">
                            <div>
                                <h4 className="text-xs font-bold text-on-surface">Sign Out</h4>
                                <p className="text-[11px] text-on-surface-variant/75 mt-0.5">Sign out of your active academic profile on this device.</p>
                            </div>
                            <button
                                onClick={() => void onLogout()}
                                className="no-fluid shrink-0 h-9 px-4 rounded-full border border-on-surface/[0.12] bg-on-surface/[0.04] text-xs font-bold text-on-surface hover:bg-on-surface/[0.10] transition-all cursor-pointer"
                            >
                                Sign Out
                            </button>
                        </div>
                    )}

                    <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${isTauriDesktop() ? 'pb-4' : 'pt-4 pb-4'} last:pb-0 last:border-b-0`}>
                        <div>
                            <h4 className="text-xs font-bold text-red-500">Clear Academic Data</h4>
                            <p className="text-[11px] text-on-surface-variant/70 mt-0.5">
                                Erase all subjects, attendance logs, timetables, results, and checklists while keeping your profile, Google Drive link, and AI keys intact.
                            </p>
                        </div>
                        <HoldButton
                            variant="danger"
                            label="Hold to Clear Data"
                            completedLabel="Clearing Data..."
                            holdDuration={1500}
                            onComplete={() => void onDeleteAllData()}
                            className="shrink-0 h-9 px-4 text-xs"
                        />
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 last:pb-0 last:border-b-0">
                        <div>
                            <h4 className="text-xs font-bold text-red-500">Factory Reset App</h4>
                            <p className="text-[11px] text-on-surface-variant/70 mt-0.5">
                                Reset your local workspace completely back to a fresh install — clears profile, academic records, Google Drive link, and saved AI keys.
                            </p>
                        </div>
                        <HoldButton
                            variant="danger"
                            label="Hold to Factory Reset"
                            completedLabel="Resetting App..."
                            holdDuration={1800}
                            onComplete={() => void onDeleteAccount()}
                            className="shrink-0 h-9 px-4 text-xs"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsDataSection;

