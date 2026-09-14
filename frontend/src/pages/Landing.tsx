import React, { useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { usePageMeta } from '@/hooks/usePageMeta';
import { getCopyrightYears } from '@/utils/copyright';
import { Sun, Moon, ArrowRight, Calendar, Clock, Activity, CheckCircle2 } from 'lucide-react';
import Button from '@/components/ui/Button';

// Premium Landing Page featuring interactive split layout and floating widgets in black & white theme
const Landing: React.FC = () => {
    const { isAuthenticated } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const [scrolled, setScrolled] = useState(false);

    // Track scroll position to style navbar
    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 8);
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    usePageMeta({
        title: 'Semester | Academic Workspace',
        description: 'Personal workspace for Kuber Bassi.',
        indexable: false,
    });

    // Automatically navigate to dashboard if already logged in
    if (isAuthenticated) {
        return <Navigate to="/dashboard" replace />;
    }

    // Floating animation configurations for Framer Motion
    const floatVariants = (yOffset = 10, duration = 5, delay = 0) => ({
        animate: {
            y: [0, -yOffset, 0],
            transition: {
                duration: duration,
                repeat: Infinity,
                repeatType: "reverse" as const,
                ease: "easeInOut" as const,
                delay: delay
            }
        }
    });

    return (
        <div className="min-h-screen text-on-background select-none flex flex-col justify-between relative bg-background overflow-x-hidden transition-colors duration-300">
            
            {/* ── Navbar ── */}
            <nav className={[
                'sticky top-0 z-50 w-full transition-all duration-300 ease-in-out',
                scrolled
                    ? 'border-b border-outline bg-surface/80 backdrop-blur-md shadow-sm'
                    : 'border-b border-transparent bg-transparent',
            ].join(' ')}>
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-3 group">
                        <div className="w-8 h-8 rounded bg-primary flex items-center justify-center border border-outline/10 shadow-sm transition-transform duration-300 group-hover:rotate-6">
                            <img src="/Semester-logo-96.png" alt="Z" width="24" height="24" className="w-6 h-6 object-contain invert dark:invert-0" />
                        </div>
                        <span className="font-extrabold text-lg tracking-tight text-on-surface">Semester</span>
                    </Link>

                    <div className="flex items-center gap-4">
                        <button
                            onClick={toggleTheme}
                            className="w-9 h-9 flex items-center justify-center rounded-lg border border-outline bg-surface hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-all duration-200 cursor-pointer shadow-sm active:scale-95"
                            title="Toggle theme"
                        >
                            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                        </button>
                        
                        <Link to="/login" className="no-fluid">
                            <Button variant="outlined" size="sm" className="rounded-lg font-medium border border-outline hover:bg-surface-container">Sign In</Button>
                        </Link>
                    </div>
                </div>
            </nav>

            {/* ── Hero Area ── */}
            <main className="flex-1 w-full flex items-center relative z-10 py-6 md:py-10">
                <div className="max-w-7xl mx-auto px-6 w-full grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
                    
                    {/* Left Column: Hero copy and actions */}
                    <div className="col-span-1 lg:col-span-6 flex flex-col items-start text-left relative z-10">
                        {/* Tag/Badge */}
                        <motion.div
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, ease: "easeOut" }}
                            className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-outline bg-surface/50 text-xs text-on-surface font-semibold mb-6 backdrop-blur-md shadow-sm"
                        >
                            <span className="w-1.5 h-1.5 rounded-full bg-on-surface animate-pulse" />
                            <span>Academic Hub &bull; Kuber Bassi</span>
                        </motion.div>

                        {/* Title */}
                        <motion.h1
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
                            className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.08] text-on-surface mb-6"
                        >
                            Your academic life, <br className="hidden sm:inline" />
                            <span className="text-on-surface/90">beautifully structured.</span>
                        </motion.h1>

                        {/* Subtitle */}
                        <motion.p
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
                            className="text-sm sm:text-base md:text-lg text-on-surface-variant/80 max-w-xl leading-relaxed mb-8"
                        >
                            A highly integrated personal workspace designed to organize your semester workflow. Track course attendance, coordinate timetable schedules, manage lab practicals, and monitor academic progress with elegant ease.
                        </motion.p>

                        {/* CTAs */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, ease: "easeOut", delay: 0.3 }}
                            className="flex flex-wrap items-center gap-4 w-full sm:w-auto"
                        >
                            <Link to="/login" className="w-full sm:w-auto no-fluid">
                                <Button 
                                    variant="primary" 
                                    size="lg" 
                                    className="w-full sm:w-auto shadow-lg shadow-primary/10 hover:shadow-primary/20 hover:shadow-xl rounded-xl font-semibold px-8 transition-all"
                                    icon={<ArrowRight size={15} className="group-hover:translate-x-1 transition-transform" />}
                                >
                                    Access Dashboard
                                </Button>
                            </Link>
                        </motion.div>
                    </div>

                    {/* Right Column: Interactive floating mock widgets */}
                    <div className="col-span-1 lg:col-span-6 relative w-full h-[360px] sm:h-[420px] md:h-[440px] lg:h-[460px] flex items-center justify-center">
                        <div className="absolute inset-0 flex items-center justify-center">
                            
                            {/* Widget 1: Timetable Schedule */}
                            <motion.div
                                variants={floatVariants(12, 6, 0)}
                                animate="animate"
                                whileHover={{ scale: 1.02, rotate: -1, y: -5, transition: { duration: 0.2 } }}
                                className="absolute pointer-events-auto top-[5%] left-[2%] sm:left-[5%] md:left-[10%] w-[240px] sm:w-[280px] bg-surface/50 backdrop-blur-xl border border-outline/25 p-4 sm:p-5 rounded-2xl shadow-xl flex flex-col gap-3.5 select-none"
                            >
                                <div className="flex items-center justify-between border-b border-outline/10 pb-2">
                                    <div className="flex items-center gap-2">
                                        <Calendar size={14} className="text-on-surface" />
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/60">Today's Schedule</span>
                                    </div>
                                    <span className="w-2 h-2 rounded-full bg-on-surface animate-pulse" />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-start gap-3 p-2 rounded-lg bg-primary/5 border border-primary/10">
                                        <Clock size={12} className="text-primary mt-0.5" />
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold text-on-surface">Software Engineering</span>
                                            <span className="text-[9px] text-on-surface-variant/70">10:00 AM - 11:30 AM &bull; L-1</span>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3 p-2 rounded-lg hover:bg-surface-container/30 transition-colors">
                                        <Clock size={12} className="text-on-surface-variant/40 mt-0.5" />
                                        <div className="flex flex-col">
                                            <span className="text-xs font-semibold text-on-surface/80">Artificial Intelligence</span>
                                            <span className="text-[9px] text-on-surface-variant/50">01:30 PM - 03:00 PM &bull; Lab 3</span>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>

                            {/* Widget 2: Attendance Tracker */}
                            <motion.div
                                variants={floatVariants(10, 5, 0.7)}
                                animate="animate"
                                whileHover={{ scale: 1.02, rotate: 1, y: -5, transition: { duration: 0.2 } }}
                                className="absolute pointer-events-auto top-[25%] right-[2%] sm:right-[5%] md:right-[8%] w-[190px] sm:w-[210px] bg-surface/50 backdrop-blur-xl border border-outline/25 p-4 sm:p-5 rounded-2xl shadow-xl flex flex-col items-center gap-3.5 select-none"
                            >
                                <div className="w-full flex items-center gap-2 border-b border-outline/10 pb-2">
                                    <Activity size={14} className="text-on-surface" />
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/60">Attendance</span>
                                </div>
                                <div className="relative flex items-center justify-center w-24 h-24">
                                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                                        <circle 
                                            cx="50" 
                                            cy="50" 
                                            r="38" 
                                            stroke="var(--md-sys-color-outline)" 
                                            strokeOpacity={0.25} 
                                            strokeWidth="6" 
                                            fill="none" 
                                        />
                                        <motion.circle 
                                            cx="50" 
                                            cy="50" 
                                            r="38" 
                                            stroke="var(--md-sys-color-primary)" 
                                            strokeWidth="6" 
                                            strokeLinecap="round" 
                                            fill="none" 
                                            initial={{ pathLength: 0 }}
                                            animate={{ pathLength: 0.79 }}
                                            transition={{ duration: 1.5, ease: "easeOut" }}
                                        />
                                    </svg>
                                    <div className="absolute flex flex-col items-center justify-center">
                                        <span className="text-lg font-black text-on-surface">79.0%</span>
                                        <span className="text-[8px] font-medium text-on-surface-variant/50">Overall Avg</span>
                                    </div>
                                </div>
                                <div className="text-center">
                                    <span className="text-[9px] font-bold text-on-surface bg-primary/10 px-2 py-0.5 rounded-full uppercase tracking-wide">Safe to bunk: 2 classes</span>
                                </div>
                            </motion.div>

                            {/* Widget 3: Practical Checklist */}
                            <motion.div
                                variants={floatVariants(14, 7, 0.3)}
                                animate="animate"
                                whileHover={{ scale: 1.02, rotate: -0.5, y: -5, transition: { duration: 0.2 } }}
                                className="absolute pointer-events-auto bottom-[8%] left-[8%] sm:left-[12%] md:left-[15%] w-[210px] sm:w-[230px] bg-surface/50 backdrop-blur-xl border border-outline/25 p-4 sm:p-5 rounded-2xl shadow-xl flex flex-col gap-3 select-none"
                            >
                                <div className="flex items-center gap-2 border-b border-outline/10 pb-2">
                                    <CheckCircle2 size={14} className="text-on-surface" />
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/60">Practical Checklist</span>
                                </div>
                                <div className="flex flex-col gap-2.5">
                                    <div className="flex items-center gap-2.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-on-surface" />
                                        <span className="text-xs font-semibold text-on-surface/90">Compiler Design Lab</span>
                                        <span className="ml-auto text-[9px] text-on-surface bg-primary/10 px-1.5 py-0.2 rounded font-medium">Done</span>
                                    </div>
                                    <div className="flex items-center gap-2.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-on-surface" />
                                        <span className="text-xs font-semibold text-on-surface/90">Networks Assignment</span>
                                        <span className="ml-auto text-[9px] text-on-surface bg-primary/10 px-1.5 py-0.2 rounded font-medium">Done</span>
                                    </div>
                                    <div className="flex items-center gap-2.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-on-surface/30 animate-pulse" />
                                        <span className="text-xs font-semibold text-on-surface/70">AI Project Phase 1</span>
                                        <span className="ml-auto text-[9px] text-on-surface-variant/60 border border-outline/30 px-1.5 py-0.2 rounded font-medium">Pending</span>
                                    </div>
                                </div>
                            </motion.div>

                        </div>
                    </div>

                </div>
            </main>

            {/* ── Footer ── */}
            <footer className="w-full max-w-7xl px-6 z-10 mx-auto pb-6">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-outline/10">
                    <p className="text-[10px] text-on-surface-variant/40 font-medium">
                        &copy; {getCopyrightYears(2025)} Semester &mdash; made something cool by{' '}
                        <a
                            href="https://kuberbassi.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="glow-link font-semibold transition-all duration-300 hover:text-primary"
                        >
                            Kuber Bassi
                        </a>
                    </p>

                    <div className="flex gap-4">
                        <a href="/terms" className="text-[10px] text-on-surface-variant/45 hover:text-on-surface hover:underline transition-colors font-medium">Terms</a>
                        <a href="/privacy" className="text-[10px] text-on-surface-variant/45 hover:text-on-surface hover:underline transition-colors font-medium">Privacy</a>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default Landing;
