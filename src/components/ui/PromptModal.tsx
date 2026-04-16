import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import Button from "./Button";

interface PromptModalProps {
  isOpen: boolean;
  title: string;
  placeholder?: string;
  initialValue?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export default function PromptModal({ isOpen, title, placeholder, initialValue = "", onConfirm, onCancel }: PromptModalProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setValue(initialValue);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, initialValue]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[100]"
            onClick={onCancel}
          />
          <div className="fixed inset-0 flex items-center justify-center z-[101] pointer-events-none p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="bg-white rounded-3xl p-6 shadow-2xl w-full max-w-md pointer-events-auto border border-neutral-100"
            >
              <h3 className="text-lg font-bold mb-4">{title}</h3>
              <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={placeholder}
                className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black transition-all mb-6"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && value.trim()) {
                    onConfirm(value.trim());
                  } else if (e.key === "Escape") {
                    onCancel();
                  }
                }}
              />
              <div className="flex justify-end gap-3">
                <button
                  onClick={onCancel}
                  className="px-4 py-2 text-sm font-bold text-neutral-400 hover:text-black transition-colors"
                >
                  Cancel
                </button>
                <Button onClick={() => value.trim() && onConfirm(value.trim())} disabled={!value.trim()}>
                  Confirm
                </Button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
