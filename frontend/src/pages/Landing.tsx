import React, { useState, useEffect } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { usePageMeta } from '@/hooks/usePageMeta';
import { getCopyrightYears } from '@/utils/copyright';
import {
    Sun, Moon, Download, FileText, Shield, Cpu,
    Layers, CheckCircle2, ChevronRight, Terminal
} from 'lucide-react';
import BrandLogo from '@/components/ui/BrandLogo';
import { FramerSpotlightCard } from '@/components/ui/FramerSpotlightCard';
import { AuroraGlow } from '@/components/ui/AuroraGlow';
import { FullCardLiquidFill } from '@/components/ui/FullCardLiquidFill';
import { WhatIfBunkSimulator } from '@/components/dashboard/WhatIfBunkSimulator';
import { LivePeriodRadarWidget } from '@/components/dashboard/LivePeriodRadarWidget';
import { enableDevTestMode } from '@/utils/devTestData';
import { ClickSpark, FuseButton, SloshGauge } from '@/components/react-bits';

const Landing: React.FC = () => {
    const { isAuthenticated } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const [scrolled, setScrolled] = useState(false);
    const navigate = useNavigate();

    // Interactive demo states
    const [demoPct, setDemoPct] = useState(82.4);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 12);
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    usePageMeta({
        title: 'Semester | The Academic Superapp for College Students',
        description: 'Offline-first, high-performance academic tracker with dynamic GSAP liquid physics, live period radar, IPU portal integration, and zero cloud subscription.',
    });

    if (isAuthenticated) {
        return <Navigate to="/dashboard" replace />;
    }

    const handleEnterDevMode = () => {
        enableDevTestMode();
        navigate('/dashboard');
    };

    return (
        <div className="min-h-screen bg-[#070709] text-[#f2f2f5] font-sans selection:bg-cyan-500/30 selection:text-white relative overflow-x-hidden transition-colors duration-300">
            {/* Top Atmospheric Aurora Glows */}
            <AuroraGlow variant="cyan" className="top-[-100px] left-1/2 -translate-x-1/2" intensity="vibrant" />
            <AuroraGlow variant="purple" className="top-[450px] right-[-150px]" intensity="vibrant" />
            <AuroraGlow variant="amber" className="top-[1200px] left-[-150px]" intensity="subtle" />

            {/* Subtle Grid Pattern Overlay */}
            <div
                className="pointer-events-none absolute inset-0 -z-10 opacity-[0.035]"
                style={{
                    backgroundImage: `linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)`,
                    backgroundSize: '48px 48px',
                }}
            />

            {/* ── Fixed Framer Navigation ── */}
            <header className={[
                'sticky top-0 z-50 w-full transition-all duration-300',
                scrolled
                    ? 'border-b border-white/[0.08] bg-[#070709]/80 backdrop-blur-xl shadow-2xl'
                    : 'border-b border-transparent bg-transparent',
            ].join(' ')}>
                <div className="max-w-7xl mx-auto px-6 h-18 flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-3 group">
                        <BrandLogo size={36} className="drop-shadow-[0_6px_12px_rgba(79,70,229,0.4)] transition-transform duration-300 group-hover:scale-105" />
                        <span className="font-display font-extrabold text-xl tracking-tight text-white flex items-center gap-2">
                            Semester
                            <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                                3.0 Core
                            </span>
                        </span>
                    </Link>

                    {/* Nav Actions */}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleEnterDevMode}
                            className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-indigo-400/30 bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 text-xs font-bold transition-all shadow-lg active:scale-95 cursor-pointer"
                        >
                            <Terminal size={13} className="text-cyan-400" />
                            <span>Dev Test Mode</span>
                        </button>

                        <button
                            onClick={toggleTheme}
                            className="w-9 h-9 flex items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] text-white/70 hover:text-white transition-all cursor-pointer"
                            title="Toggle theme"
                        >
                            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                        </button>

                        <Link to="/login">
                            <button className="px-4 py-2 rounded-xl text-xs font-semibold border border-white/[0.12] bg-white/[0.06] hover:bg-white/[0.12] text-white transition-all cursor-pointer">
                                Sign In
                            </button>
                        </Link>
                    </div>
                </div>
            </header>

            {/* ── Main Hero Section ── */}
            <main className="max-w-7xl mx-auto px-6 pt-16 pb-24 relative z-10">
                <div className="flex flex-col items-center text-center max-w-4xl mx-auto mb-20">
                    
                    {/* Micro Pill Badge */}
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/[0.15] bg-white/[0.03] backdrop-blur-xl mb-8 shadow-[0_0_25px_rgba(6,182,212,0.15)]"
                    >
                        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                        <span className="text-xs font-semibold text-white/90 tracking-wide">
                            Shared Rust Core • Native Windows &amp; Android Apps
                        </span>
                        <ChevronRight size={13} className="text-white/40" />
                    </motion.div>

                    {/* Grand Headline */}
                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                        className="text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight leading-[1.08] mb-6 text-white"
                    >
                        Attendance is your canvas.
                        <br />
                        <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-teal-300 to-indigo-400">
                            College, automated.
                        </span>
                    </motion.h1>

                    {/* Subtitle */}
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                        className="text-base sm:text-lg md:text-xl text-white/60 max-w-2xl font-normal leading-relaxed mb-10"
                    >
                        Engineered with physical GSAP fluid dynamics, live timetable radar, direct IPU result scraping, and real-time BunkGuard trajectory simulation. 100% offline, zero cloud tax.
                    </motion.p>

                    {/* Primary Hero CTAs */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.3 }}
                        className="flex flex-wrap items-center justify-center gap-4 w-full"
                    >
                        {/* Windows Installer Button */}
                        <ClickSpark sparkColor="#ffffff" sparkCount={12} sparkRadius={30}>
                            <a
                                href="/dist-installers/Semester-Setup.exe"
                                download="Semester-Setup.exe"
                                className="group relative inline-flex items-center justify-center gap-3 px-6 py-4 rounded-2xl bg-white text-black font-bold text-sm transition-all duration-300 hover:shadow-[0_0_35px_rgba(255,255,255,0.4)] hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                            >
                                <Download size={18} className="transition-transform group-hover:-translate-y-0.5" />
                                <span>Download for Windows (.exe)</span>
                                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-black/10 text-black/70">
                                    64-bit
                                </span>
                            </a>
                        </ClickSpark>

                        {/* Android APK Button */}
                        <ClickSpark sparkColor="#22d3ee" sparkCount={12} sparkRadius={30}>
                            <a
                                href="https://github.com/kuberbassi/semester/releases"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center gap-3 px-6 py-4 rounded-2xl border border-white/[0.15] bg-white/[0.05] hover:bg-white/[0.1] text-white font-bold text-sm transition-all duration-300 backdrop-blur-xl hover:border-cyan-500/40 hover:shadow-[0_0_30px_rgba(6,182,212,0.2)] hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                            >
                                <Cpu size={18} className="text-cyan-400" />
                                <span>Download Android APK</span>
                                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                                    $0 Free
                                </span>
                            </a>
                        </ClickSpark>

                        {/* Instant Dev Mode */}
                        <FuseButton
                            onClick={handleEnterDevMode}
                            variant="primary"
                            className="px-5 py-4 text-sm"
                        >
                            <Terminal size={16} className="text-cyan-400 mr-2 inline-block" />
                            <span>Launch Dev Test Mode</span>
                        </FuseButton>
                    </motion.div>

                    {/* Trust Indicators */}
                    <div className="mt-10 flex flex-wrap items-center justify-center gap-8 text-xs font-medium text-white/40">
                        <div className="flex items-center gap-2">
                            <Shield size={14} className="text-emerald-400" />
                            <span>100% Local SQLite Storage</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <CheckCircle2 size={14} className="text-cyan-400" />
                            <span>Zero Subscription Fees Forever</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Terminal size={14} className="text-purple-400" />
                            <span>Shared High-Performance Rust Core</span>
                        </div>
                    </div>
                </div>

                {/* ── Framer Showcase Bento Grid (The 6 Signature Cards) ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

                    {/* Card 1: Full Card Gradient Liquid Fill Reservoir (Cyan/Emerald Aura) */}
                    <FullCardLiquidFill
                        percentage={demoPct}
                        attended={183}
                        total={224}
                        safeBunks={20}
                        deficitCount={1}
                        targetThreshold={75}
                        className="h-full min-h-[380px]"
                        onSlosh={() => setDemoPct(p => (p >= 85 ? 81.7 : Math.round((p + 1.5) * 10) / 10))}
                    />

                    {/* Card 2: Live Period Radar (Cobalt Blue Aura) */}
                    <FramerSpotlightCard glowColor="blue" className="p-8 flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/30">
                                    Timetable Beacon
                                </span>
                                <span className="relative flex h-2.5 w-2.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
                                </span>
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">
                                Live Period Radar
                            </h2>
                            <p className="text-xs text-white/50 leading-relaxed mb-6">
                                Real-time spatial tracking of ongoing periods. Displays animated countdown rings with instant 1-tap fast attendance marking.
                            </p>
                        </div>

                        {/* Interactive Radar Component */}
                        <div className="overflow-hidden rounded-2xl border border-white/[0.05] bg-black/40 p-4">
                            <LivePeriodRadarWidget
                                slots={[
                                    {
                                        id: 'demo-slot-1',
                                        day: 'Monday',
                                        start_time: '10:00',
                                        end_time: '11:00',
                                        subject_name: 'Design & Analysis of Algorithms',
                                        classroom: 'Room 402',
                                        type: 'class',
                                    },
                                ]}
                                subjects={[
                                    {
                                        _id: 'sub-algo',
                                        name: 'Design & Analysis of Algorithms',
                                        code: 'CST-301',
                                        credits: 4,
                                        semester: 5,
                                        attended: 38,
                                        total: 42,
                                    } as any,
                                ]}
                                onMarkAttendance={() => {}}
                            />
                        </div>
                    </FramerSpotlightCard>

                    {/* Card 3: What-If Bunk Simulator (Amber Aura) */}
                    <FramerSpotlightCard glowColor="amber" className="p-8 flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30">
                                    Trajectory Engine
                                </span>
                                <Layers size={16} className="text-amber-400" />
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">
                                What-If Bunk Simulator
                            </h2>
                            <p className="text-xs text-white/50 leading-relaxed mb-6">
                                Slide to project your exact attendance percentage weeks into the future. Know precisely how many classes you can afford to skip.
                            </p>
                        </div>

                        {/* Interactive What-If Component */}
                        <div className="overflow-hidden rounded-2xl border border-white/[0.05] bg-black/40 p-4">
                            <WhatIfBunkSimulator
                                overallAttended={38}
                                overallTotal={42}
                                targetThreshold={75}
                            />
                        </div>
                    </FramerSpotlightCard>

                    {/* Card 4: IPU Result Scraper & PDF Exporter (Purple Aura) */}
                    <FramerSpotlightCard glowColor="purple" className="p-8 flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-purple-400 px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/30">
                                    GGSIPU Integration
                                </span>
                                <Download size={16} className="text-purple-400" />
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">
                                Portal Scraper &amp; PDF Exporter
                            </h2>
                            <p className="text-xs text-white/50 leading-relaxed mb-6">
                                Captcha-relay scraper connecting directly to IPU backend (`examweb.ggsipu.ac.in`). Formats results into official single-page vectorized academic PDF summaries.
                            </p>
                        </div>

                        <div className="space-y-3 bg-black/40 p-5 rounded-2xl border border-white/[0.05]">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-white/80">Cumulative CGPA</span>
                                <span className="text-sm font-black text-purple-400">8.98 / 10.0</span>
                            </div>
                            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 w-[89.8%]" />
                            </div>
                            <div className="flex justify-between text-[10px] text-white/40 pt-1 font-mono">
                                <span>Sem 1: 8.85</span>
                                <span>Sem 2: 9.12</span>
                                <span>Sem 3: 8.65</span>
                                <span>Sem 4: 9.30</span>
                            </div>
                        </div>
                    </FramerSpotlightCard>

                    {/* Card 5: Tiptap Rich Notes & Tasks (Emerald Aura) */}
                    <FramerSpotlightCard glowColor="emerald" className="p-8 flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30">
                                    Knowledge Base
                                </span>
                                <FileText size={16} className="text-emerald-400" />
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">
                                Notes &amp; Task Checklist
                            </h2>
                            <p className="text-xs text-white/50 leading-relaxed mb-6">
                                Fully restored Tiptap rich-text editor with markdown formatting, exam checklists, color coding, and local SQLite persistence.
                            </p>
                        </div>

                        <div className="space-y-2 bg-black/40 p-5 rounded-2xl border border-white/[0.05]">
                            <div className="flex items-center gap-2.5 text-xs text-white/80">
                                <span className="w-4 h-4 rounded bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-bold">✓</span>
                                <span className="line-through text-white/40">Dynamic Programming (Knapsack &amp; LCS)</span>
                            </div>
                            <div className="flex items-center gap-2.5 text-xs text-white/80">
                                <span className="w-4 h-4 rounded bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-bold">✓</span>
                                <span className="line-through text-white/40">MST Kruskal &amp; Prim Algorithms</span>
                            </div>
                            <div className="flex items-center gap-2.5 text-xs text-white/90">
                                <span className="w-4 h-4 rounded border border-white/20" />
                                <span>Graph Reductions &amp; Dijkstra</span>
                            </div>
                        </div>
                    </FramerSpotlightCard>

                    {/* Card 6: Zero Cloud Tax & Rust Core (Silver/Default Aura) */}
                    <FramerSpotlightCard glowColor="default" className="p-8 flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-white/70 px-2.5 py-1 rounded-full bg-white/10 border border-white/20">
                                    $0 Forever
                                </span>
                                <Shield size={16} className="text-white/70" />
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">
                                Zero Cloud Tax
                            </h2>
                            <p className="text-xs text-white/50 leading-relaxed mb-6">
                                Zero subscriptions, no Apple tax, no server lock-in. Powered by embedded SQLite, native Kotlin bindings, and Tauri v2.
                            </p>
                        </div>

                        <div className="p-5 rounded-2xl bg-black/40 border border-white/[0.05] flex items-center justify-between gap-4">
                            <div className="space-y-2 flex-1">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-white/60">Distribution</span>
                                    <span className="font-bold text-white">Direct .apk &amp; .exe</span>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-white/60">Database</span>
                                    <span className="font-bold text-white">Embedded SQLite (0ms)</span>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-white/60">Backup</span>
                                    <span className="font-bold text-white">Google Drive</span>
                                </div>
                            </div>
                            <div className="shrink-0">
                                <SloshGauge
                                    value={100}
                                    size={80}
                                    strokeWidth={6}
                                    color="#10b981"
                                    label="Offline"
                                    sublabel="Native"
                                />
                            </div>
                        </div>
                    </FramerSpotlightCard>

                </div>

                {/* ── Web-to-App Data Migration Hub ── */}
                <div className="mt-20 p-8 md:p-12 rounded-3xl bg-gradient-to-b from-white/[0.04] to-transparent border border-white/[0.08] backdrop-blur-2xl relative overflow-hidden">
                    <AuroraGlow variant="cyan" className="bottom-[-100px] right-[-100px]" intensity="subtle" />
                    
                    <div className="max-w-3xl">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-400 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30">
                            Data Migration
                        </span>
                        <h3 className="text-3xl font-extrabold text-white mt-4 mb-3 tracking-tight">
                            Migrating from the legacy web app or Google Drive?
                        </h3>
                        <p className="text-sm text-white/60 leading-relaxed mb-8">
                            If you already have attendance records saved in the old web app, your data is completely safe. Semester automatically restores your past records directly from Google Drive `appDataFolder` (`semester_backup_*.json`) or local snapshot files.
                        </p>

                        <div className="flex flex-wrap items-center gap-4">
                            <button
                                onClick={handleEnterDevMode}
                                className="px-5 py-3 rounded-xl bg-white text-black font-bold text-xs hover:bg-white/90 transition-all cursor-pointer shadow-lg active:scale-95"
                            >
                                Test with Preloaded Data
                            </button>
                            <Link to="/login">
                                <button className="px-5 py-3 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 text-white font-bold text-xs transition-all cursor-pointer">
                                    Sign in to Restore Cloud Backup
                                </button>
                            </Link>
                        </div>
                    </div>
                </div>
            </main>

            {/* ── Framer Footer ── */}
            <footer className="border-t border-white/[0.08] py-12 px-6 bg-[#050507] relative z-10 text-xs text-white/40">
                <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-3">
                        <BrandLogo size={22} />
                        <span className="font-semibold text-white/80">Semester</span>
                        <span>•</span>
                        <span>{getCopyrightYears()} Kuber Bassi</span>
                    </div>

                    <div className="flex items-center gap-6">
                        <button
                            onClick={handleEnterDevMode}
                            className="text-emerald-400 hover:text-emerald-300 font-semibold transition-colors cursor-pointer"
                        >
                            Dev Test Mode
                        </button>
                        <Link to="/login" className="hover:text-white transition-colors">
                            Portal Login
                        </Link>
                        <a
                            href="https://github.com/kuberbassi/semester"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-white transition-colors"
                        >
                            GitHub
                        </a>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default Landing;
