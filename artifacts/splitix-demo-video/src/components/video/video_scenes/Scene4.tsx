import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 2500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center bg-bg-dark text-white"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <motion.h2 
        className="text-6xl font-display font-bold mb-16"
        initial={{ opacity: 0, y: 20 }}
        animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      >
        See exactly who owes who.
      </motion.h2>

      <div className="w-[600px] space-y-6">
        <motion.div 
          className="bg-white/10 rounded-2xl p-6 backdrop-blur-md flex items-center justify-between border border-white/10"
          initial={{ opacity: 0, x: -50 }}
          animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: -50 }}
          transition={{ type: "spring" }}
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center font-bold text-red-400">S</div>
            <div>
              <div className="text-xl font-bold">Sarah</div>
              <div className="text-white/60">owes Alex</div>
            </div>
          </div>
          <div className="text-3xl font-black text-red-400">
            ₹1,500
          </div>
        </motion.div>

        <motion.div 
          className="bg-white/10 rounded-2xl p-6 backdrop-blur-md flex items-center justify-between border border-white/10"
          initial={{ opacity: 0, x: -50 }}
          animate={phase >= 3 ? { opacity: 1, x: 0 } : { opacity: 0, x: -50 }}
          transition={{ type: "spring" }}
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center font-bold text-red-400">M</div>
            <div>
              <div className="text-xl font-bold">Mike</div>
              <div className="text-white/60">owes Alex</div>
            </div>
          </div>
          <div className="text-3xl font-black text-red-400">
            ₹1,500
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
