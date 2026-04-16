import { motion, AnimatePresence } from "motion/react";
import Button from "./Button";

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmationModal({ isOpen, title, message, onConfirm, onCancel }: ConfirmationModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="absolute inset-0 bg-black/20 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl relative z-10"
          >
            <h3 className="text-lg font-bold mb-2">{title}</h3>
            <p className="text-sm text-neutral-500 mb-6">{message}</p>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={onCancel} className="flex-1">Cancel</Button>
              <Button variant="primary" onClick={onConfirm} className="flex-1 bg-red-600 hover:bg-red-700">Delete</Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
