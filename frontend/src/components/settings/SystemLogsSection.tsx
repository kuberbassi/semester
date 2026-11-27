import React, { useEffect, useMemo, useState } from 'react';
import { Activity, CheckCircle2, Clock, FileText, Settings as SettingsIcon, Trash2, User } from 'lucide-react';
import Loader from '@/components/ui/Loader';
import type { SystemLog } from '@/types';
import { attendanceService } from '@/services/attendance.service';
import { AnimatedList } from '@/components/react-bits';

const PAGE_SIZE = 7;

const parseTimestamp = (log: SystemLog) => {
    const raw = typeof log.timestamp === 'string' ? log.timestamp : (log.timestamp as { $date?: string })?.$date;
    const value = new Date(raw || '');
    return Number.isNaN(value.getTime()) ? null : value;
};

const SystemLogsSection: React.FC = () => {
    const [logs, setLogs] = useState<SystemLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [nextOffset, setNextOffset] = useState(0);
    const [snapshot, setSnapshot] = useState<string>();
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;
        void attendanceService.getSystemLogs(PAGE_SIZE, 0).then(page => {
            if (!active) return;
            setLogs(page.items);
            setHasMore(page.has_more);
            setNextOffset(page.next_offset);
            setSnapshot(page.snapshot);
        }).catch(err => {
            console.error(err);
            if (active) setError('Activity history could not be loaded. Please try again later.');
        }).finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, []);

    const loadMore = async () => {
        if (loadingMore || !hasMore) return;
        setLoadingMore(true);
        setError('');
        try {
            const page = await attendanceService.getSystemLogs(PAGE_SIZE, nextOffset, snapshot);
            setLogs(current => [...current, ...page.items.filter(item => !current.some(existing => existing.id === item.id))]);
            setHasMore(page.has_more);
            setNextOffset(page.next_offset);
        } catch (err) {
            console.error(err);
            setError('More activity could not be loaded. Your existing records have been kept.');
        } finally {
            setLoadingMore(false);
        }
    };

    const groupedLogs = useMemo(() => (logs || []).reduce((acc: Record<string, SystemLog[]>, log) => {
        const timestamp = parseTimestamp(log);
        const date = timestamp ? timestamp.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'Unknown date';
        if (!acc[date]) acc[date] = [];
        acc[date].push(log);
        return acc;
    }, {}), [logs]);

    const getLogIcon = (action: string) => {
        const value = action.toLowerCase();
        if (value.includes('profile')) return <User size={14} className="text-on-surface" />;
        if (value.includes('submission') || value.includes('tracker')) return <CheckCircle2 size={14} className="text-primary" />;
        if (value.includes('delete') || value.includes('reset') || value.includes('wipe') || value.includes('cleared')) return <Trash2 size={14} className="text-rose-400" />;
        if (value.includes('attendance') || value.includes('subject') || value.includes('schedule')) return <Activity size={14} className="text-primary" />;
        if (value.includes('setting') || value.includes('preference')) return <SettingsIcon size={14} className="text-on-surface" />;
        return <FileText size={14} className="text-on-surface-variant/60" />;
    };

    const formatTime = (log: SystemLog) => parseTimestamp(log)?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) || 'Unknown time';

    if (loading) return <div className="h-48 flex items-center justify-center"><Loader size={20} /></div>;

    const dates = Object.keys(groupedLogs);
    return (
        <div className="space-y-4">
            <div className="liquid-glass rounded-[24px] p-5 sm:p-6">
                <h3 className="font-display text-sm font-extrabold text-on-surface tracking-tight">Activity History</h3>
                <p className="mt-1 text-xs text-on-surface-variant">Verified account actions, newest first. Times use your device timezone.</p>
            </div>
            {error && <div role="alert" className="rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-xs font-medium text-rose-400">{error}</div>}
            {dates.length === 0 ? (
                <div className="liquid-glass rounded-[24px] p-12 flex flex-col items-center justify-center text-center">
                    <Clock size={24} className="text-on-surface-variant/35 mb-3" />
                    <h3 className="font-display text-sm font-bold text-on-surface mb-1">No activity yet</h3>
                    <p className="text-xs text-on-surface-variant/70 max-w-xs">Verified account actions will appear here with their exact time and event ID.</p>
                </div>
            ) : dates.map(date => (
                <div key={date} className="liquid-glass rounded-[24px] overflow-hidden">
                    <div className="flex items-center gap-2 px-6 py-3.5 border-b border-on-surface/[0.08] bg-on-surface/[0.015]">
                        <Clock size={14} className="text-primary" />
                        <span className="font-display text-xs font-bold text-on-surface">{date}</span>
                    </div>
                    <AnimatedList
                        items={groupedLogs[date]}
                        keyExtractor={(log) => log.id}
                        staggerDelay={0.03}
                        className="divide-y divide-on-surface/[0.07]"
                        renderItem={(log) => (
                            <div key={log.id} className="flex gap-3.5 p-4 sm:px-6 hover:bg-on-surface/[0.025] transition-colors">
                                <div className="w-9 h-9 rounded-xl bg-on-surface/[0.05] border border-on-surface/[0.09] flex items-center justify-center shrink-0">{getLogIcon(log.action)}</div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
                                        <h4 className="text-xs font-bold text-on-surface tracking-tight">{log.action}</h4>
                                        <time className="text-[11px] font-semibold text-on-surface-variant/70 tabular-nums" dateTime={parseTimestamp(log)?.toISOString()}>{formatTime(log)}</time>
                                    </div>
                                    <p className="text-xs text-on-surface-variant font-medium leading-relaxed break-words">{log.description}</p>
                                    <p className="mt-1.5 text-[10px] font-mono text-on-surface-variant/50 break-all" title={log.id}>Event {log.id}</p>
                                </div>
                            </div>
                        )}
                    />
                </div>
            ))}
            {hasMore && (
                <button type="button" onClick={() => void loadMore()} disabled={loadingMore}
                    className="no-fluid w-full h-10 rounded-full border border-on-surface/[0.11] bg-on-surface/[0.04] text-xs font-bold text-on-surface hover:bg-primary/12 hover:border-primary/35 hover:text-primary disabled:opacity-50 transition-colors cursor-pointer">
                    {loadingMore ? 'Loading…' : 'Load More Activity'}
                </button>
            )}
        </div>
    );
};

export default SystemLogsSection;
