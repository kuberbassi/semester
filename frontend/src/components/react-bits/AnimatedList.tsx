import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface AnimatedListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  keyExtractor: (item: T) => string | number;
  className?: string;
  staggerDelay?: number;
}

export function AnimatedList<T>({
  items,
  renderItem,
  keyExtractor,
  className = '',
  staggerDelay = 0.04,
}: AnimatedListProps<T>) {
  return (
    <div className={`flex flex-col ${className}`}>
      <AnimatePresence mode="popLayout">
        {items.map((item, index) => (
          <motion.div
            key={keyExtractor(item)}
            layout
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
            transition={{
              type: 'spring',
              stiffness: 400,
              damping: 28,
              delay: Math.min(index * staggerDelay, 0.3),
            }}
          >
            {renderItem(item, index)}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
