import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const OPENING_KEY = 'semester_opening_played_v1';

/**
 * OpenTune-inspired OpeningReveal for the Semester Desktop (.exe) & Web app.
 * Plays once per session: a luminous ring breathes with a crisp glint, then
 * expands like a portal diving straight into the live workspace.
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
        const timer = setTimeout(() => {
            try {
                sessionStorage.setItem(OPENING_KEY, '1');
            } catch {
                // ignore storage errors
            }
            setVisible(false);
        }, 1050);
        return () => clearTimeout(timer);
    }, [visible]);

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    className="fixed inset-0 z-[10000] pointer-events-none flex items-center justify-center bg-black overflow-hidden"
                >
                    {/* Expanding luminous portal ring */}
                    <motion.div
                        initial={{ scale: 0.65, opacity: 0.9 }}
                        animate={{
                            scale: [0.65, 1.05, 22],
                            opacity: [0.9, 1, 0],
                        }}
                        transition={{
                            duration: 1.0,
                            times: [0, 0.42, 1],
                            ease: [0.6, 0, 0.85, 0.35],
                        }}
                        className="w-24 h-24 rounded-full border-2 border-emerald-400/90 shadow-[0_0_60px_rgba(16,185,129,0.65)] flex items-center justify-center"
                    >
                        <motion.div
                            initial={{ opacity: 1, scale: 1 }}
                            animate={{ opacity: [1, 1, 0], scale: [1, 1.08, 0.4] }}
                            transition={{ duration: 0.65, times: [0, 0.5, 1] }}
                            className="w-10 h-10 rounded-full bg-gradient-to-br from-white via-emerald-300 to-emerald-500"
                        />
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default OpeningReveal;
