import React, { useCallback, useEffect, useState } from 'react';
import { Cloud, RefreshCw, Unlink } from 'lucide-react';
import { desktopDb, type DesktopDriveStatus } from '@/services/desktopDb';
import { authService } from '@/services/auth.service';
import { attendanceService, notifyDesktopMutation } from '@/services/attendance.service';
import { queryClient } from '@/queryClient';
import type { DriveBackup } from '@/types';
import { useConfirm } from '@/contexts/confirm-context';
import { getErrorMessage } from '@/utils/errors';

type Props = { showToast: (type: 'success' | 'error' | 'warning' | 'info', message: string) => void };

/** Desktop Google Drive card: 1-click user sign-in + automatic smart sync (debounced, delta-hashed). */
const DesktopDriveSyncCard: React.FC<Props> = ({ showToast }) => {
    const confirm = useConfirm();
    const [status, setStatus] = useState<DesktopDriveStatus | null>(null);
    const [backups, setBackups] = useState<DriveBackup[]>([]);
    const [busy, setBusy] = useState(false);

    const refresh = useCallback(async () => {
        try {
            const s = await desktopDb.driveGetStatus();
            setStatus(s);
            if (s.google_drive_linked) {
                setBackups(await desktopDb.driveListBackups().catch(() => []));
            } else {
                setBackups([]);
            }
        } catch (err) {
            console.error(err);
        }
    }, []);

    useEffect(() => {
        void refresh();
        const t = window.setInterval(() => {
            void desktopDb.driveGetStatus().then(setStatus).catch(() => undefined);
        }, 4000);
        return () => window.clearInterval(t);
    }, [refresh]);

    const run = async (fn: () => Promise<unknown>, ok: string) => {
        setBusy(true);
        try {
            await fn();
            showToast('success', ok);
            await refresh();
        } catch (err) {
            showToast('error', getErrorMessage(err, 'Operation failed'));
        } finally {
            setBusy(false);
        }
    };

    const connect = () =>
        run(
            () => desktopDb.googleOAuthConnect(),
            'Google Drive connected — changes now sync automatically'
        );

    const restore = async (id: string) => {
        if (
            !(await confirm({
                title: 'Restore Backup',
                message: 'This replaces current data. A local safety snapshot is taken first. Continue?',
            }))
        )
            return;
        await run(async () => {
            await desktopDb.driveRestoreBackup(id);
            attendanceService.clearAllLocalCaches();
            queryClient.clear();
            try {
                const refreshed = await desktopDb.getProfile();
                if (refreshed) {
                    authService.storeUser(refreshed);
                    const sem = Number(refreshed.current_semester || refreshed.semester || 0);
                    if (sem >= 1 && sem <= 8) {
                        localStorage.setItem('zenith_semester', String(sem));
                    }
                }
            } catch {
                /* reload will rehydrate */
            }
            setTimeout(() => window.location.reload(), 450);
        }, 'Backup restored from Google Drive');
    };

    const download = async (id: string, createdAt: string) => {
        setBusy(true);
        try {
            const res = await desktopDb.driveDownloadBackupToDownloads(id, createdAt);
            showToast('success', `Saved ${res.filename} to Downloads`);
        } catch (err) {
            showToast('error', getErrorMessage(err, 'Download failed'));
        } finally {
            setBusy(false);
        }
    };

    const linked = !!status?.google_drive_linked;
    const pill = !linked
        ? null
        : status?.is_syncing
          ? { t: 'Syncing…', c: 'bg-cyan-500/12 border-cyan-500/25 text-cyan-600 dark:text-cyan-400' }
          : status?.last_error
            ? { t: 'Retrying (offline)', c: 'bg-amber-500/12 border-amber-500/25 text-amber-600 dark:text-amber-400' }
            : status?.has_pending_changes
              ? { t: 'Pending upload', c: 'bg-amber-500/12 border-amber-500/25 text-amber-600 dark:text-amber-400' }
              : { t: 'Synced', c: 'bg-emerald-500/12 border-emerald-500/25 text-emerald-600 dark:text-emerald-400' };

    return (
        <div className="liquid-glass rounded-[24px] overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-6 py-4 border-b border-on-surface/[0.08] bg-on-surface/[0.015]">
                <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-7 h-7 rounded-xl bg-cyan-500/14 border border-cyan-500/25 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
                        <Cloud size={14} />
                    </span>
                    <span className="font-display text-sm font-extrabold text-on-surface whitespace-nowrap">
                        Google Drive Auto-Sync
                    </span>
                    {pill && (
                        <span className={`ml-1 px-2 py-0.5 rounded-full border text-[10px] font-bold whitespace-nowrap ${pill.c}`}>
                            {pill.t}
                        </span>
                    )}
                </div>
                {linked && status?.account_email && (
                    <span
                        data-tooltip={`Connected Google account: ${status.account_email}`}
                        className="text-[11px] font-semibold text-on-surface-variant/75 truncate max-w-[220px]"
                    >
                        {status.account_email}
                    </span>
                )}
            </div>

            <div className="p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <p className="text-[11px] text-on-surface-variant/75 max-w-md leading-relaxed">
                        Sign in with your own Google account to back up changed data automatically into your private Drive AppData folder so desktop &amp; mobile stay identical.
                    </p>
                    {!linked ? (
                        <button
                            disabled={busy}
                            onClick={() => void connect()}
                            data-tooltip="Sign in with your Google account in your default browser to enable Drive sync"
                            className="no-fluid h-9 px-4 rounded-full btn-gradient text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                        >
                            <Cloud size={13} /> {busy ? 'Waiting for browser…' : 'Connect Google Drive'}
                        </button>
                    ) : (
                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                disabled={busy}
                                onClick={() =>
                                    void run(async () => {
                                        const res = await desktopDb.driveSyncNow();
                                        if (res?.merged) {
                                            notifyDesktopMutation();
                                        }
                                    }, '2-way sync completed with Google Drive')
                                }
                                data-tooltip="Pull changes from other devices, merge losslessly, and upload local changes immediately"
                                className="no-fluid h-9 px-4 rounded-full btn-gradient text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                                <RefreshCw size={12} className={busy || status?.is_syncing ? 'animate-spin' : ''} /> Sync Now
                            </button>
                            <button
                                disabled={busy}
                                data-tooltip="Disconnect your Google account & clear local Drive tokens"
                                onClick={() => void run(() => desktopDb.driveDisconnect(), 'Disconnected')}
                                className="no-fluid h-9 w-9 rounded-full border border-on-surface/[0.11] hover:border-rose-500/35 hover:bg-rose-500/10 hover:text-rose-500 flex items-center justify-center cursor-pointer transition-colors"
                            >
                                <Unlink size={13} />
                            </button>
                        </div>
                    )}
                </div>

                {linked && (
                    <label
                        data-tooltip="Lossless 2-way auto-sync: uploads edits 3 seconds after changes and merges mobile edits automatically"
                        className="flex items-center justify-between gap-3 rounded-2xl bg-on-surface/[0.03] border border-on-surface/[0.07] px-4 py-3 cursor-pointer"
                    >
                        <span>
                            <span className="block text-xs font-bold text-on-surface">Smart 2-way auto-sync</span>
                            <span className="block text-[11px] text-on-surface-variant/70">
                                Last synced:{' '}
                                {status?.google_drive_last_backup
                                    ? new Date(status.google_drive_last_backup).toLocaleString()
                                    : 'Never'}
                                {status?.last_error ? ` · ${status.last_error}` : ''}
                            </span>
                        </span>
                        <input
                            type="checkbox"
                            className="h-4 w-4 accent-indigo-500"
                            checked={!!status?.auto_sync_enabled}
                            onChange={(e) =>
                                void run(
                                    () => desktopDb.driveSetAutoSync(e.target.checked),
                                    e.target.checked ? 'Auto-sync on' : 'Auto-sync off'
                                )
                            }
                        />
                    </label>
                )}

                {linked && backups.length > 0 && (
                    <div className="pt-3 border-t border-on-surface/[0.07] space-y-1.5 max-h-[170px] overflow-y-auto custom-scrollbar">
                        <p className="text-[10px] font-bold uppercase text-on-surface-variant/60 tracking-wider">
                            Cloud snapshots
                        </p>
                        {backups.map((b) => (
                            <div
                                key={b.id}
                                className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-2xl bg-on-surface/[0.03] border border-on-surface/[0.07] text-xs"
                            >
                                <span className="font-semibold text-on-surface">
                                    {new Date(b.created_at).toLocaleString()}{' '}
                                    <span className="text-[10px] text-on-surface-variant/60">
                                        ({(b.size / 1024).toFixed(1)} KB)
                                    </span>
                                </span>
                                <span className="flex gap-1.5">
                                    <button
                                        disabled={busy}
                                        onClick={() => void download(b.id, b.created_at)}
                                        data-tooltip="Save this cloud snapshot JSON to your Downloads folder"
                                        className="no-fluid h-7 px-3 text-[11px] font-bold border border-on-surface/[0.11] rounded-full cursor-pointer hover:border-primary/35 hover:text-primary transition-colors"
                                    >
                                        Download
                                    </button>
                                    <button
                                        disabled={busy}
                                        onClick={() => void restore(b.id)}
                                        data-tooltip="Replace local workspace with this cloud snapshot (takes safety backup first)"
                                        className="no-fluid h-7 px-3 text-[11px] font-bold btn-gradient rounded-full cursor-pointer"
                                    >
                                        Restore
                                    </button>
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default DesktopDriveSyncCard;
