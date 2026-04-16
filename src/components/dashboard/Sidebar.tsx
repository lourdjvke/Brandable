import { LayoutGrid, FolderKanban, Settings, LogOut, MessageSquare } from "lucide-react";
import { motion } from "motion/react";
import { auth } from "@/src/lib/firebase";
import { cn } from "@/src/lib/utils";
import { ILLUSTRATIONS } from "@/src/lib/illustrations";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: any) => void;
  onClose?: () => void;
  isCopilotOpen?: boolean;
  onToggleCopilot?: () => void;
}

export default function Sidebar({ activeTab, setActiveTab, onClose, isCopilotOpen, onToggleCopilot }: SidebarProps) {
  const navItems = [
    { id: "workspace", label: "Workspace", icon: FolderKanban },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  const handleTabClick = (id: string) => {
    setActiveTab(id);
    if (onClose) onClose();
  };

  return (
    <aside className="w-full md:w-64 border-r border-neutral-100 flex flex-col h-full bg-white/80 backdrop-blur-md">
      <div className="p-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={ILLUSTRATIONS.appLogo} alt="Logo" className="w-8 h-8 object-contain" referrerPolicy="no-referrer" />
          <div className="flex flex-col overflow-hidden">
            <h1 className="font-bold truncate text-sm">Brandable</h1>
            <p className="text-[10px] text-neutral-400 uppercase tracking-wider font-semibold">
              Content OS
            </p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="md:hidden p-2 text-neutral-400 hover:text-black">
            <LogOut className="w-5 h-5 rotate-180" />
          </button>
        )}
      </div>

      <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => handleTabClick(item.id)}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group relative",
              activeTab === item.id ? "text-black bg-neutral-50" : "text-neutral-500 hover:text-black hover:bg-neutral-50"
            )}
          >
            <item.icon className={cn("w-4 h-4 transition-transform group-hover:scale-110", activeTab === item.id ? "text-black" : "text-neutral-400 group-hover:text-black")} />
            {item.label}
            {activeTab === item.id && (
              <motion.div
                layoutId="active-pill"
                className="absolute left-0 w-1 h-4 bg-black rounded-full"
              />
            )}
          </button>
        ))}

        <div className="mt-4 pt-4 border-t border-neutral-50">
          <button
            onClick={onToggleCopilot}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group",
              isCopilotOpen ? "text-black bg-neutral-50" : "text-neutral-500 hover:text-black hover:bg-neutral-50"
            )}
          >
            <MessageSquare className={cn("w-4 h-4 transition-transform group-hover:scale-110", isCopilotOpen ? "text-black" : "text-neutral-400 group-hover:text-black")} />
            AI Copilot
            <div className={cn(
              "ml-auto w-2 h-2 rounded-full",
              isCopilotOpen ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" : "bg-neutral-200"
            )} />
          </button>
        </div>
      </nav>

      <div className="p-4 border-t border-neutral-50">
        <button
          onClick={() => auth.signOut()}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-neutral-500 hover:text-red-500 hover:bg-red-50 transition-all group"
        >
          <LogOut className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
