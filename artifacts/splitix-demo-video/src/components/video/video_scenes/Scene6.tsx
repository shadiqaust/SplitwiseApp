import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export function Scene6() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1200),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center bg-bg-light"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
    >
      <motion.div 
        className="flex items-center gap-6 mb-8"
        initial={{ y: 20, opacity: 0 }}
        animate={phase >= 1 ? { y: 0, opacity: 1 } : { y: 20, opacity: 0 }}
        transition={{ type: "spring", damping: 20 }}
      >
        <div className="w-20 h-20 bg-primary rounded-2xl flex items-center justify-center text-white shadow-xl shadow-primary/30">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 18 22 12 16 6" />
            <line x1="12" y1="2" x2="12" y2="22" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
        </div>
        <div className="text-8xl font-display font-black text-text-primary tracking-tighter">
          Splitix
        </div>
      </motion.div>

      <motion.div 
        className="text-3xl font-medium text-text-secondary"
        initial={{ opacity: 0 }}
        animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
      >
        Money with friends, finally drama-free.
      </motion.div>
    </motion.div>
  );
}
