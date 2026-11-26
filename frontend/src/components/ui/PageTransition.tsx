import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';

interface PageTransitionProps {
    children: React.ReactNode;
}

/**
 * OpenTune PageMotion spring transition:
 * Crisp depth scale (0.985 -> 1) + subtle glide so route switches feel native and fluid.
 */
const variants = {
    initial: { opacity: 0, y: 10, scale: 0.985 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -6, scale: 0.99 },
};

const transition = {
    type: 'spring' as const,
    stiffness: 420,
    damping: 34,
    mass: 0.8,
};

const PageTransition: React.FC<PageTransitionProps> = ({ children }) => {
    const location = useLocation();

    return (
        <AnimatePresence mode="wait" initial={false}>
            <motion.div
                key={location.pathname}
                variants={variants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={transition}
                style={{ willChange: 'opacity, transform' }}
            >
                {children}
            </motion.div>
        </AnimatePresence>
    );
};

export default PageTransition;
