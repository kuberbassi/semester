import React, { useState, useEffect } from 'react';
import { Download, Shield, ShieldAlert, Upload, Copy, Check, Cloud, RefreshCw, Unlink } from 'lucide-react';
import { useGoogleLogin } from '@react-oauth/google';
import Select from '@/components/ui/Select';
import { attendanceService } from '@/services/attendance.service';
import { useConfirm } from '@/contexts/confirm-context';
import { getErrorMessage } from '@/utils/errors';
import type { DriveBackup, DriveStatus } from '@/types';

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
            const blob = await attendanceService.exportData();
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `semester_config_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(url);
        } catch {
            showToast('error', 'Export failed');
        }
    };

    const handleImportFile = async (file: File) => {
        const text = await file.text();
        const data = JSON.parse(text);
        const isConfirmed = await confirm({
            title: 'Import Backup Configuration',
            message: '⚠️ WARNING: Importing this backup will automatically WIPE all your current subjects, attendance logs, timetables, and courses, replacing them with the backup data. Do you want to proceed?',
        });
        if (!isConfirmed) return;

        showToast('info', 'Importing data...');
        await attendanceService.importData(data);
        attendanceService.clearAllLocalCaches();
        showToast('success', 'Data Imported');
        setTimeout(() => window.location.reload(), 1000);
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
            message: '⚠️ CRITICAL WARNING: Complete migration? All current subjects, attendance logs, and results on this account will be permanently overwritten by the migrated data.',
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
            <div className="border border-outline rounded-xl overflow-hidden bg-surface">
                <div className="flex items-center gap-2 px-5 py-4 border-b border-outline bg-surface-container/50">
                    <Shield size={14} className="text-on-surface-variant/50" />
                    <span className="text-xs font-semibold text-on-surface">Offline Backup & Restore</span>
                </div>
                
                <div className="p-5 divide-y divide-outline/30 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 last:pb-0 last:border-b-0">
                        <div className="max-w-md">
                            <h4 className="text-xs font-bold text-on-surface">Export Configuration</h4>
                            <p className="text-[11px] text-on-surface-variant/60 mt-0.5">Save your entire profile, attendance logs, and app preferences to a secure offline JSON file.</p>
                        </div>
                        <button
                            onClick={handleExport}
                            className="shrink-0 h-8 px-3 border border-outline bg-surface hover:bg-surface-container rounded-lg flex items-center justify-center text-on-surface text-[11px] font-semibold uppercase tracking-wider cursor-pointer transition-all shadow-sm whitespace-nowrap"
                        >
                            <Download size={12} className="mr-1.5" /> Export Backup
                        </button>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 last:pb-0 last:border-b-0">
                        <div className="max-w-md">
                            <h4 className="text-xs font-bold text-on-surface">Import Configuration</h4>
                            <p className="text-[11px] text-on-surface-variant/60 mt-0.5">Load a previously saved backup file. This will overwrite your current settings and data.</p>
                        </div>
                        <label className="shrink-0 h-8 px-3 border border-outline bg-surface hover:bg-surface-container rounded-lg flex items-center justify-center text-on-surface text-[11px] font-semibold uppercase tracking-wider cursor-pointer transition-all shadow-sm whitespace-nowrap">
                            <Upload size={12} className="mr-1.5" /> Import Backup
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

            {/* Section 2: Cloud Sync & Migration */}
            <div className="border border-outline rounded-xl overflow-hidden bg-surface">
                <div className="flex items-center gap-2 px-5 py-4 border-b border-outline bg-surface-container/50">
                    <Cloud size={14} className="text-on-surface-variant/50" />
                    <span className="text-xs font-semibold text-on-surface">Cloud Sync & Migration</span>
                </div>

                <div className="p-5 divide-y divide-outline/30 space-y-4">
                    {/* Google Drive Sync */}
                    <div className="pb-4 last:pb-0 last:border-b-0">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="max-w-md">
                                <div className="flex items-center gap-2">
                                    <h4 className="text-xs font-bold text-on-surface">Google Drive Sync</h4>
                                    {driveStatus?.google_drive_linked && (
                                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[8px] font-bold uppercase tracking-wider leading-none">
                                            <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                                            Linked
                                        </span>
                                    )}
                                </div>
                                <p className="text-[11px] text-on-surface-variant/60 mt-0.5">
                                    Securely back up all your academic data to your private Google Drive AppData folder.
                                </p>
                            </div>

                            <div className="shrink-0 w-full sm:w-auto">
                                {!driveStatus?.google_drive_linked ? (
                                    <button
                                        disabled={driveLoading}
                                        onClick={() => linkDrive()}
                                        className="h-8 px-3 bg-on-surface text-surface hover:bg-on-surface/90 text-[11px] font-semibold uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0 w-full sm:w-auto text-center"
                                    >
                                        <Cloud size={12} /> Connect Drive
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
                                            className="!py-1 !px-2 !rounded-lg !text-[11px] !h-8 w-full sm:!w-24 border-outline whitespace-nowrap shrink-0"
                                        />
                                        <div className="flex gap-2 items-center w-full">
                                            <button
                                                disabled={driveLoading}
                                                onClick={handleDriveBackup}
                                                className="h-8 px-3 bg-on-surface text-surface hover:bg-on-surface/90 text-[11px] font-semibold uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0 flex-1 sm:flex-initial"
                                            >
                                                <RefreshCw size={11} className={driveLoading ? 'animate-spin' : ''} /> Sync Now
                                            </button>
                                            <button
                                                disabled={driveLoading}
                                                onClick={handleDisconnectDrive}
                                                className="h-8 w-8 rounded-lg border border-outline hover:border-red-500/30 hover:bg-red-500/5 text-on-surface-variant/60 hover:text-red-500 transition-all flex items-center justify-center cursor-pointer whitespace-nowrap shrink-0"
                                                title="Disconnect Drive"
                                            >
                                                <Unlink size={12} />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Last sync info */}
                        {driveStatus?.google_drive_linked && (
                            <p className="text-[10px] text-on-surface-variant/40 mt-1 font-mono">
                                Last Sync: {driveStatus.google_drive_last_backup 
                                    ? new Date(driveStatus.google_drive_last_backup).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
                                    : 'Never'}
                            </p>
                        )}

                        {/* Backups List */}
                        {driveStatus?.google_drive_linked && driveBackups.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-outline/20 space-y-1.5">
                                <p className="text-[9px] font-bold uppercase text-on-surface-variant/40 tracking-wider">Available Cloud Backups</p>
                                <div className="max-h-[120px] overflow-y-auto space-y-1 pr-1">
                                    {driveBackups.map((b) => (
                                        <div key={b.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-2 gap-2.5 sm:gap-2 rounded-lg bg-surface-container/30 border border-outline/20 text-[11px]">
                                            <div className="flex items-baseline flex-wrap gap-x-2">
                                                <span className="font-semibold text-on-surface">
                                                    {new Date(b.created_at).toLocaleDateString()} at {new Date(b.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                                <span className="text-[10px] text-on-surface-variant/40">({(b.size / 1024).toFixed(1)} KB)</span>
                                            </div>
                                            <div className="flex gap-1.5 shrink-0 self-end sm:self-auto">
                                                <button
                                                    disabled={driveLoading}
                                                    onClick={() => handleDriveDownload(b.id, b.created_at)}
                                                    className="h-6 px-2.5 text-[9px] font-bold uppercase border border-outline hover:bg-surface-container rounded-md transition-all cursor-pointer text-on-surface whitespace-nowrap shrink-0 flex items-center justify-center"
                                                >
                                                    Download
                                                </button>
                                                <button
                                                    disabled={driveLoading}
                                                    onClick={() => handleDriveRestore(b.id)}
                                                    className="h-6 px-2.5 text-[9px] font-bold uppercase bg-on-surface text-surface hover:opacity-90 rounded-md transition-all cursor-pointer whitespace-nowrap shrink-0 flex items-center justify-center"
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
                            <p className="text-[11px] text-on-surface-variant/60 mt-0.5">Transfer all your subjects, settings, and logs to a new Google account seamlessly.</p>
                        </div>
                        
                        <div className="flex flex-col sm:flex-row gap-2 shrink-0 items-stretch sm:items-center w-full sm:w-auto">
                            {migrationKey ? (
                                <div className="flex gap-1.5 items-center bg-surface-container border border-outline rounded-lg px-2.5 py-1 h-8 whitespace-nowrap shrink-0 justify-between w-full sm:w-auto">
                                    <span className="font-mono text-[10px] text-on-surface max-w-[120px] truncate">{migrationKey}</span>
                                    <button
                                        onClick={handleCopyKey}
                                        className="p-1 hover:bg-surface-container-high rounded text-on-surface transition-all cursor-pointer whitespace-nowrap shrink-0"
                                    >
                                        {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={handleGenerateKey}
                                    className="h-8 px-2.5 rounded-lg border border-outline hover:bg-surface-container text-[11px] font-semibold uppercase text-on-surface transition-all cursor-pointer shadow-sm whitespace-nowrap shrink-0 w-full sm:w-auto text-center flex items-center justify-center"
                                >
                                    Generate Key
                                </button>
                            )}

                            <div className="flex flex-col sm:flex-row gap-1.5 items-stretch sm:items-center w-full">
                                <input
                                    type="text"
                                    placeholder="Paste key..."
                                    value={inputKey}
                                    onChange={(e) => setInputKey(e.target.value)}
                                    className="px-2.5 py-1 text-[11px] rounded-lg border border-outline bg-surface text-on-surface placeholder-on-surface-variant/30 focus:outline-none focus:border-on-surface/40 h-8 w-full sm:w-48 transition-all shrink-0"
                                />
                                <button
                                    disabled={migrating}
                                    onClick={handleCompleteMigration}
                                    className="h-8 px-3 rounded-lg bg-on-surface text-surface hover:bg-on-surface/90 text-[11px] font-semibold uppercase transition-all disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0 w-full sm:w-auto text-center flex items-center justify-center"
                                >
                                    Migrate
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Section 3: Danger Zone */}
            <div className="border border-red-500/20 rounded-xl overflow-hidden bg-red-500/[0.01]">
                <div className="flex items-center gap-2 px-5 py-4 border-b border-red-500/20 bg-red-500/[0.03]">
                    <ShieldAlert size={14} className="text-red-500" />
                    <span className="text-xs font-semibold text-red-500">Danger Zone</span>
                </div>

                <div className="p-5 divide-y divide-red-500/10 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 last:pb-0 last:border-b-0">
                        <div>
                            <h4 className="text-xs font-bold text-on-surface">Sign Out</h4>
                            <p className="text-[11px] text-on-surface-variant/60 mt-0.5">Sign out of your active academic profile on this device.</p>
                        </div>
                        <button
                            onClick={() => void onLogout()}
                            className="shrink-0 h-8 px-3 rounded-lg border border-outline text-[11px] font-semibold uppercase text-on-surface hover:bg-surface-container transition-all cursor-pointer shadow-sm"
                        >
                            Sign Out
                        </button>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 pb-4 last:pb-0 last:border-b-0">
                        <div>
                            <h4 className="text-xs font-bold text-red-500">Wipe All Data</h4>
                            <p className="text-[11px] text-on-surface-variant/60 mt-0.5">Irreversibly erase all subjects, attendance logs, timetables, and checklists.</p>
                        </div>
                        <button
                            onClick={() => void onDeleteAllData()}
                            className="shrink-0 h-8 px-3 rounded-lg bg-red-500 text-white text-[11px] font-semibold uppercase hover:bg-red-600 transition-all cursor-pointer shadow-sm shadow-red-500/10"
                        >
                            Wipe Data
                        </button>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 last:pb-0 last:border-b-0">
                        <div>
                            <h4 className="text-xs font-bold text-red-500">Delete Account Permanently</h4>
                            <p className="text-[11px] text-on-surface-variant/60 mt-0.5">Remove your profile, Google Drive connections, and settings permanently.</p>
                        </div>
                        <button
                            onClick={() => void onDeleteAccount()}
                            className="shrink-0 h-8 px-3 rounded-lg border border-red-500/30 text-red-500 dark:text-red-400 text-[11px] font-semibold uppercase hover:bg-red-500/10 transition-all cursor-pointer shadow-sm"
                        >
                            Delete Account
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsDataSection;

