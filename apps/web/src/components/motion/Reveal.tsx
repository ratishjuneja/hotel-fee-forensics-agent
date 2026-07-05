"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Subtle fade-up entrance, played on mount. Content is guaranteed to end
 * visible — we deliberately do NOT gate on scroll (whileInView), which can
 * leave below-the-fold content stuck at opacity 0 if the observer never fires.
 * Under prefers-reduced-motion it renders statically. Purposeful motion only.
 */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
