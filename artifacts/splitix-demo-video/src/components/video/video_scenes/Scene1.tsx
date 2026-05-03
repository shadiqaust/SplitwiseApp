import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { sceneTransitions, elementAnimations } from '@/lib/video/animations';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center bg-bg-dark"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.5 }}
    >
      <motion.img 
        src={`${import.meta.env.BASE_URL}images/friends.jpg`}
        className="absolute inset-0 w-full h-full object-cover opacity-30"
        initial={{ scale: 1.1 }}
        animate={{ scale: 1 }}
        transition={{ duration: 5, ease: "linear" }}
      />
      
      <div className="relative z-10 text-center flex flex-col items-center">
        <motion.div
          className="text-6xl font-display font-bold text-text-inverse tracking-tight mb-6"
          initial={{ y: 30, opacity: 0 }}
          animate={phase >= 1 ? { y: 0, opacity: 1 } : { y: 30, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          Great dinner.
        </motion.div>
        
        <motion.div
          className="text-7xl font-display font-black text-primary tracking-tighter"
          initial={{ y: 30, opacity: 0, scale: 0.9 }}
          animate={phase >= 2 ? { y: 0, opacity: 1, scale: 1 } : { y: 30, opacity: 0, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          Awkward math.
        </motion.div>

        <motion.div 
          className="mt-12 flex gap-4"
          initial={{ opacity: 0 }}
          animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
        >
          {['"Wait, I only had a salad..."', '"Who had the extra drink?"'].map((text, i) => (
            <motion.div 
              key={i}
              className="bg-bg-muted/10 backdrop-blur-md px-6 py-3 rounded-full text-text-inverse font-medium border border-white/10"
              initial={{ y: 20, opacity: 0 }}
              animate={phase >= 3 ? { y: 0, opacity: 1 } : { y: 20, opacity: 0 }}
              transition={{ delay: i * 0.4 + 0.2 }}
            >
              {text}
            </motion.div>
          ))}
        </motion.div>
      </div>
    </motion.div>
  );
}
