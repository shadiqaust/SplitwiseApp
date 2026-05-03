import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 3000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center bg-primary"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.4 }}
    >
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,white_0%,transparent_70%)]" />

      <div className="relative z-10 text-center flex flex-col items-center">
        <motion.h2 
          className="text-7xl font-display font-black text-white mb-12"
          initial={{ opacity: 0, y: -30 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -30 }}
          transition={{ type: "spring" }}
        >
          Settle up.
        </motion.h2>

        <motion.div 
          className="bg-white text-primary text-3xl font-bold py-6 px-16 rounded-full shadow-2xl flex items-center gap-4 cursor-default"
          initial={{ scale: 0, opacity: 0 }}
          animate={phase >= 2 ? (phase >= 3 ? { scale: 1.1, backgroundColor: '#f0fdf4' } : { scale: 1, opacity: 1 }) : { scale: 0, opacity: 0 }}
          transition={{ type: "spring", damping: 15 }}
        >
          {phase >= 3 ? "All Settled! 🎉" : "Pay ₹1,500"}
        </motion.div>
      </div>
    </motion.div>
  );
}
