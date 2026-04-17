import { useState, useEffect, useRef } from "react";
import { UserProfile, FileItem, FileType } from "@/src/types";
import Sidebar from "./Sidebar";
import Workspace from "./Workspace";
import AICopilot from "./AICopilot";
import SettingsView from "./SettingsView";
import VoiceAssistant from "./VoiceAssistant";
import { NotificationProvider } from "./NotificationSystem";
import { motion, AnimatePresence } from "motion/react";
import { MessageSquare, Menu, X, Mic, ChevronUp } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { db } from "@/src/lib/firebase";
import { collection, query, where, onSnapshot, addDoc, doc, updateDoc, arrayUnion, deleteDoc, getDocs, orderBy, limit } from "firebase/firestore";

export default function Dashboard({ profile }: { profile: UserProfile }) {
  return (
    <NotificationProvider>
      <DashboardContent profile={profile} />
    </NotificationProvider>
  );
}

function DashboardContent({ profile }: { profile: UserProfile }) {
  const [activeTab, setActiveTab] = useState<"workspace" | "settings">("workspace");
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(typeof window !== "undefined" ? window.innerWidth >= 768 : true);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);
  const [geminiKey, setGeminiKey] = useState<string>(() => localStorage.getItem("gemini_api_key") || "");

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const aiCopilotRef = useRef<any>(null);
  const voiceAssistantRef = useRef<any>(null);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [showBottomBar, setShowBottomBar] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    if (!profile.uid) return;
    const q = query(collection(db, "files"), where("ownerId", "==", profile.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fileList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FileItem));
      setFiles(fileList);
    });
    return () => unsubscribe();
  }, [profile.uid]);

  const handleMainScroll = (e: React.UIEvent<HTMLElement>) => {
    const currentScrollY = e.currentTarget.scrollTop;
    const threshold = window.innerHeight * 0.05;
    
    if (currentScrollY > lastScrollY.current && currentScrollY > threshold) {
      setShowBottomBar(false);
    } else if (currentScrollY < lastScrollY.current) {
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
        type: "folder",
        parentId: currentFolderId,
        ownerId: profile.uid,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: [],
        color: "#3b82f6"
      };
      const docRef = await addDoc(collection(db, "files"), newFolder);
      return docRef.id;
    } catch (err) {
      console.error("Error creating folder:", err);
    }
  };

  const logActionToChat = async (messageContent: string, isSilent: boolean = false, role: 'user' | 'assistant' | 'system' = 'assistant') => {
    let sessionId = currentSessionIdRef.current;
    
    if (!sessionId) {
      // If no session in state, check for existing sessions first
      const q = query(
        collection(db, "chatSessions"), 
        where("ownerId", "==", profile.uid), 
        orderBy("updatedAt", "desc"), 
        limit(1)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        sessionId = snap.docs[0].id;
        currentSessionIdRef.current = sessionId;
        setCurrentSessionId(sessionId);
      } else {
        // Create a new session if none exists at all
        const newDoc = await addDoc(collection(db, "chatSessions"), {
          ownerId: profile.uid,
          title: "Voice Brainstorming",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: []
        });
        sessionId = newDoc.id;
        currentSessionIdRef.current = sessionId;
        setCurrentSessionId(sessionId);
      }
    }

    const sessionRef = doc(db, "chatSessions", sessionId);
    const newMessage = {
      role,
      content: messageContent,
      createdAt: Date.now(),
      id: Date.now().toString(),
      isSilent
    };

    await updateDoc(sessionRef, {
      messages: arrayUnion(newMessage),
      updatedAt: Date.now()
    });
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
      const docRef = await addDoc(collection(db, "files"), newFile);
      return docRef.id;
    } catch (err) {
      console.error("Error creating file:", err);
    }
  };

  const handleUpdateFile = async (id: string, updates: Partial<FileItem>) => {
    try {
      await updateDoc(doc(db, "files", id), { ...updates, updatedAt: Date.now() });
    } catch (err) {
      console.error("Error updating file:", err);
    }
  };

  const handleDeleteFile = async (id: string) => {
    try {
      await deleteDoc(doc(db, "files", id));
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
    setCurrentFolderId(null);
    setSelectedFile(null);
  }, [activeTab]);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const showCopilot = isCopilotOpen || (activeTab === "workspace" && isDesktop && !selectedFile);

  return (
    <div className="h-full flex bg-[#f8f9fa] relative overflow-y-auto">
      {/* Desktop Sidebar */}
      <div className="hidden md:block">
        <Sidebar 
          activeTab={activeTab} 
          setActiveTab={setActiveTab} 
          isCopilotOpen={showCopilot}
          onToggleCopilot={() => setIsCopilotOpen(!isCopilotOpen)}
        />
      </div>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[60] md:hidden"
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed inset-y-0 left-0 w-[280px] bg-white z-[70] md:hidden"
            >
              <Sidebar 
                activeTab={activeTab} 
                setActiveTab={setActiveTab} 
                onClose={() => setIsSidebarOpen(false)}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <main onScroll={handleMainScroll} className="flex-1 flex flex-col relative overflow-y-auto">
        {/* Mobile Header */}
        <header className="md:hidden sticky top-0 flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-white/80 backdrop-blur-md z-40">
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 text-neutral-500">
            <Menu className="w-6 h-6" />
          </button>
          <div className="font-bold text-sm truncate max-w-[200px]">Brandable</div>
          <div className="w-10"></div>
        </header>

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
                    animate={{ 
                      rotate: [0, 360],
                      scale: [1, 1.2, 1],
                    }}
                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-[-100%] bg-[conic-gradient(from_0deg,#3b82f6,#8b5cf6,#ec4899,#3b82f6)] blur-md opacity-60"
                  />
                  <motion.div 
                    animate={{ 
                      rotate: [360, 0],
                      scale: [1.2, 1, 1.2],
                    }}
                    transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-[-100%] bg-[conic-gradient(from_180deg,#10b981,#3b82f6,#8b5cf6,#10b981)] blur-lg opacity-40 mix-blend-overlay"
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

      {/* Copilot Sidebar (Desktop) & Overlay (Mobile) */}
      <AnimatePresence>
        {isCopilotOpen && activeTab !== "settings" && (
          <>
            {/* Mobile Overlay Background */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCopilotOpen(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[80] md:hidden"
            />
          </>
        )}
      </AnimatePresence>

      <div 
        className={cn(
          "fixed bottom-0 left-0 right-0 h-[85vh] rounded-t-lg md:relative md:h-full md:w-[380px] md:rounded-none z-[90] md:z-auto transition-transform duration-300",
          !showCopilot && "translate-y-full md:translate-y-0 md:hidden",
          activeTab === "settings" && "hidden md:hidden",
          "bg-white border-t md:border-t-0 md:border-l border-neutral-200 overflow-hidden flex flex-col"
        )}
      >
        <div className="md:hidden absolute top-4 right-4 z-[100]">
          <button onClick={() => setIsCopilotOpen(false)} className="p-2 bg-neutral-100 rounded-full">
            <X className="w-5 h-5" />
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
            setActiveTab("workspace");
            setCurrentFolderId(id);
            if (window.innerWidth < 768) setIsCopilotOpen(false);
          }}
          onOpenSettings={() => setActiveTab("settings")}
          onCreateFile={handleCreateFile}
          onUpdateFile={handleUpdateFile}
          onDeleteFile={handleDeleteFile}
          onCreateFolder={handleCreateFolder}
          onSessionChange={setCurrentSessionId}
        />
      </div>
      {/* Voice Assistant Implementation */}
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
