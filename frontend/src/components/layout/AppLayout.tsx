import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp } from 'lucide-react';
import DesktopSidebar from './DesktopSidebar';
import BottomNav from './BottomNav';
import AIChat from './AIChat';
import PageTransition from '../ui/PageTransition';
import OpeningReveal from '../ui/OpeningReveal';
import { getCopyrightYears } from '@/utils/copyright';
import ExternalLink from '../ui/ExternalLink';
import { isTauriDesktop } from '@/utils/platform';
import { desktopDb } from '@/services/desktopDb';
import { notifyDesktopMutation } from '@/services/attendance.service';

/**
 * Native macOS Desktop Split-Pane Shell (>= md) + Mobile Floating Dock (< md)
 * layered over an animated, GPU-composited multi-tone liquid aurora canvas.
 */
const AppLayout: React.FC = () => {
    const [showScrollTop, setShowScrollTop] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setShowScrollTop(window.scrollY > 280);
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // Instant 2-way sync wakeup on window focus/visibility (desktop Tauri only)
    // Checks lightweight Drive peer metadata (~200 bytes) and merges mobile edits seamlessly.
    useEffect(() => {
        if (!isTauriDesktop()) return;
        let lastCheck = 0;
        let inFlight = false;

        const pullIfStale = async () => {
            const now = Date.now();
            if (inFlight || now - lastCheck < 15_000) return;
            lastCheck = now;
            inFlight = true;
            try {
                const res = await desktopDb.drivePullSync();
                if (res?.merged) {
                    notifyDesktopMutation();
                }
            } catch {
                // Silent when offline or Drive not linked
            } finally {
                inFlight = false;
            }
        };

        const onFocus = () => {
            void pullIfStale();
        };
        const onVisibility = () => {
            if (document.visibilityState === 'visible') {
                void pullIfStale();
            }
        };

        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onVisibility);
        const pollTimer = window.setInterval(() => {
            if (document.visibilityState === 'visible') {
                void pullIfStale();
            }
        }, 60_000);

        return () => {
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onVisibility);
            window.clearInterval(pollTimer);
        };
    }, []);

    return (
        <div className="min-h-screen bg-background font-sans text-on-background flex relative overflow-x-clip">
            {/* Portal launch reveal (once per session) */}
            <OpeningReveal />

            {/* Animated GPU-Composited Liquid Aurora Canvas (crisp vibrant Light & deep Obsidian Dark) */}
            <div className="pointer-events-none fixed inset-0 overflow-hidden z-0" aria-hidden="true">
                <div
                    className="absolute -top-28 -left-24 w-[520px] h-[520px] rounded-full opacity-[0.22] dark:opacity-[0.12]"
                    style={{
                        background: 'radial-gradient(circle, rgba(99,102,241,0.52) 0%, rgba(59,130,246,0.22) 45%, transparent 72%)',
                    }}
                />
                <div
                    className="absolute top-[18%] -right-28 w-[540px] h-[540px] rounded-full opacity-[0.20] dark:opacity-[0.11]"
                    style={{
                        background: 'radial-gradient(circle, rgba(6,182,212,0.52) 0%, rgba(56,189,248,0.22) 45%, transparent 72%)',
                    }}
                />
                <div
                    className="absolute -bottom-36 left-[34%] w-[560px] h-[440px] rounded-full opacity-[0.16] dark:opacity-[0.08]"
                    style={{
                        background: 'radial-gradient(circle, rgba(244,63,94,0.40) 0%, rgba(99,102,241,0.18) 45%, transparent 72%)',
                    }}
                />
            </div>

            {/* Subtle top accent atmospheric wash */}
            <div className="ambient-top-glow" aria-hidden="true" />

            {/* Native macOS Left Sidebar (Desktop >= md) */}
            <DesktopSidebar />

            {/* Main Content Workspace — unified margins across all pages */}
            <div className="flex-1 min-w-0 flex flex-col min-h-screen relative z-10">
                <main className="flex-1 w-full max-w-[1280px] mx-auto px-5 sm:px-8 lg:px-10 pt-7 pb-10 relative z-10">
                    <PageTransition>
                        <Outlet />
                    </PageTransition>
                </main>

                {/* Super Subtle Workspace Footer */}
                <footer className="w-full max-w-[1280px] mx-auto px-5 sm:px-8 lg:px-10 pt-4 pb-24 md:pb-6 border-t border-on-surface/[0.06] relative z-10">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] font-medium text-on-surface-variant/50">
                        <span>
                            &copy; {getCopyrightYears(2025)} Semester &middot; Crafted by{' '}
                            <ExternalLink href="https://kuberbassi.com" className="text-on-surface-variant/75 hover:text-primary transition-colors"
                            >
                                Kuber Bassi
                            </ExternalLink>
                        </span>
                        <div className="flex items-center gap-4 pr-0 md:pr-14">
                            <ExternalLink href="https://kuberbassi.com" data-tooltip="Open kuberbassi.com in browser" className="hover:text-on-surface transition-colors"
                            >
                                kuberbassi.com
                            </ExternalLink>
                            <span className="opacity-30">&middot;</span>
                            <ExternalLink href="mailto:me@kuberbassi.com" data-tooltip="Email me@kuberbassi.com" className="hover:text-on-surface transition-colors"
                            >
                                me@kuberbassi.com
                            </ExternalLink>
                        </div>
                    </div>
                </footer>
            </div>

            {/* Mobile-only Floating Dock & Radial Bubble Menu (< md) */}
            <div className="md:hidden">
                <BottomNav />
            </div>

            {/* Fixed Bottom-Right Assistant */}
            <AIChat />

            {/* Centered-Bottom Subtle Scroll-to-Top Capsule — zero overlap with bottom-right AI button */}
            <div className="scroll-top-centered fixed bottom-24 md:bottom-5 z-40 pointer-events-none">
                <AnimatePresence>
                    {showScrollTop && (
                        <motion.button
                            initial={{ opacity: 0, y: 12, scale: 0.94 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.94 }}
                            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                            className="no-fluid pointer-events-auto h-8 px-3.5 rounded-full liquid-glass-pill text-on-surface-variant hover:text-primary text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer"
                            title="Scroll to Top"
                        >
                            <ArrowUp size={13} className="text-primary" />
                            <span>Top</span>
                        </motion.button>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default AppLayout;
