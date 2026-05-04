import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, Routes, Route } from "react-router-dom";
import { UserProfile, FileItem, FileType } from "@/src/types";
import Sidebar from "./Sidebar";
import Workspace from "./Workspace";
import AICopilot from "./AICopilot";
import SettingsView from "./SettingsView";
import VoiceAssistant from "./VoiceAssistant";
import LinkYouTube from "./LinkYouTube";
import { NotificationProvider } from "./NotificationSystem";
import { motion, AnimatePresence } from "motion/react";
import { MessageSquare, Menu, X, Mic, ChevronUp, Wifi, WifiOff, RefreshCw } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { rtdb } from "@/src/lib/firebase";
import { ref as dbRef, onValue, set, push, update, remove, get as dbGet, child } from "firebase/database";
import { syncQueue } from "@/src/lib/sync";
import { enqueueMutation, saveFiles } from "@/src/lib/db";

export default function Dashboard({ profile }: { profile: UserProfile }) {
  return (
    <NotificationProvider>
      <DashboardContent profile={profile} />
    </NotificationProvider>
  );
}

function DashboardContent({ profile }: { profile: UserProfile }) {
  const navigate = useNavigate();
  const location = useLocation();
  
  const [activeTab, setActiveTab] = useState<"workspace" | "settings" | "youtube">("workspace");
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);

  // Sync tab with URL
  useEffect(() => {
    if (location.pathname === "/settings") setActiveTab("settings");
    else if (location.pathname === "/youtube") setActiveTab("youtube");
    else if (location.pathname === "/copilot") {
      setActiveTab("workspace");
      setIsCopilotOpen(true);
    } else {
      setActiveTab("workspace");
    }
  }, [location.pathname]);

  // Online/Offline Listeners
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      setIsSyncing(true);
      await syncQueue();
      setIsSyncing(false);
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab as any);
    if (tab === "workspace") navigate("/");
    else navigate(`/${tab}`);
  };

  // Device back button logic to close items
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (selectedFile) {
        setSelectedFile(null);
        e.preventDefault();
        window.history.pushState(null, "", window.location.pathname);
      } else if (isCopilotOpen) {
        setIsCopilotOpen(false);
        e.preventDefault();
        window.history.pushState(null, "", window.location.pathname);
      } else if (isSidebarOpen) {
        setIsSidebarOpen(false);
        e.preventDefault();
        window.history.pushState(null, "", window.location.pathname);
      }
    };

    window.history.pushState(null, "", window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [selectedFile, isCopilotOpen, isSidebarOpen]);

  useEffect(() => {
    setIsEditing(!!selectedFile);
  }, [selectedFile]);

  const [isDesktop, setIsDesktop] = useState(typeof window !== "undefined" ? window.innerWidth >= 1280 : true);
  const [isTablet, setIsTablet] = useState(typeof window !== "undefined" ? window.innerWidth >= 768 && window.innerWidth < 1280 : false);
  
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);
  const [geminiKey, setGeminiKey] = useState<string>(() => localStorage.getItem("gemini_api_key") || "");

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);
  
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const aiCopilotRef = useRef<any>(null);
  const voiceAssistantRef = useRef<any>(null);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [showBottomBar, setShowBottomBar] = useState(true);
  const lastScrollY = useRef(0);

  const cleanObject = (obj: any): any => {
    if (Array.isArray(obj)) {
      return obj.map(cleanObject);
    } else if (obj !== null && typeof obj === "object") {
      return Object.entries(obj).reduce((acc: any, [key, value]) => {
        if (value !== undefined) {
          acc[key] = cleanObject(value);
        }
        return acc;
      }, {});
    }
    return obj;
  };

  // Load from IndexedDB on mount
  useEffect(() => {
    const loadLocal = async () => {
      const { getFiles } = await import("@/src/lib/db");
      const localFiles = await getFiles();
      if (localFiles.length > 0) {
        setFiles(localFiles);
      }
      setLoading(false);
    };
    loadLocal();
  }, []);

  useEffect(() => {
    if (!profile.uid) return;
    const filesRef = dbRef(rtdb, "files");
    const unsub = onValue(filesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const fileList = Object.entries(data)
          .map(([id, f]: [string, any]) => ({ id, ...f } as FileItem))
          .filter(f => f.ownerId === profile.uid);
        setFiles(fileList);
        // Persist to IndexedDB
        saveFiles(fileList);
      } else {
        setFiles([]);
        saveFiles([]);
      }
    });
    return () => unsub();
  }, [profile.uid]);

  const handleMainScroll = (e: React.UIEvent<HTMLElement>) => {
    const currentScrollY = e.currentTarget.scrollTop;
    const threshold = window.innerHeight * 0.05;
    
    if (currentScrollY > lastScrollY.current && currentScrollY > threshold) {
      setShowBottomBar(false);
    } else {
      setShowBottomBar(true);
    }
    lastScrollY.current = currentScrollY;
  };

  const toggleVoice = () => {
    if (voiceAssistantRef.current) {
      voiceAssistantRef.current.toggle();
    }
  };

  const handleCreateFolder = async (name: string) => {
    const id = push(dbRef(rtdb, "files")).key!;
    const newFolder = {
      id,
      name,
      type: "folder" as const,
      parentId: currentFolderId,
      ownerId: profile.uid,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tags: [],
      color: "#FF6719"
    };

    // Optimistic Update
    const updatedFiles = [...files, newFolder];
    setFiles(updatedFiles);
    await saveFiles(updatedFiles);

    if (isOnline) {
      try {
        await set(dbRef(rtdb, `files/${id}`), newFolder);
      } catch (err) {
        console.error("Online creation failed, queuing...", err);
        await enqueueMutation('createFile', { id, item: newFolder });
      }
    } else {
      await enqueueMutation('createFile', { id, item: newFolder });
    }
    return id;
  };

  const logActionToChat = async (messageContent: string, isSilent: boolean = false, role: 'user' | 'assistant' | 'system' = 'assistant') => {
    let sessionId = currentSessionIdRef.current;
    
    if (!sessionId) {
      // Create a default session if none exists
      const newSession = {
        ownerId: profile.uid,
        title: "Assistant Logs",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: []
      };
      const newRef = push(dbRef(rtdb, "chatSessions"));
      await set(newRef, newSession);
      sessionId = newRef.key!;
      currentSessionIdRef.current = sessionId;
      setCurrentSessionId(sessionId);
    }

    const newMessage = {
      role,
      content: messageContent,
      createdAt: Date.now(),
      id: Date.now().toString(),
      isSilent
    };

    try {
      const sessionSnap = await dbGet(child(dbRef(rtdb), `chatSessions/${sessionId}`));
      const sessionData = sessionSnap.val();
      const existingMessages = sessionData?.messages 
        ? (Array.isArray(sessionData.messages) ? sessionData.messages : Object.values(sessionData.messages)) 
        : [];
      const updatedMessages = cleanObject([...existingMessages, newMessage]);

      await update(dbRef(rtdb, `chatSessions/${sessionId}`), {
        messages: updatedMessages,
        updatedAt: Date.now()
      });
    } catch (err) {
      console.error("Error logging action to chat sessions:", err);
    }
  };

  const handleCreateFile = async (name: string, folderId: string | null, content: string = "", type: FileType = "script") => {
    const id = push(dbRef(rtdb, "files")).key!;
    const newFile = {
      id,
      name,
      type,
      parentId: folderId,
      ownerId: profile.uid,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tags: [],
      content
    };

    // Optimistic Update
    const updatedFiles = [...files, newFile];
    setFiles(updatedFiles);
    await saveFiles(updatedFiles);

    if (isOnline) {
      try {
        await set(dbRef(rtdb, `files/${id}`), newFile);
      } catch (err) {
        console.error("Online creation failed, queuing...", err);
        await enqueueMutation('createFile', { id, item: newFile });
      }
    } else {
      await enqueueMutation('createFile', { id, item: newFile });
    }
    return id;
  };

  const handleUpdateFile = async (id: string, updates: Partial<FileItem>) => {
    // Optimistic UI update
    setFiles(files.map(f => f.id === id ? { ...f, ...updates } : f));
    
    if (isOnline) {
      await update(dbRef(rtdb, `files/${id}`), { ...cleanObject(updates), updatedAt: Date.now() });
    } else {
      await enqueueMutation('updateFile', { id, updates });
      // Also update IndexedDB
      await saveFiles(files.map(f => f.id === id ? { ...f, ...updates } : f));
    }
  };

  const handleDeleteFile = async (id: string) => {
    // Optimistic
    const updatedFiles = files.filter(f => f.id !== id);
    setFiles(updatedFiles);
    await saveFiles(updatedFiles);

    if (isOnline) {
      try {
        await remove(dbRef(rtdb, `files/${id}`));
      } catch (err) {
        await enqueueMutation('deleteFile', { id });
      }
    } else {
      await enqueueMutation('deleteFile', { id });
    }
  };

  const currentPath: string[] = [];
  let currId = currentFolderId;
  while (currId) {
    const folder = files.find(f => f.id === currId);
    if (folder) {
      currentPath.unshift(folder.name);
      currId = folder.parentId;
    } else break;
  }

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1280);
      setIsTablet(window.innerWidth >= 768 && window.innerWidth < 1280);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const showCopilotSidebar = isCopilotOpen || (activeTab === "workspace" && isDesktop && !selectedFile);

  return (
    <div className="h-full flex bg-[#f8f9fa] dark:bg-black relative overflow-y-auto">
      {/* Status Indicators */}
      <div className="fixed top-4 right-4 z-[60] flex items-center gap-3">
        <AnimatePresence>
          {!isOnline && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, x: 20 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.9, x: 20 }}
              className="px-3 py-1.5 bg-black dark:bg-red-600 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-full shadow-lg flex items-center gap-2 border border-neutral-800 dark:border-red-500"
            >
              <WifiOff className="w-3 h-3" />
              Offline
            </motion.div>
          )}
          {isSyncing && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -20 }}
              className="px-3 py-1.5 bg-black dark:bg-primary text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-full shadow-lg flex items-center gap-2 border border-neutral-800 dark:border-primary/20"
            >
              <RefreshCw className="w-3 h-3 animate-spin text-primary" />
              Syncing...
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Sidebar - Hidden on mobile/tablet during editing or when overridden */}
      {!isEditing && (
        <div className={cn("hidden lg:block", isTablet && "hidden")}>
          <Sidebar 
            activeTab={activeTab} 
            setActiveTab={handleTabChange} 
            isCopilotOpen={showCopilotSidebar}
            onToggleCopilot={() => setIsCopilotOpen(!isCopilotOpen)}
          />
        </div>
      )}

      {/* Mobile/Tablet Sidebar Overlay (Drawer) */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[60] lg:hidden"
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed inset-y-0 left-0 w-[280px] bg-white dark:bg-black z-[70] lg:hidden"
            >
              <Sidebar 
                activeTab={activeTab} 
                setActiveTab={handleTabChange} 
                onClose={() => setIsSidebarOpen(false)}
                isCopilotOpen={isCopilotOpen}
                onToggleCopilot={() => { setIsCopilotOpen(!isCopilotOpen); setIsSidebarOpen(false); }}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <main onScroll={handleMainScroll} className="flex-1 flex flex-col relative overflow-y-auto">
        {/* Mobile/Tablet Header */}
        {!isEditing && (
          <header className="lg:hidden sticky top-0 flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-black/80 backdrop-blur-md z-40">
            <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 text-neutral-500 hover:text-primary dark:text-neutral-400">
              <Menu className="w-6 h-6" />
            </button>
            <div className="font-bold text-sm truncate max-w-[200px] flex items-center gap-1 dark:text-white">
              Brandable
              {isSyncing ? <RefreshCw className="w-3 h-3 animate-spin text-primary" /> : !isOnline ? <WifiOff className="w-3 h-3 text-red-500" /> : <Wifi className="w-3 h-3 text-green-500" />}
            </div>
            <button 
              onClick={() => setIsCopilotOpen(!isCopilotOpen)}
              className="p-2 -mr-2 text-neutral-500 hover:text-primary dark:text-neutral-400"
            >
              <MessageSquare className="w-5 h-5" />
            </button>
          </header>
        )}

        <AnimatePresence mode="wait">
          {activeTab === "workspace" ? (
            <motion.div
              key="workspace"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="h-full"
            >
              <Workspace 
                profile={profile} 
                currentFolderId={currentFolderId}
                setCurrentFolderId={setCurrentFolderId}
                currentPath={currentPath}
                selectedFile={selectedFile}
                setSelectedFile={setSelectedFile}
                searchQuery={searchQuery}
              />
            </motion.div>
          ) : activeTab === "settings" ? (
            <motion.div
              key="settings"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="h-full"
            >
              <SettingsView 
                profile={profile} 
                onKeyChange={setGeminiKey}
              />
            </motion.div>
          ) : activeTab === "youtube" ? (
            <motion.div
              key="youtube"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="h-full"
            >
              <LinkYouTube profile={profile} onBack={() => handleTabChange("workspace")} />
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Mobile Bottom Bar */}
        {!isDesktop && !isCopilotOpen && activeTab === "workspace" && !selectedFile && (
          <motion.div 
            initial={{ y: 100, opacity: 0, filter: "blur(10px)" }}
            animate={{ 
              y: showBottomBar ? 0 : 100,
              opacity: showBottomBar ? 1 : 0,
              filter: `blur(${showBottomBar ? 0 : 10}px)`
            }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className={cn(
              "fixed bottom-4 left-4 right-4 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-md shadow-xl rounded-2xl border border-neutral-200 dark:border-neutral-800 p-2 flex items-center gap-2 z-50",
              showBottomBar ? "pointer-events-auto" : "pointer-events-none"
            )}
          >
            <button 
              onClick={toggleVoice}
              className={cn(
                "w-12 h-12 rounded-full flex items-center justify-center transition-all shrink-0 relative overflow-hidden",
                isVoiceActive 
                  ? "bg-red-500 text-white" 
                  : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
              )}
            >
              {isVoiceActive && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute inset-0 z-0"
                >
                  <motion.div 
                    animate={{ rotate: [0, 360], scale: [1, 1.2, 1] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-[-100%] bg-[conic-gradient(from_0deg,#FF6719,#FF8C50,#FFB38A,#FF6719)] blur-md opacity-60"
                  />
                </motion.div>
              )}
              <Mic className={cn("w-5 h-5 relative z-10")} />
            </button>
            <div 
              className="flex-1 px-2 text-sm font-medium text-neutral-400 dark:text-neutral-500 cursor-text"
              onClick={() => setIsCopilotOpen(true)}
            >
              What do you want?
            </div>
            <button 
              onClick={() => setIsCopilotOpen(true)} 
              className="w-10 h-10 flex items-center justify-center text-neutral-400 dark:text-neutral-500 hover:text-black dark:hover:text-white transition-colors shrink-0"
            >
              <ChevronUp className="w-5 h-5" />
            </button>
          </motion.div>
        )}
      </main>

      {/* Copilot Sidebar (Desktop) & Bottom Sheet (Mobile/Tablet) */}
      <AnimatePresence>
        {isCopilotOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsCopilotOpen(false)}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[80] lg:hidden"
          />
        )}
      </AnimatePresence>

      <motion.div 
        initial={isDesktop ? { x: "100%" } : { y: "100%" }}
        animate={isCopilotOpen ? { x: 0, y: 0 } : (isDesktop ? { x: "100%" } : { y: "100%" })}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className={cn(
          "fixed bottom-0 left-0 right-0 h-[92vh] rounded-t-[32px] md:rounded-t-[40px] z-[90] lg:relative lg:h-full lg:w-[400px] lg:rounded-none lg:z-auto bg-white dark:bg-black border-t lg:border-t-0 lg:border-l border-neutral-100 dark:border-neutral-900 flex flex-col overflow-hidden",
          !isCopilotOpen && !isDesktop && "pointer-events-none"
        )}
        style={{
          display: !isCopilotOpen && isDesktop ? "none" : "flex"
        }}
      >
        {/* Drag Handle for Sheet */}
        <div className="lg:hidden flex justify-center py-4 shrink-0 bg-white dark:bg-black">
          <div className="w-12 h-1.5 bg-neutral-200 dark:bg-neutral-800 rounded-full" />
        </div>
        
        <div className="lg:hidden absolute top-4 right-4 z-[100]">
          <button onClick={() => setIsCopilotOpen(false)} className="p-2 bg-neutral-100 dark:bg-neutral-800 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors">
            <X className="w-4 h-4 dark:text-white" />
          </button>
        </div>

        <AICopilot 
          ref={aiCopilotRef}
          profile={profile} 
          currentPath={currentPath}
          currentFolderId={currentFolderId}
          files={files}
          sessionId={currentSessionId}
          apiKey={geminiKey}
          onNavigate={(id) => {
            handleTabChange("workspace");
            setCurrentFolderId(id);
            if (window.innerWidth < 1280) setIsCopilotOpen(false);
          }}
          onOpenFile={(file) => {
             setSelectedFile(file);
             if (window.innerWidth < 1280) setIsCopilotOpen(false);
          }}
          onOpenSettings={() => handleTabChange("settings")}
          onCreateFile={handleCreateFile}
          onUpdateFile={handleUpdateFile}
          onDeleteFile={handleDeleteFile}
          onCreateFolder={handleCreateFolder}
          onSessionChange={setCurrentSessionId}
        />
      </motion.div>

      <VoiceAssistant 
        ref={voiceAssistantRef}
        files={files}
        currentPath={currentPath}
        currentFolderId={currentFolderId}
        currentSessionId={currentSessionId}
        apiKey={geminiKey}
        onLogAction={logActionToChat}
        onNavigate={setCurrentFolderId}
        onFilter={setSearchQuery}
        onOpenFile={setSelectedFile}
        onUpdateFile={handleUpdateFile}
        onDeleteFile={handleDeleteFile}
        onCreateFolder={handleCreateFolder}
        onCreateFile={handleCreateFile}
        onStateChange={setIsVoiceActive}
      />
    </div>
  );
}
