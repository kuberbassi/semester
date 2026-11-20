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
  staggerDelay = 0.05,
}: AnimatedListProps<T>) {
  return (
    <div className={`flex flex-col gap-2.5 ${className}`}>
      <AnimatePresence mode="popLayout">
        {items.map((item, index) => (
          <motion.div
            key={keyExtractor(item)}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.2 } }}
            transition={{
              type: 'spring',
              stiffness: 350,
              damping: 25,
              delay: index * staggerDelay,
            }}
          >
            {renderItem(item, index)}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
