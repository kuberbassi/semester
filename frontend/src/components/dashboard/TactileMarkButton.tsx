import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface TactileMarkButtonProps {
    status: 'present' | 'absent';
    onMark: () => void;
    label?: string;
    disabled?: boolean;
}

export const TactileMarkButton: React.FC<TactileMarkButtonProps> = ({
    status,
    onMark,
    label,
    disabled = false,
}) => {
    const [isPopping, setIsPopping] = useState(false);
    const isPresent = status === 'present';

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (disabled) return;

        setIsPopping(true);
        if (isPresent) {
            haptics.tick();
        } else {
            haptics.selection();
        }

        onMark();
        setTimeout(() => setIsPopping(false), 500);
    };

    return (
        <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.88 }}
            onClick={handleClick}
            disabled={disabled}
            className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer select-none ${
                isPresent
                    ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/25 active:bg-emerald-500/30'
                    : 'bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/25 active:bg-red-500/30'
            }`}
        >
            {/* Ripple Pulse Halo */}
            <AnimatePresence>
                {isPopping && (
                    <motion.span
                        initial={{ scale: 0.8, opacity: 0.8 }}
                        animate={{ scale: 2.2, opacity: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.45, ease: 'easeOut' }}
                        className={`absolute inset-0 rounded-lg pointer-events-none ${
                            isPresent ? 'bg-emerald-400' : 'bg-red-400'
                        }`}
                    />
                )}
            </AnimatePresence>

            {isPresent ? <Check size={14} /> : <X size={14} />}
            {label && <span>{label}</span>}
        </motion.button>
    );
};
