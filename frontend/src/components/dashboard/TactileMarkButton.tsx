import React from 'react';
import { motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { haptics } from '@/utils/haptics';

interface TactileMarkButtonProps {
    status: 'present' | 'absent';
    onMark: () => void;
    label?: string;
    disabled?: boolean;
}

/**
 * Clean, glitch-free tactile attendance button aligned with the Silver-Iris / Rose palette.
 */
export const TactileMarkButton: React.FC<TactileMarkButtonProps> = ({
    status,
    onMark,
    label,
    disabled = false,
}) => {
    const isPresent = status === 'present';

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (disabled) return;
        if (isPresent) haptics.crownTick();
        else haptics.selection();
        onMark();
    };

    return (
        <motion.button
            type="button"
            whileTap={{ scale: 0.92 }}
            onClick={handleClick}
            disabled={disabled}
            className={`no-fluid relative inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer select-none disabled:opacity-40 ${
                isPresent
                    ? 'bg-indigo-500/14 hover:bg-indigo-500/24 text-indigo-300 border-indigo-400/25'
                    : 'bg-rose-500/12 hover:bg-rose-500/22 text-rose-400 border-rose-500/25'
            }`}
        >
            {isPresent ? <Check size={13} strokeWidth={2.5} /> : <X size={13} strokeWidth={2.5} />}
            {label && <span>{label}</span>}
        </motion.button>
    );
};
