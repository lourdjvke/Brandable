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
import { MessageSquare, Menu, X, Mic, ChevronUp } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { rtdb } from "@/src/lib/firebase";
import { ref as dbRef, onValue, set, push, update, remove, get as dbGet, child } from "firebase/database";

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
      } else {
        setFiles([]);
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
    try {
      const newFolder = {
        name,
        type: "folder" as const,
        parentId: currentFolderId,
        ownerId: profile.uid,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: [],
        color: "#3b82f6"
      };
      const newRef = push(dbRef(rtdb, "files"));
      await set(newRef, newFolder);
      return newRef.key!;
    } catch (err) {
      console.error("Error creating folder:", err);
    }
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
    try {
      const newFile = {
        name,
        type,
        parentId: folderId,
        ownerId: profile.uid,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: [],
        content
      };
      const newRef = push(dbRef(rtdb, "files"));
      await set(newRef, newFile);
      return newRef.key!;
    } catch (err) {
      console.error("Error creating file:", err);
    }
  };

  const handleUpdateFile = async (id: string, updates: Partial<FileItem>) => {
    try {
      await update(dbRef(rtdb, `files/${id}`), { ...cleanObject(updates), updatedAt: Date.now() });
    } catch (err) {
      console.error("Error updating file:", err);
    }
  };

  const handleDeleteFile = async (id: string) => {
    try {
      await remove(dbRef(rtdb, `files/${id}`));
    } catch (err) {
      console.error("Error deleting file:", err);
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
    <div className="h-full flex bg-[#f8f9fa] relative overflow-y-auto">
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
              className="fixed inset-y-0 left-0 w-[280px] bg-white z-[70] lg:hidden"
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
          <header className="lg:hidden sticky top-0 flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-white/80 backdrop-blur-md z-40">
            <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 text-neutral-500">
              <Menu className="w-6 h-6" />
            </button>
            <div className="font-bold text-sm truncate max-w-[200px]">Brandable</div>
            <button 
              onClick={() => setIsCopilotOpen(!isCopilotOpen)}
              className="p-2 -mr-2 text-neutral-500"
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
              "fixed bottom-4 left-4 right-4 bg-white/90 backdrop-blur-md shadow-xl rounded-2xl border border-neutral-200 p-2 flex items-center gap-2 z-50",
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
                    className="absolute inset-[-100%] bg-[conic-gradient(from_0deg,#3b82f6,#8b5cf6,#ec4899,#3b82f6)] blur-md opacity-60"
                  />
                </motion.div>
              )}
              <Mic className={cn("w-5 h-5 relative z-10")} />
            </button>
            <div 
              className="flex-1 px-2 text-sm font-medium text-neutral-400 cursor-text"
              onClick={() => setIsCopilotOpen(true)}
            >
              What do you want?
            </div>
            <button 
              onClick={() => setIsCopilotOpen(true)} 
              className="w-10 h-10 flex items-center justify-center text-neutral-400 hover:text-black transition-colors shrink-0"
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
          "fixed bottom-0 left-0 right-0 h-[92vh] rounded-t-[32px] md:rounded-t-[40px] z-[90] lg:relative lg:h-full lg:w-[400px] lg:rounded-none lg:z-auto bg-white border-t lg:border-t-0 lg:border-l border-neutral-100 flex flex-col overflow-hidden",
          !isCopilotOpen && !isDesktop && "pointer-events-none"
        )}
        style={{
          display: !isCopilotOpen && isDesktop ? "none" : "flex"
        }}
      >
        {/* Drag Handle for Sheet */}
        <div className="lg:hidden flex justify-center py-4 shrink-0">
          <div className="w-12 h-1.5 bg-neutral-200 rounded-full" />
        </div>
        
        <div className="lg:hidden absolute top-4 right-4 z-[100]">
          <button onClick={() => setIsCopilotOpen(false)} className="p-2 bg-neutral-100 rounded-full hover:bg-neutral-200 transition-colors">
            <X className="w-4 h-4" />
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
