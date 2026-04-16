import React, { useEffect, useState, useRef } from "react";
import ReactDOM from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/src/lib/utils";

interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "danger";
}

interface ContextMenuProps {
  items: MenuItem[];
  children: React.ReactNode;
  className?: string;
  showDotsOnMobile?: boolean;
  as?: React.ElementType;
}

export default function ContextMenu({ items, children, className, showDotsOnMobile, as: Component = "div" }: ContextMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [flip, setFlip] = useState({ x: false, y: false });
  const [isMobile, setIsMobile] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isMobile) return; // Use long press on mobile
    
    const x = e.clientX;
    const y = e.clientY;
    
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    const menuWidth = 200;
    const menuHeight = items.length * 40 + 16;

    setFlip({
      x: x + menuWidth > screenWidth,
      y: y + menuHeight > screenHeight
    });
    
    setPosition({ x, y });
    setIsOpen(true);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isMobile) return;
    longPressTimer.current = setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(50);
      setIsOpen(true);
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  useEffect(() => {
    const handleClick = () => setIsOpen(false);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  const menuContent = (
      <AnimatePresence>
        {isOpen && (
          <>
            {isMobile ? (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[100]"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(false);
                  }}
                />
                <motion.div
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl z-[101] p-6 pb-10"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="w-12 h-1.5 bg-neutral-200 rounded-full mx-auto mb-6" />
                  <div className="flex flex-col gap-2">
                    {items.map((item, index) => (
                      <button
                        key={item.label}
                        onClick={(e) => {
                          e.stopPropagation();
                          item.onClick();
                          setIsOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-center gap-4 px-4 py-4 rounded-2xl text-base font-medium transition-colors text-left",
                          item.variant === "danger" ? "text-red-500 bg-red-50" : "text-black bg-neutral-50"
                        )}
                      >
                        {item.icon && <span className="w-5 h-5">{item.icon}</span>}
                        {item.label}
                      </button>
                    ))}
                  </div>
                </motion.div>
              </>
            ) : (
              <motion.div
                ref={menuRef}
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                style={{ 
                  top: position.y, 
                  left: position.x,
                  transform: `translate(${flip.x ? '-100%' : '0'}, ${flip.y ? '-100%' : '0'})`
                }}
                className="fixed z-[100] min-w-[200px] bg-white border border-neutral-200 rounded-xl shadow-xl py-2 overflow-hidden"
              >
                {items.map((item, index) => (
                  <motion.button
                    key={item.label}
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.03 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      item.onClick();
                      setIsOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors text-left",
                      item.variant === "danger" ? "text-red-500 hover:bg-red-50" : "text-black hover:bg-neutral-100"
                    )}
                  >
                    {item.icon && <span className="w-4 h-4">{item.icon}</span>}
                    {item.label}
                  </motion.button>
                ))}
              </motion.div>
            )}
          </>
        )}
      </AnimatePresence>
  );

  return (
    <Component 
      onContextMenu={handleContextMenu} 
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchEnd}
      className={cn("", className)}
    >
      {children}
      
      {showDotsOnMobile && isMobile && (
        <button 
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(true);
          }}
          className="absolute top-4 right-4 p-2 bg-white/80 backdrop-blur-sm rounded-full shadow-sm md:hidden"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
        </button>
      )}
      
      {ReactDOM.createPortal(menuContent, document.body)}
    </Component>
  );
}
