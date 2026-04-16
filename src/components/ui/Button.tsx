import { motion } from "motion/react";
import { ReactNode } from "react";
import { cn } from "@/src/lib/utils";

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  variant?: "primary" | "secondary" | "ghost";
  type?: "button" | "submit";
  disabled?: boolean;
}

export default function Button({ 
  children, 
  onClick, 
  className, 
  variant = "primary",
  type = "button",
  disabled = false
}: ButtonProps) {
  const variants = {
    primary: "bg-black text-white hover:bg-neutral-800",
    secondary: "bg-white text-black border border-neutral-200 hover:bg-neutral-50",
    ghost: "bg-transparent text-black hover:bg-neutral-100",
  };

  return (
    <motion.button
      type={type}
      disabled={disabled}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
      onClick={onClick}
      className={cn(
        "px-4 py-2 rounded-lg font-medium transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-xs md:text-sm",
        variants[variant],
        className
      )}
    >
      {children}
    </motion.button>
  );
}
