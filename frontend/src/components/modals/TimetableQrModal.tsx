import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Download, QrCode, Upload } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { RubberSegment } from '@/components/react-bits';
import { useToast } from '@/components/ui/toast-context';
import { encodeTimetableQrV2, importTimetableQrV2ToWorkspace } from '@/utils/timetableQr';
import type { GridPeriod, Subject, TimetableSchedule } from '@/types';

interface TimetableQrModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImported: () => void;
    semester: number;
    periods: GridPeriod[];
    schedule: TimetableSchedule;
    subjects: Subject[];
}

const TimetableQrModal: React.FC<TimetableQrModalProps> = ({
    isOpen,
    onClose,
    onImported,
    semester,
    periods,
    schedule,
    subjects,
}) => {
    const { showToast } = useToast();
    const [tab, setTab] = useState<'share' | 'import'>('share');
    const [qrDataUrl, setQrDataUrl] = useState<string>('');
    const [copied, setCopied] = useState(false);
    const [pasteCode, setPasteCode] = useState('');
    const [importing, setImporting] = useState(false);

    const totalSlots = useMemo(
        () => Object.values(schedule).reduce((acc, list) => acc + (Array.isArray(list) ? list.length : 0), 0),
        [schedule],
    );

    const sharePayload = useMemo(() => {
        if (totalSlots === 0) return '';
        return encodeTimetableQrV2(periods, schedule, subjects);
    }, [periods, schedule, subjects, totalSlots]);

    useEffect(() => {
        let alive = true;
        if (!isOpen || !sharePayload) {
            setQrDataUrl('');
            return;
        }
        QRCode.toDataURL(sharePayload, {
            width: 320,
            margin: 2,
            errorCorrectionLevel: 'M',
            color: { dark: '#0B1020', light: '#FFFFFF' },
        })
            .then((url) => {
                if (alive) setQrDataUrl(url);
            })
            .catch(() => {
                if (alive) setQrDataUrl('');
            });
        return () => {
            alive = false;
        };
    }, [isOpen, sharePayload]);

    const handleCopyCode = async () => {
        if (!sharePayload) return;
        try {
            await navigator.clipboard.writeText(sharePayload);
            setCopied(true);
            showToast('success', 'Timetable share code copied');
            setTimeout(() => setCopied(false), 1800);
        } catch {
            showToast('error', 'Could not copy code');
        }
    };

    const handleDownloadQr = () => {
        if (!qrDataUrl) return;
        const a = document.createElement('a');
        a.href = qrDataUrl;
        a.download = `semester-${semester}-timetable-qr.png`;
        a.click();
    };

    const handleImport = async () => {
        if (!pasteCode.trim() || importing) return;
        try {
            setImporting(true);
            const res = await importTimetableQrV2ToWorkspace(semester, pasteCode, subjects);
            const parts = [`Imported ${res.slotsImported} slot(s)`];
            if (res.subjectsLinked > 0) parts.push(`${res.subjectsLinked} linked`);
            if (res.subjectsCreated > 0) parts.push(`${res.subjectsCreated} new course(s)`);
            showToast('success', parts.join(' · '));
            setPasteCode('');
            onImported();
            onClose();
        } catch (err) {
            showToast('error', err instanceof Error ? err.message : 'Invalid timetable code');
        } finally {
            setImporting(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Timetable QR Share & Import"
            subtitle={`Semester ${semester} · Works offline between Phone & Desktop`}
            icon={<QrCode size={18} />}
            size="md"
        >
            <div className="space-y-5">
                <RubberSegment<'share' | 'import'>
                    options={[
                        { id: 'share', label: 'Share My Timetable', icon: <QrCode size={12} /> },
                        { id: 'import', label: 'Import Code', icon: <Upload size={12} /> },
                    ]}
                    value={tab}
                    size="sm"
                    layoutId="desktop-tt-qr-tab"
                    onChange={setTab}
                />

                {tab === 'share' ? (
                    totalSlots === 0 ? (
                        <div className="rounded-2xl border border-primary/15 bg-on-surface/[0.03] p-6 text-center space-y-2">
                            <p className="text-sm font-bold text-on-surface">No slots to share yet</p>
                            <p className="text-xs text-on-surface-variant">
                                Add at least one class slot to Semester {semester} first, or switch to Import Code to pull a schedule from your phone.
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-4">
                            <div className="p-3.5 rounded-3xl bg-white shadow-md border border-black/10">
                                {qrDataUrl ? (
                                    <img
                                        src={qrDataUrl}
                                        alt={`Semester ${semester} Timetable QR`}
                                        className="w-56 h-56 rounded-xl block"
                                    />
                                ) : (
                                    <div className="w-56 h-56 flex items-center justify-center text-xs text-slate-500">
                                        Generating QR…
                                    </div>
                                )}
                            </div>
                            <p className="text-xs text-center text-on-surface-variant">
                                <span className="font-bold text-on-surface">{totalSlots} slots</span> ·{' '}
                                <span className="font-bold text-on-surface">{periods.length} periods</span>. Scan from the Semester Android app or copy the code below — missing courses are created and linked automatically.
                            </p>
                            <div className="grid grid-cols-2 gap-2.5 w-full">
                                <Button
                                    onClick={handleCopyCode}
                                    icon={copied ? <Check size={14} /> : <Copy size={14} />}
                                    className="w-full"
                                >
                                    {copied ? 'Copied!' : 'Copy Code'}
                                </Button>
                                <Button
                                    variant="secondary"
                                    onClick={handleDownloadQr}
                                    disabled={!qrDataUrl}
                                    icon={<Download size={14} />}
                                    className="w-full"
                                >
                                    Save QR PNG
                                </Button>
                            </div>
                        </div>
                    )
                ) : (
                    <div className="space-y-3.5">
                        <p className="text-xs text-on-surface-variant leading-relaxed">
                            Paste a <span className="font-mono font-bold text-primary">SEMQR2:...</span> code copied from the Semester Android app or a classmate. Matching courses link automatically and missing ones are added to Semester {semester}.
                        </p>
                        <textarea
                            rows={4}
                            value={pasteCode}
                            onChange={(e) => setPasteCode(e.target.value)}
                            placeholder="SEMQR2:{&quot;p&quot;:[...],&quot;s&quot;:[...],&quot;t&quot;:[...]}"
                            className="w-full rounded-2xl bg-on-surface/[0.04] border border-primary/20 p-3 text-xs font-mono text-on-surface outline-none focus:border-primary transition-colors resize-none"
                        />
                        <div className="flex justify-end gap-2 pt-1">
                            <Button variant="text" onClick={onClose}>Cancel</Button>
                            <Button onClick={handleImport} isLoading={importing} disabled={!pasteCode.trim()}>
                                Import into Sem {semester}
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default TimetableQrModal;
