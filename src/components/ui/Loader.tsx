import { motion } from "motion/react";

export default function Loader() {
  return (
    <div className="fixed inset-0 bg-white z-[100] flex items-center justify-center overflow-hidden">
      {/* Purple/Blue blur gradient mesh patches */}
      <motion.div 
        animate={{ 
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.6, 0.3],
          rotate: [0, 90, 0]
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -top-20 -left-20 w-96 h-96 bg-purple-300 rounded-full mix-blend-multiply filter blur-[100px] opacity-50"
      />
      <motion.div 
        animate={{ 
          scale: [1, 1.5, 1],
          opacity: [0.3, 0.5, 0.3],
          rotate: [0, -90, 0]
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-40 -right-20 w-96 h-96 bg-blue-300 rounded-full mix-blend-multiply filter blur-[100px] opacity-50"
      />
      
      <div className="relative flex items-center text-4xl font-bold tracking-tighter text-black">
        <motion.span
          initial={{ x: -40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 1.5, ease: "circOut" }}
        >
          brand
        </motion.span>
        <motion.span
          initial={{ x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 1.5, ease: "circOut" }}
          className="text-blue-600"
        >
          able
        </motion.span>
      </div>
    </div>
  );
}
