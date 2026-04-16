import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";

interface ColorPickerModalProps {
  isOpen: boolean;
  onConfirm: (color: string) => void;
  onCancel: () => void;
  colors: string[];
}

export default function ColorPickerModal({ isOpen, onConfirm, onCancel, colors }: ColorPickerModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="fixed inset-0 bg-black/50 z-[100]"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl p-6 z-[101]"
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Choose Folder Color</h2>
              <button onClick={onCancel}><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-5 gap-4">
              {colors.map((color) => (
                <button
                  key={color}
                  onClick={() => onConfirm(color)}
                  className="w-12 h-12 rounded-full border-2 border-transparent hover:border-black transition-all"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
