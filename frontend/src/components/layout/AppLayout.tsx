import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp } from 'lucide-react';
import BottomNav from './BottomNav';
import AIChat from './AIChat';
import PageTransition from '../ui/PageTransition';
import OpeningReveal from '../ui/OpeningReveal';

// Main application layout wrapper (Tauri Desktop .exe & Web)
const AppLayout: React.FC = () => {
    const [showScrollTop, setShowScrollTop] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setShowScrollTop(window.scrollY > 120);
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <div className="min-h-screen bg-background font-sans text-on-background flex relative overflow-x-hidden">
            {/* OpenTune-style portal launch reveal (once per session) */}
            <OpeningReveal />

            {/* OpenTune SoftGlow ambient radial top glow */}
            <div className="ambient-top-glow" aria-hidden="true" />

            {/* OpenTune TopEdgeFrost progressive top fade */}
            <div className="top-edge-frost" aria-hidden="true" />

            {/* Main Content Area */}
            <div className="flex-1 min-w-0 flex flex-col min-h-screen relative z-10">
                <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 pt-10 pb-32 md:px-8 md:pt-12 md:pb-28 relative z-10">
                    <PageTransition>
                        <Outlet />
                    </PageTransition>
                </main>
            </div>

            {/* OpenTune Stretching-Lens Floating Liquid Glass Dock + Digital Crown Orb */}
            <BottomNav />

            {/* Neural AI Assistant */}
            <AIChat />

            {/* Scroll to Top Floating Glass Button */}
            <AnimatePresence>
                {showScrollTop && (
                    <motion.button
                        initial={{ opacity: 0, scale: 0.8, y: 15 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.8, y: 15 }}
                        transition={{ type: 'spring', stiffness: 460, damping: 28 }}
                        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                        className="fixed bottom-[98px] right-8 lg:right-10 z-40 w-10 h-10 rounded-full liquid-glass-pill text-on-surface flex items-center justify-center cursor-pointer active:scale-90"
                        title="Scroll to Top"
                    >
                        <ArrowUp size={16} />
                    </motion.button>
                )}
            </AnimatePresence>
        </div>
    );
};

export default AppLayout;
