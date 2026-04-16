import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2, AlertCircle, Info, Bell, X } from "lucide-react";
import { cn } from "@/src/lib/utils";

export type NotificationType = "success" | "error" | "info" | "task";

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  duration?: number;
}

interface NotificationContextType {
  addNotification: (notification: Omit<Notification, "id">) => void;
  removeNotification: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback((notification: Omit<Notification, "id">) => {
    const id = Math.random().toString(36).substring(2, 9);
    setNotifications((prev) => [...prev, { ...notification, id }]);
    
    // Auto-remove
    const duration = notification.duration || 5000;
    setTimeout(() => {
      removeNotification(id);
    }, duration);

    // Try browser notification if permission granted
    if ("Notification" in window && Notification.permission === "granted") {
      new window.Notification(notification.title, {
        body: notification.message,
        icon: "https://cdn.dribbble.com/userupload/46470256/file/af6fd035c99fbb7985614c15d3a47d96.jpg?format=webp&resize=640x480&vertical=center"
      });
    }
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      window.Notification.requestPermission();
    }
  }, []);

  return (
    <NotificationContext.Provider value={{ addNotification, removeNotification }}>
      {children}
      <div className="fixed top-6 right-6 z-[9999] flex flex-col gap-3 w-full max-w-sm pointer-events-none">
        <AnimatePresence mode="popLayout">
          {notifications.map((n) => (
            <motion.div
              key={n.id}
              layout
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.95 }}
              className="pointer-events-auto"
            >
              <NotificationCard notification={n} onClose={() => removeNotification(n.id)} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </NotificationContext.Provider>
  );
}

function NotificationCard({ notification: n, onClose }: { notification: Notification; onClose: () => void }) {
  const iconMap = {
    success: <CheckCircle2 className="w-5 h-5 text-green-500" />,
    error: <AlertCircle className="w-5 h-5 text-red-500" />,
    info: <Info className="w-5 h-5 text-blue-500" />,
    task: <Bell className="w-5 h-5 text-indigo-500" />,
  };

  const gradientMap = {
    success: "from-green-50/50 to-transparent",
    error: "from-red-50/50 to-transparent",
    info: "from-blue-50/50 to-transparent",
    task: "from-indigo-50/50 to-transparent",
  };

  return (
    <div className={cn(
      "bg-white/80 backdrop-blur-xl border border-neutral-200/50 rounded-2xl shadow-xl overflow-hidden relative group",
      "p-4 flex gap-4 items-start"
    )}>
      {/* Stylized background glow */}
      <div className={cn(
        "absolute inset-0 bg-gradient-to-br opacity-50 z-0",
        gradientMap[n.type]
      )} />
      
      <div className="relative z-10 shrink-0 mt-0.5">
        <div className="w-10 h-10 rounded-xl bg-white shadow-sm border border-neutral-100 flex items-center justify-center">
          {iconMap[n.type]}
        </div>
      </div>

      <div className="relative z-10 flex-1 min-w-0">
        <h4 className="font-bold text-sm text-neutral-900 truncate">{n.title}</h4>
        <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed">{n.message}</p>
      </div>

      <button
        onClick={onClose}
        className="relative z-10 p-1 text-neutral-400 hover:text-neutral-900 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Animated progress bar */}
      <motion.div
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0 }}
        transition={{ duration: n.duration ? n.duration / 1000 : 5, ease: "linear" }}
        className={cn(
          "absolute bottom-0 left-0 right-0 h-0.5 origin-left",
          n.type === 'success' ? 'bg-green-500' : 
          n.type === 'error' ? 'bg-red-500' : 
          n.type === 'info' ? 'bg-blue-500' : 'bg-indigo-500'
        )}
      />
    </div>
  );
}
