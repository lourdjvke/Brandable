import { motion } from "motion/react";

export default function Loader() {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-[#FF6719] z-[9999] flex flex-col items-center justify-center gap-6 overflow-hidden"
    >
      <div className="relative">
        <motion.div 
          animate={{ 
            scale: [1, 1.2, 1],
            opacity: [0.2, 0.4, 0.2] 
          }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-0 bg-white blur-3xl rounded-full"
        />
        <motion.img 
          src="https://cdn-icons-png.magnific.com/512/42/42734.png"
          className="w-24 h-24 brightness-0 invert relative z-10"
          animate={{ 
            y: [0, -15, 0],
            rotate: [0, 5, -5, 0]
          }}
          transition={{ 
            y: { duration: 1.5, repeat: Infinity, ease: "easeInOut" },
            rotate: { duration: 3, repeat: Infinity, ease: "easeInOut" }
          }}
          alt="Logo"
        />
      </div>

      <div className="flex flex-col items-center gap-4">
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 bg-white rounded-full"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ 
                duration: 1, 
                repeat: Infinity, 
                delay: i * 0.2,
                ease: "easeInOut" 
              }}
            />
          ))}
        </div>
        <motion.p 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="text-white/80 text-[10px] font-bold uppercase tracking-[0.3em]"
        >
          Initializing Brandable
        </motion.p>
      </div>
    </motion.div>
  );
}
