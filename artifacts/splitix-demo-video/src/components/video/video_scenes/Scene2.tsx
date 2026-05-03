import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1000),
      setTimeout(() => setPhase(3), 1500),
      setTimeout(() => setPhase(4), 2200),
      setTimeout(() => setPhase(5), 3000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center bg-bg-light"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ duration: 0.4 }}
    >
      <div className="w-1/2 h-full flex flex-col justify-center px-24">
        <motion.h2 
          className="text-6xl font-display font-bold text-text-primary leading-tight"
          initial={{ opacity: 0, x: -30 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
          transition={{ type: "spring", damping: 25 }}
        >
          Just create a group.
        </motion.h2>
        <motion.p
          className="text-3xl text-text-secondary mt-6"
          initial={{ opacity: 0, x: -30 }}
          animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
          transition={{ type: "spring", damping: 25 }}
        >
          Trips, roommates, or dinner.
        </motion.p>
      </div>

      <div className="w-1/2 h-full flex items-center justify-center relative">
        <motion.img 
          src={`${import.meta.env.BASE_URL}images/beach.jpg`}
          className="absolute inset-0 w-full h-full object-cover opacity-20 mask-image:linear-gradient(to_right,transparent,black_20%)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.2 }}
          transition={{ duration: 1 }}
        />
        
        <motion.div 
          className="bg-white rounded-3xl shadow-2xl p-8 w-96 relative z-10 border border-gray-100"
          initial={{ y: 50, opacity: 0, rotateY: 20 }}
          animate={phase >= 3 ? { y: 0, opacity: 1, rotateY: 0 } : { y: 50, opacity: 0, rotateY: 20 }}
          style={{ transformPerspective: 1000 }}
          transition={{ type: "spring", damping: 20 }}
        >
          <div className="text-xl font-bold mb-6 text-center text-text-primary">New Group</div>
          
          <div className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-200 flex items-center gap-4">
            <div className="w-12 h-12 bg-accent rounded-full flex items-center justify-center text-2xl">🌴</div>
            <div className="text-xl font-medium text-text-primary">Goa Trip</div>
          </div>

          <div className="space-y-3">
            {['Alex', 'Sarah', 'Mike'].map((name, i) => (
              <motion.div 
                key={name}
                className="flex items-center gap-3 bg-white p-3 rounded-lg border border-gray-100 shadow-sm"
                initial={{ opacity: 0, x: 20 }}
                animate={phase >= 4 + i ? { opacity: 1, x: 0 } : { opacity: 0, x: 20 }}
                transition={{ type: "spring", delay: i * 0.1 }}
              >
                <div className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold">
                  {name[0]}
                </div>
                <div className="font-medium">{name}</div>
              </motion.div>
            ))}
          </div>

          <motion.div 
            className="w-full bg-primary text-white text-center py-4 rounded-xl mt-6 font-bold text-lg shadow-lg"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={phase >= 5 ? { scale: 1, opacity: 1 } : { scale: 0.9, opacity: 0 }}
            whileHover={{ scale: 1.02 }}
          >
            Create Group
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}
