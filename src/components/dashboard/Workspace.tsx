import { useState, useEffect, useRef } from "react";
import { UserProfile, FileItem, FileType } from "@/src/types";
import { db } from "@/src/lib/firebase";
import { collection, query, where, onSnapshot, addDoc, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { Folder, FileText, Plus, ChevronRight, Search, Bell, Edit3, MessageSquare, Twitter, BrainCircuit, Check, Image as ImageIcon, Trash2 } from "lucide-react";
import { motion, AnimatePresence, useDragControls } from "motion/react";
import { cn } from "@/src/lib/utils";
import ContextMenu from "@/src/components/ui/ContextMenu";
import FileEditor from "./FileEditor";
import PromptModal from "@/src/components/ui/PromptModal";
import ConfirmationModal from "@/src/components/ui/ConfirmationModal";
import ColorPickerModal from "@/src/components/ui/ColorPickerModal";
import { ILLUSTRATIONS } from "@/src/lib/illustrations";
import { TAG_COLORS } from "@/src/types";

interface WorkspaceProps {
  profile: UserProfile;
  currentFolderId: string | null;
  setCurrentFolderId: (id: string | null) => void;
  currentPath: string[];
  selectedFile: FileItem | null;
  setSelectedFile: (file: FileItem | null) => void;
  searchQuery: string;
}

export default function Workspace({ profile, currentFolderId, setCurrentFolderId, currentPath, selectedFile, setSelectedFile, searchQuery }: WorkspaceProps) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  
  const [createModalState, setCreateModalState] = useState<{ isOpen: boolean; type: FileType | null }>({ isOpen: false, type: null });
  const [renameModalState, setRenameModalState] = useState<{ isOpen: boolean; fileId: string | null; currentName: string }>({ isOpen: false, fileId: null, currentName: "" });
  const [deleteModalState, setDeleteModalState] = useState<{ isOpen: boolean; fileId: string | null }>({ isOpen: false, fileId: null });
  const [colorModalState, setColorModalState] = useState<{ isOpen: boolean; fileId: string | null }>({ isOpen: false, fileId: null });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingFolderId, setUploadingFolderId] = useState<string | null>(null);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning 👋";
    if (hour < 18) return "Good Afternoon ☀️";
    return "Good Evening 🌙";
  };

  useEffect(() => {
    if (!profile.uid) return;
    const q = query(collection(db, "files"), where("ownerId", "==", profile.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fileList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FileItem));
      setFiles(fileList);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [profile.uid]);

  const createItem = async (type: FileType, name: string = "Untitled") => {
    setLoading(true);
    try {
      const newFile: Omit<FileItem, "id"> = {
        name,
        type,
        parentId: currentFolderId,
        ownerId: profile.uid,
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        content: ""
      };
      await addDoc(collection(db, "files"), newFile);
      setShowCreateMenu(false);
    } catch (err) {
      console.error("Error creating item:", err);
    } finally {
      setLoading(false);
    }
  };

  const deleteItem = async (id: string) => {
    await deleteDoc(doc(db, "files", id));
  };

  const duplicateItem = async (file: FileItem) => {
    try {
      const { id, ...fileData } = file;
      const newFile = {
        ...fileData,
        name: `${file.name} (Copy)`,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      await addDoc(collection(db, "files"), newFile);
    } catch (err) {
      console.error("Error duplicating item:", err);
    }
  };

  const renameItem = async (id: string, newName: string) => {
    await updateDoc(doc(db, "files", id), { name: newName, updatedAt: Date.now() });
  };

  const updateFolderColor = async (id: string, color: string) => {
    await updateDoc(doc(db, "files", id), { color, updatedAt: Date.now() });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingFolderId) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      await updateDoc(doc(db, "files", uploadingFolderId), { headerImage: reader.result as string, updatedAt: Date.now() });
      setUploadingFolderId(null);
    };
    reader.readAsDataURL(file);
  };

  const triggerImageUpload = (folderId: string) => {
    setUploadingFolderId(folderId);
    fileInputRef.current?.click();
  };

  const filteredFiles = files
    .filter(f => 
      (f.parentId || null) === currentFolderId && 
      f.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => b.createdAt - a.createdAt);

  const folders = filteredFiles.filter(f => f.type === "folder");
  const recentFiles = filteredFiles.filter(f => f.type !== "folder").slice(0, 10);

  if (selectedFile) {
    return <FileEditor file={selectedFile} onBack={() => setSelectedFile(null)} profile={profile} />;
  }

  return (
    <div className="min-h-full bg-[#f8f9fa] pb-40">
      <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleImageUpload} />
      
      {/* Header */}
      <header className="px-4 pt-8 pb-4 flex justify-between items-center">
        <div className="relative">
          <button 
            onClick={() => setShowCreateMenu(!showCreateMenu)}
            className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-xl text-sm font-medium text-blue-600 hover:bg-blue-100 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add file
          </button>
          <AnimatePresence>
            {showCreateMenu && (
              <motion.div
                initial={{ opacity: 0, y: 5, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 5, scale: 0.98 }}
                className="absolute left-0 mt-2 w-48 bg-white border border-neutral-200 rounded-md p-1 z-50"
              >
                {[
                  { type: "folder", label: "New Folder", icon: <Folder className="w-4 h-4" /> },
                  { type: "script", label: "New Script", icon: <Edit3 className="w-4 h-4" /> },
                  { type: "caption", label: "New Caption", icon: <MessageSquare className="w-4 h-4" /> },
                  { type: "thread", label: "New Thread", icon: <Twitter className="w-4 h-4" /> },
                  { type: "brainstorm", label: "New Brainstorm", icon: <BrainCircuit className="w-4 h-4" /> },
                ].map((item) => (
                  <button
                    key={item.type}
                    onClick={() => {
                      setCreateModalState({ isOpen: true, type: item.type as FileType });
                      setShowCreateMenu(false);
                    }}
                    className="w-full flex items-center gap-3 px-2 py-1.5 hover:bg-neutral-100 rounded-lg text-sm transition-colors"
                  >
                    <div className="w-6 h-6 rounded-lg bg-neutral-100 flex items-center justify-center">
                      {item.icon}
                    </div>
                    <span className="font-medium">{item.label}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* Greeting & Breadcrumbs */}
      <div className="px-4 flex flex-col gap-1 mt-2">
        <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">{getGreeting()}</p>
        <div className="flex items-center gap-1 text-sm font-semibold tracking-tight overflow-hidden">
          <button onClick={() => setCurrentFolderId(null)} className="hover:text-blue-600 shrink-0">Home</button>
          
          {currentPath.length > 2 && (
            <div className="flex items-center gap-1 shrink-0">
               <ChevronRight className="w-4 h-4 text-neutral-400" />
               <span className="text-neutral-400">...</span>
            </div>
          )}

          {currentPath.slice(-2).map((path, i) => (
            <div key={i} className="flex items-center gap-1 overflow-hidden">
              <ChevronRight className="w-4 h-4 text-neutral-400 shrink-0" />
              <button className="hover:text-blue-600 truncate max-w-[120px]">{path}</button>
            </div>
          ))}
        </div>
      </div>

      {/* Folders Horizontal Scroll */}
      {folders.length > 0 && (
        <div className="mt-6 overflow-x-auto whitespace-nowrap px-4 pb-4 snap-x h-[50vh] shrink-0 hide-scrollbar overflow-y-hidden">
          {folders.map(folder => (
            <motion.div
              key={folder.id}
              initial={{ opacity: 0, x: 20, filter: "blur(10px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.5 }}
              className="inline-block h-[50vh] mr-4 last:mr-0"
            >
              <ContextMenu 
                items={[
                  { label: "Open", icon: <ChevronRight />, onClick: () => setCurrentFolderId(folder.id) },
                  { label: "Change Cover", icon: <ImageIcon />, onClick: () => triggerImageUpload(folder.id) },
                  { label: "Change Color", icon: <div className="w-4 h-4 rounded-full bg-gradient-to-r from-red-500 via-green-500 to-blue-500" />, onClick: () => setColorModalState({ isOpen: true, fileId: folder.id }) },
                  { label: "Rename", icon: <FileText />, onClick: () => setRenameModalState({ isOpen: true, fileId: folder.id, currentName: folder.name }) },
                  { label: "Delete", icon: <Plus className="rotate-45" />, onClick: () => setDeleteModalState({ isOpen: true, fileId: folder.id }), variant: "danger" as const },
                ]}
                showDotsOnMobile
              >
                <div 
                  onClick={() => setCurrentFolderId(folder.id)}
                  className="min-w-[15em] w-[15em] h-[50vh] rounded-xl p-4 flex flex-col justify-between snap-center relative overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: folder.color || "#e9d5ff" }}
                >
                  {folder.headerImage && <img src={folder.headerImage} className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-overlay" />}
                  <div className="relative z-10 flex items-center gap-2 text-white/90 font-medium text-sm">
                    <div className="w-2 h-2 rounded-full bg-white/50" />
                    {folder.name}
                  </div>
                  <div className="relative z-10 text-white">
                    <p className="text-xs opacity-80 font-medium mb-1">Folder</p>
                    <p className="font-semibold text-lg leading-tight">{folder.name}</p>
                  </div>
                </div>
              </ContextMenu>
            </motion.div>
          ))}
        </div>
      )}

      {/* Recent Files List */}
      <div className="mt-4 px-4 flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Recent Files</h2>

        <div className="flex flex-col gap-3">
          <AnimatePresence mode="popLayout">
            {recentFiles.map(file => (
              <motion.div
                key={file.id}
                initial={{ opacity: 0.3, scale: 0.85, filter: "blur(10px)" }}
                whileInView={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                viewport={{ once: false, amount: 0.15, margin: "-10% 0px -10% 0px" }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="w-full origin-center"
              >
                <FileNotificationCard 
                  file={file} 
                  onClick={() => setSelectedFile(file)} 
                  onDelete={() => setDeleteModalState({ isOpen: true, fileId: file.id })}
                />
              </motion.div>
            ))}
            {recentFiles.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center py-10 text-neutral-400">
                <p className="text-sm font-medium">No recent files</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Modals */}
      <PromptModal
        isOpen={createModalState.isOpen}
        title={`New ${createModalState.type}`}
        placeholder="Name"
        onConfirm={(name) => {
          createItem(createModalState.type!, name);
          setCreateModalState({ isOpen: false, type: null });
        }}
        onCancel={() => setCreateModalState({ isOpen: false, type: null })}
      />
      
      <PromptModal
        isOpen={renameModalState.isOpen}
        title="Rename"
        placeholder="New name"
        initialValue={renameModalState.currentName}
        onConfirm={(name) => {
          if (renameModalState.fileId) {
            renameItem(renameModalState.fileId, name);
          }
          setRenameModalState({ isOpen: false, fileId: null, currentName: "" });
        }}
        onCancel={() => setRenameModalState({ isOpen: false, fileId: null, currentName: "" })}
      />

      <ConfirmationModal
        isOpen={deleteModalState.isOpen}
        title="Delete File"
        message="Are you sure you want to delete this file? This action cannot be undone."
        onConfirm={() => {
          if (deleteModalState.fileId) {
            deleteItem(deleteModalState.fileId);
          }
          setDeleteModalState({ isOpen: false, fileId: null });
        }}
        onCancel={() => setDeleteModalState({ isOpen: false, fileId: null })}
      />

      <ColorPickerModal
        isOpen={colorModalState.isOpen}
        colors={TAG_COLORS}
        onConfirm={(color) => {
          if (colorModalState.fileId) {
            updateFolderColor(colorModalState.fileId, color);
          }
          setColorModalState({ isOpen: false, fileId: null });
        }}
        onCancel={() => setColorModalState({ isOpen: false, fileId: null })}
      />
    </div>
  );
}

function FileNotificationCard({ file, onClick, onDelete }: { file: FileItem; onClick: () => void; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);

  const getIcon = () => {
    switch (file.type) {
      case "script": return <Edit3 className="w-5 h-5" />;
      case "caption": return <MessageSquare className="w-5 h-5" />;
      case "thread": return <Twitter className="w-5 h-5" />;
      case "brainstorm": return <BrainCircuit className="w-5 h-5" />;
      default: return <FileText className="w-5 h-5" />;
    }
  };

  const getBgColor = () => {
    switch (file.type) {
      case "script": return "bg-blue-500";
      case "caption": return "bg-indigo-500";
      case "thread": return "bg-sky-500";
      case "brainstorm": return "bg-purple-500";
      default: return "bg-neutral-500";
    }
  };

  const timeAgo = (ts: number) => {
    const diff = Math.floor((Date.now() - ts) / 60000);
    if (diff < 60) return `${diff}m ago`;
    const hours = Math.floor(diff / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <motion.div 
      layout
      className="bg-white rounded-2xl p-3 border border-neutral-200 flex flex-col gap-2"
    >
      <div className="flex items-start gap-3 relative group/card">
        <div 
          className="flex flex-1 items-start gap-3 cursor-pointer" 
          onClick={() => setExpanded(!expanded)}
        >
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0", getBgColor())}>
            {getIcon()}
          </div>
          <div className="flex-1 flex flex-col pt-0.5">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-sm">{file.name}</h3>
              <span className="text-xs text-neutral-400 font-medium">{timeAgo(file.updatedAt)}</span>
            </div>
            <p className="text-xs text-neutral-500 mt-0.5 line-clamp-1 font-medium">
              {file.content?.replace(/[#*`]/g, '') || "Empty file..."}
            </p>
          </div>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute -top-1 -right-1 p-1.5 bg-neutral-100 border border-neutral-200 text-neutral-400 hover:text-red-500 hover:bg-neutral-50 rounded-full opacity-0 group-hover/card:opacity-100 transition-all shadow-sm z-10"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      
      <AnimatePresence>
        {expanded && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-2 border-t border-neutral-100 mt-1 cursor-pointer relative group/img" onClick={onClick}>
              <img 
                src={file.headerImage || ILLUSTRATIONS.boyAndGirlHoldingPen} 
                className="w-full h-48 object-cover rounded-sm bg-neutral-100" 
                referrerPolicy="no-referrer"
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="absolute bottom-2 right-2 p-1.5 bg-red-500/80 hover:bg-red-500 text-white rounded-full opacity-0 group-hover/img:opacity-100 transition-all backdrop-blur-sm shadow-sm"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
