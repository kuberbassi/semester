import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import BrandLogo from './BrandLogo';

const OPENING_KEY = 'semester_opening_played_v2';

/**
 * Precision Brand Splash Reveal (plays once per session):
 * Theme-aware backdrop with refreshed Semester BrandLogo expanding smoothly into the app.
 * Blocks pointer events and suppresses tooltips beneath while visible.
 */
export const OpeningReveal: React.FC = () => {
    const [visible, setVisible] = useState<boolean>(() => {
        try {
            return sessionStorage.getItem(OPENING_KEY) !== '1';
        } catch {
            return false;
        }
    });

    useEffect(() => {
        if (!visible) return;
        window.dispatchEvent(new Event('semester:hide-tooltips'));
        const timer = setTimeout(() => {
            try {
                sessionStorage.setItem(OPENING_KEY, '1');
            } catch {
                // ignore storage errors
            }
            setVisible(false);
        }, 850);
        return () => {
            clearTimeout(timer);
            window.dispatchEvent(new Event('semester:hide-tooltips'));
        };
    }, [visible]);

    return (
        <AnimatePresence onExitComplete={() => window.dispatchEvent(new Event('semester:hide-tooltips'))}>
            {visible && (
                <motion.div
                    data-tooltip-blocker="true"
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    className="fixed inset-0 z-[10100] pointer-events-auto select-none flex flex-col items-center justify-center gap-3.5 bg-background overflow-hidden"
                >
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: [0.8, 1.04, 1], opacity: 1 }}
                        exit={{ scale: 1.12, opacity: 0 }}
                        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                        className="drop-shadow-[0_18px_32px_rgba(79,70,229,0.48)]"
                    >
                        <BrandLogo size={68} />
                    </motion.div>
                    <motion.span
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.32, delay: 0.1 }}
                        className="font-display text-lg font-extrabold tracking-tight gradient-text"
                    >
                        Semester
                    </motion.span>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default OpeningReveal;
