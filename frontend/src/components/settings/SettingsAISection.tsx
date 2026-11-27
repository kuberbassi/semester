import React, { useCallback, useEffect, useState } from 'react';
import {
    Bot, Cpu, KeyRound, Eye, EyeOff, CheckCircle2, AlertCircle,
    Trash2, ShieldCheck, ExternalLink as ExternalLinkIcon, Zap, RefreshCw
} from 'lucide-react';
import { desktopDb, type AiConfig, type AiTestResult } from '@/services/desktopDb';
import { isTauriDesktop } from '@/utils/platform';
import { getErrorMessage } from '@/utils/errors';
import Select from '@/components/ui/Select';
import ExternalLink from '@/components/ui/ExternalLink';
import Loader from '@/components/ui/Loader';

type ProviderId = 'local' | 'gemini' | 'groq';

const GEMINI_MODELS = [
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Recommended)' },
    { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite (Fastest)' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Deep Reasoning)' },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
];

const GROQ_MODELS = [
    { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile (Recommended)' },
    { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant (Ultra Fast)' },
    { value: 'qwen/qwen3-32b', label: 'Qwen 3 32B' },
    { value: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B' },
];

interface SettingsAISectionProps {
    showToast: (type: 'success' | 'error' | 'warning' | 'info', message: string) => void;
}

const SettingsAISection: React.FC<SettingsAISectionProps> = ({ showToast }) => {
    const desktop = isTauriDesktop();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testingProvider, setTestingProvider] = useState<ProviderId | null>(null);
    const [config, setConfig] = useState<AiConfig | null>(null);

    const [provider, setProvider] = useState<ProviderId>('local');
    const [geminiKey, setGeminiKey] = useState('');
    const [geminiModel, setGeminiModel] = useState('gemini-2.5-flash');
    const [groqKey, setGroqKey] = useState('');
    const [groqModel, setGroqModel] = useState('llama-3.3-70b-versatile');
    const [showGeminiKey, setShowGeminiKey] = useState(false);
    const [showGroqKey, setShowGroqKey] = useState(false);

    const [testResult, setTestResult] = useState<{
        provider: ProviderId;
        ok: boolean;
        text: string;
    } | null>(null);

    const loadConfig = useCallback(async () => {
        if (!desktop) {
            setLoading(false);
            return;
        }
        try {
            const cfg = await desktopDb.aiGetConfig();
            setConfig(cfg);
            setProvider(cfg.provider || 'local');
            setGeminiModel(cfg.gemini_model || 'gemini-2.5-flash');
            setGroqModel(cfg.groq_model || 'llama-3.3-70b-versatile');
        } catch (err) {
            console.error('Failed loading AI config:', err);
        } finally {
            setLoading(false);
        }
    }, [desktop]);

    useEffect(() => {
        void loadConfig();
    }, [loadConfig]);

    const handleSave = async (overrides?: Partial<{
        provider: ProviderId;
        clear_gemini_key: boolean;
        clear_groq_key: boolean;
    }>) => {
        if (!desktop) return;
        const targetProvider = overrides?.provider ?? provider;

        if (targetProvider === 'gemini' && !geminiKey.trim() && !config?.has_gemini_key && !overrides?.clear_gemini_key) {
            showToast('warning', 'Enter your Gemini API key before selecting Gemini.');
            return;
        }
        if (targetProvider === 'groq' && !groqKey.trim() && !config?.has_groq_key && !overrides?.clear_groq_key) {
            showToast('warning', 'Enter your Groq API key before selecting Groq.');
            return;
        }

        setSaving(true);
        try {
            const updated = await desktopDb.aiSaveConfig({
                provider: targetProvider,
                gemini_api_key: geminiKey.trim() || undefined,
                gemini_model: geminiModel,
                groq_api_key: groqKey.trim() || undefined,
                groq_model: groqModel,
                clear_gemini_key: overrides?.clear_gemini_key,
                clear_groq_key: overrides?.clear_groq_key,
            });
            setConfig(updated);
            setProvider(updated.provider);
            setGeminiKey('');
            setGroqKey('');
            window.dispatchEvent(new CustomEvent('semester:ai-config-changed'));
            showToast('success', 'AI settings saved & encrypted locally');
        } catch (err) {
            showToast('error', getErrorMessage(err, 'Failed to save AI settings'));
        } finally {
            setSaving(false);
        }
    };

    const handleTest = async (target: ProviderId) => {
        if (!desktop) return;
        setTestingProvider(target);
        setTestResult(null);
        try {
            const apiKey = target === 'gemini' ? geminiKey.trim() : target === 'groq' ? groqKey.trim() : undefined;
            const model = target === 'gemini' ? geminiModel : target === 'groq' ? groqModel : undefined;
            const res: AiTestResult = await desktopDb.aiTestConnection({
                provider: target,
                apiKey: apiKey || undefined,
                model,
            });
            setTestResult({
                provider: target,
                ok: true,
                text: `Connected to ${res.model} (${res.latency_ms}ms)`,
            });
            showToast('success', `${target.toUpperCase()} verified in ${res.latency_ms}ms`);
        } catch (err) {
            const msg = getErrorMessage(err, 'Connection test failed');
            setTestResult({ provider: target, ok: false, text: msg });
            showToast('error', msg);
        } finally {
            setTestingProvider(null);
        }
    };

    if (!desktop) {
        return (
            <div className="liquid-glass rounded-[24px] p-8 text-center">
                <Bot size={24} className="text-primary mx-auto mb-2.5" />
                <p className="font-display text-sm font-bold text-on-surface">Desktop BYOK AI Configuration</p>
                <p className="text-xs text-on-surface-variant mt-1">
                    Custom Gemini and Groq API keys are available in the Semester Desktop app with OS-level encryption.
                </p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="h-48 flex items-center justify-center">
                <Loader size={20} />
            </div>
        );
    }

    const inputCls =
        'w-full h-10 px-3.5 rounded-xl border border-on-surface/[0.11] bg-on-surface/[0.04] text-on-surface text-xs font-mono placeholder:text-on-surface-variant/45 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all';

    const providerCards: Array<{
        id: ProviderId;
        title: string;
        subtitle: string;
        badge: string;
        icon: React.ComponentType<{ size?: number }>;
        ready: boolean;
    }> = [
        {
            id: 'local',
            title: 'Built-in Local Engine',
            subtitle: 'Instant offline answers directly from your SQLite database.',
            badge: 'Free · Offline',
            icon: Cpu,
            ready: true,
        },
        {
            id: 'gemini',
            title: 'Google Gemini API',
            subtitle: 'Bring your own Gemini key for deep reasoning & note writing.',
            badge: config?.has_gemini_key ? 'Key Saved' : 'BYOK',
            icon: Bot,
            ready: Boolean(config?.has_gemini_key || geminiKey.trim()),
        },
        {
            id: 'groq',
            title: 'Groq Cloud API',
            subtitle: 'Bring your own Groq key for near-instant Llama & Qwen responses.',
            badge: config?.has_groq_key ? 'Key Saved' : 'BYOK',
            icon: Zap,
            ready: Boolean(config?.has_groq_key || groqKey.trim()),
        },
    ];

    return (
        <div className="space-y-6">
            {/* Active AI Engine Selector */}
            <div className="liquid-glass rounded-[24px] overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-on-surface/[0.08] bg-on-surface/[0.015]">
                    <div className="flex items-center gap-2.5">
                        <span className="w-7 h-7 rounded-xl bg-primary/14 border border-primary/25 text-primary flex items-center justify-center">
                            <Bot size={14} />
                        </span>
                        <div>
                            <span className="font-display text-sm font-extrabold text-on-surface block leading-tight">
                                Active AI Engine
                            </span>
                            <span className="text-[11px] text-on-surface-variant">
                                Powers both Semester AI chat and the Notes AI Writer
                            </span>
                        </div>
                    </div>
                    <button
                        type="button"
                        disabled={saving}
                        onClick={() => void handleSave()}
                        className="no-fluid h-8 px-4 rounded-full btn-gradient text-xs font-bold cursor-pointer disabled:opacity-50"
                    >
                        {saving ? 'Saving…' : 'Save Changes'}
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                        {providerCards.map((card) => {
                            const Icon = card.icon;
                            const active = provider === card.id;
                            return (
                                <button
                                    key={card.id}
                                    type="button"
                                    onClick={() => setProvider(card.id)}
                                    className={`no-fluid text-left p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                                        active
                                            ? 'border-primary/45 bg-primary/[0.10] shadow-sm'
                                            : 'border-on-surface/[0.09] bg-on-surface/[0.025] hover:border-primary/25 hover:bg-on-surface/[0.05]'
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span
                                            className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                                                active
                                                    ? 'bg-gradient-to-br from-indigo-500 to-cyan-500 text-white'
                                                    : 'bg-on-surface/[0.06] text-on-surface-variant'
                                            }`}
                                        >
                                            <Icon size={15} />
                                        </span>
                                        <span
                                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                                active
                                                    ? 'bg-primary/15 border-primary/30 text-primary'
                                                    : card.ready
                                                    ? 'bg-emerald-500/12 border-emerald-500/25 text-emerald-500'
                                                    : 'bg-on-surface/[0.05] border-on-surface/[0.09] text-on-surface-variant'
                                            }`}
                                        >
                                            {card.badge}
                                        </span>
                                    </div>
                                    <div>
                                        <p className="font-display text-xs font-extrabold text-on-surface">
                                            {card.title}
                                        </p>
                                        <p className="text-[11px] text-on-surface-variant/75 mt-0.5 leading-relaxed">
                                            {card.subtitle}
                                        </p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {testResult && (
                        <div
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-xs font-semibold ${
                                testResult.ok
                                    ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-500'
                                    : 'bg-rose-500/10 border-rose-500/25 text-rose-500 dark:text-rose-400'
                            }`}
                        >
                            {testResult.ok ? <CheckCircle2 size={14} className="shrink-0" /> : <AlertCircle size={14} className="shrink-0" />}
                            <span className="truncate">{testResult.text}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Google Gemini API Configuration */}
            <div className="liquid-glass rounded-[24px] overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-on-surface/[0.08] bg-on-surface/[0.015]">
                    <div className="flex items-center gap-2.5">
                        <span className="w-7 h-7 rounded-xl bg-indigo-500/14 border border-indigo-500/25 text-primary flex items-center justify-center">
                            <KeyRound size={14} />
                        </span>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-display text-sm font-extrabold text-on-surface">Google Gemini API</span>
                            {config?.has_gemini_key && (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/12 border border-emerald-500/25 text-emerald-500 text-[10px] font-bold font-mono">
                                    {config.gemini_key_hint}
                                </span>
                            )}
                        </div>
                    </div>
                    <ExternalLink
                        href="https://aistudio.google.com/apikey"
                        className="text-[11px] font-bold text-primary hover:underline inline-flex items-center gap-1"
                    >
                        Get Gemini Key <ExternalLinkIcon size={11} />
                    </ExternalLink>
                </div>

                <div className="p-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[11px] font-semibold text-on-surface-variant mb-1.5 ml-0.5">
                                {config?.has_gemini_key ? 'Replace Gemini API Key' : 'Gemini API Key'}
                            </label>
                            <div className="relative">
                                <input
                                    type={showGeminiKey ? 'text' : 'password'}
                                    value={geminiKey}
                                    onChange={(e) => setGeminiKey(e.target.value)}
                                    placeholder={config?.has_gemini_key ? 'Leave blank to keep saved key' : 'AIzaSy...'}
                                    className={`${inputCls} pr-9`}
                                    autoComplete="off"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowGeminiKey((v) => !v)}
                                    className="no-fluid absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full text-on-surface-variant hover:text-on-surface flex items-center justify-center cursor-pointer"
                                    title={showGeminiKey ? 'Hide key' : 'Show key'}
                                >
                                    {showGeminiKey ? <EyeOff size={13} /> : <Eye size={13} />}
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-[11px] font-semibold text-on-surface-variant mb-1.5 ml-0.5">
                                Gemini Model
                            </label>
                            <Select
                                value={geminiModel}
                                onChange={(e) => setGeminiModel(e.target.value)}
                                options={GEMINI_MODELS}
                                className="h-10 rounded-xl"
                            />
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                disabled={testingProvider !== null || (!geminiKey.trim() && !config?.has_gemini_key)}
                                onClick={() => void handleTest('gemini')}
                                className="no-fluid h-8 px-3.5 rounded-full border border-on-surface/[0.12] bg-on-surface/[0.04] hover:border-primary/35 hover:bg-primary/10 hover:text-primary text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-45 transition-colors"
                            >
                                <RefreshCw size={12} className={testingProvider === 'gemini' ? 'animate-spin' : ''} />
                                {testingProvider === 'gemini' ? 'Testing…' : 'Test Gemini'}
                            </button>
                            <button
                                type="button"
                                disabled={saving || (!geminiKey.trim() && !config?.has_gemini_key)}
                                onClick={() => void handleSave({ provider: 'gemini' })}
                                className="no-fluid h-8 px-3.5 rounded-full btn-gradient text-xs font-bold cursor-pointer disabled:opacity-45"
                            >
                                Save &amp; Use Gemini
                            </button>
                        </div>

                        {config?.has_gemini_key && (
                            <button
                                type="button"
                                disabled={saving}
                                onClick={() =>
                                    void handleSave({
                                        clear_gemini_key: true,
                                        provider: provider === 'gemini' ? 'local' : provider,
                                    })
                                }
                                className="no-fluid h-8 px-3 rounded-full border border-rose-500/25 bg-rose-500/10 text-rose-500 dark:text-rose-400 hover:bg-rose-500/18 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                            >
                                <Trash2 size={12} /> Remove Key
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Groq API Configuration */}
            <div className="liquid-glass rounded-[24px] overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-on-surface/[0.08] bg-on-surface/[0.015]">
                    <div className="flex items-center gap-2.5">
                        <span className="w-7 h-7 rounded-xl bg-cyan-500/14 border border-cyan-500/25 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
                            <Zap size={14} />
                        </span>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-display text-sm font-extrabold text-on-surface">Groq API</span>
                            {config?.has_groq_key && (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/12 border border-emerald-500/25 text-emerald-500 text-[10px] font-bold font-mono">
                                    {config.groq_key_hint}
                                </span>
                            )}
                        </div>
                    </div>
                    <ExternalLink
                        href="https://console.groq.com/keys"
                        className="text-[11px] font-bold text-primary hover:underline inline-flex items-center gap-1"
                    >
                        Get Groq Key <ExternalLinkIcon size={11} />
                    </ExternalLink>
                </div>

                <div className="p-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[11px] font-semibold text-on-surface-variant mb-1.5 ml-0.5">
                                {config?.has_groq_key ? 'Replace Groq API Key' : 'Groq API Key'}
                            </label>
                            <div className="relative">
                                <input
                                    type={showGroqKey ? 'text' : 'password'}
                                    value={groqKey}
                                    onChange={(e) => setGroqKey(e.target.value)}
                                    placeholder={config?.has_groq_key ? 'Leave blank to keep saved key' : 'gsk_...'}
                                    className={`${inputCls} pr-9`}
                                    autoComplete="off"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowGroqKey((v) => !v)}
                                    className="no-fluid absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full text-on-surface-variant hover:text-on-surface flex items-center justify-center cursor-pointer"
                                    title={showGroqKey ? 'Hide key' : 'Show key'}
                                >
                                    {showGroqKey ? <EyeOff size={13} /> : <Eye size={13} />}
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-[11px] font-semibold text-on-surface-variant mb-1.5 ml-0.5">
                                Groq Model
                            </label>
                            <Select
                                value={groqModel}
                                onChange={(e) => setGroqModel(e.target.value)}
                                options={GROQ_MODELS}
                                className="h-10 rounded-xl"
                            />
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                disabled={testingProvider !== null || (!groqKey.trim() && !config?.has_groq_key)}
                                onClick={() => void handleTest('groq')}
                                className="no-fluid h-8 px-3.5 rounded-full border border-on-surface/[0.12] bg-on-surface/[0.04] hover:border-primary/35 hover:bg-primary/10 hover:text-primary text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-45 transition-colors"
                            >
                                <RefreshCw size={12} className={testingProvider === 'groq' ? 'animate-spin' : ''} />
                                {testingProvider === 'groq' ? 'Testing…' : 'Test Groq'}
                            </button>
                            <button
                                type="button"
                                disabled={saving || (!groqKey.trim() && !config?.has_groq_key)}
                                onClick={() => void handleSave({ provider: 'groq' })}
                                className="no-fluid h-8 px-3.5 rounded-full btn-gradient text-xs font-bold cursor-pointer disabled:opacity-45"
                            >
                                Save &amp; Use Groq
                            </button>
                        </div>

                        {config?.has_groq_key && (
                            <button
                                type="button"
                                disabled={saving}
                                onClick={() =>
                                    void handleSave({
                                        clear_groq_key: true,
                                        provider: provider === 'groq' ? 'local' : provider,
                                    })
                                }
                                className="no-fluid h-8 px-3 rounded-full border border-rose-500/25 bg-rose-500/10 text-rose-500 dark:text-rose-400 hover:bg-rose-500/18 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                            >
                                <Trash2 size={12} /> Remove Key
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Security & Privacy Guarantee */}
            <div className="rounded-2xl bg-on-surface/[0.03] border border-on-surface/[0.08] px-5 py-4 flex items-start gap-3 text-xs text-on-surface-variant leading-relaxed">
                <ShieldCheck size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                <div>
                    <span className="font-bold text-on-surface">Protected with Windows DPAPI Encryption.</span>{' '}
                    Your API keys are encrypted per-user inside Windows before touching disk, invoked exclusively from the native Rust backend, and automatically excluded from local JSON exports and Google Drive backups.
                </div>
            </div>
        </div>
    );
};

export default SettingsAISection;
