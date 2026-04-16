import { motion } from "motion/react";
import React, { InputHTMLAttributes } from "react";
import { cn } from "@/src/lib/utils";

export default function Input({ label, error, className, ...props }: any) {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && <label className="text-xs font-medium text-neutral-500 ml-1">{label}</label>}
      <motion.input
        whileFocus={{ scale: 1.01 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className={cn(
          "px-4 py-2.5 bg-white border border-neutral-200 rounded-xl outline-none transition-all duration-200",
          "focus:border-black focus:ring-0",
          error && "border-red-500 focus:border-red-500",
          className
        )}
        {...props}
      />
      {error && (
        <motion.p
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-xs text-red-500 ml-1 mt-0.5"
        >
          {error}
        </motion.p>
      )}
    </div>
  );
}
