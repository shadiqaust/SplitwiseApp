import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2500),
      setTimeout(() => setPhase(4), 4000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center bg-bg-muted"
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 0.4 }}
    >
      <div className="text-center absolute top-24 w-full">
        <motion.h2 
          className="text-6xl font-display font-bold text-text-primary"
          initial={{ opacity: 0, y: -20 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -20 }}
        >
          Add any expense.
        </motion.h2>
      </div>

      <motion.div 
        className="bg-white rounded-3xl shadow-xl w-[500px] mt-20 border border-gray-100 overflow-hidden"
        initial={{ y: 100, opacity: 0 }}
        animate={phase >= 2 ? { y: 0, opacity: 1 } : { y: 100, opacity: 0 }}
        transition={{ type: "spring", damping: 20 }}
      >
        <div className="p-8 pb-4">
          <div className="flex justify-between items-center mb-6">
            <div className="text-xl font-bold">Add Expense</div>
            <div className="bg-bg-light text-primary px-4 py-1 rounded-full font-bold">₹ INR</div>
          </div>
          
          <div className="text-5xl font-black text-center mb-8 text-text-primary">
            ₹ 4,500
          </div>
          <div className="text-center text-text-secondary font-medium mb-8">
            Dinner at Thalassa
          </div>

          <div className="bg-bg-light rounded-2xl p-2 flex mb-6">
            {['Equally', 'Exact', 'Shares'].map((mode, i) => (
              <motion.div 
                key={mode}
                className={`flex-1 text-center py-2 rounded-xl font-bold ${i === 0 ? 'bg-white shadow text-primary' : 'text-text-secondary'}`}
                initial={{ opacity: 0, y: 10 }}
                animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
                transition={{ delay: i * 0.1 }}
              >
                {mode}
              </motion.div>
            ))}
          </div>

          <div className="space-y-4">
            <motion.div 
              className="flex justify-between items-center"
              initial={{ opacity: 0 }} animate={phase >= 4 ? { opacity: 1 } : { opacity: 0 }}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary">A</div>
                <div className="font-medium">Alex paid</div>
              </div>
              <div className="font-bold">₹4,500</div>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
