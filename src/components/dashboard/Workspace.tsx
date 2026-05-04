import { useState, useEffect, useRef } from "react";
import { UserProfile, FileItem, FileType } from "@/src/types";
import { rtdb } from "@/src/lib/firebase";
import { ref as dbRef, onValue, set, push, update, remove } from "firebase/database";
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
    const snapshotUnsub = onValue(filesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const fileList = Object.entries(data)
          .map(([id, f]: [string, any]) => ({ id, ...f } as FileItem))
          .filter(f => f.ownerId === profile.uid);
        
        // Sorting by updatedAt (latest first)
        fileList.sort((a, b) => b.updatedAt - a.updatedAt);
        setFiles(fileList);
      } else {
        setFiles([]);
      }
      setLoading(false);
    }, (error) => {
      console.error("RTDB error in Workspace:", error);
      setLoading(false);
    });
    
    return () => snapshotUnsub();
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
      const newRef = push(dbRef(rtdb, "files"));
      await set(newRef, newFile);
      setShowCreateMenu(false);
    } catch (err) {
      console.error("Error creating item in RTDB:", err);
    } finally {
      setLoading(false);
    }
  };

  const deleteItem = async (id: string) => {
    try {
      await remove(dbRef(rtdb, `files/${id}`));
    } catch (err) {
      console.error("Error deleting item from RTDB:", err);
    }
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
      const newRef = push(dbRef(rtdb, "files"));
      await set(newRef, cleanObject(newFile));
    } catch (err) {
      console.error("Error duplicating item in RTDB:", err);
    }
  };

  const renameItem = async (id: string, newName: string) => {
    try {
      await update(dbRef(rtdb, `files/${id}`), { name: newName, updatedAt: Date.now() });
    } catch (err) {
      console.error("Error renaming item in RTDB:", err);
    }
  };

  const updateFolderColor = async (id: string, color: string) => {
    try {
      await update(dbRef(rtdb, `files/${id}`), { color, updatedAt: Date.now() });
    } catch (err) {
      console.error("Error updating folder color in RTDB:", err);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingFolderId) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        await update(dbRef(rtdb, `files/${uploadingFolderId}`), { headerImage: reader.result as string, updatedAt: Date.now() });
        setUploadingFolderId(null);
      } catch (err) {
        console.error("Error uploading image to RTDB:", err);
      }
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
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const folders = filteredFiles.filter(f => f.type === "folder");
  const recentFiles = filteredFiles.filter(f => f.type !== "folder").slice(0, 15);

  if (selectedFile) {
    return <FileEditor file={selectedFile} onBack={() => setSelectedFile(null)} profile={profile} />;
  }

  return (
    <div className="min-h-full bg-[#f8f9fa] dark:bg-black pb-40">
      <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleImageUpload} />
      
      {/* Header */}
      <header className="px-4 pt-8 pb-4 flex justify-between items-center">
        <div className="relative">
          <button 
            onClick={() => setShowCreateMenu(!showCreateMenu)}
            className="flex items-center gap-2 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-md border border-neutral-200 dark:border-neutral-800 px-4 py-2 rounded-xl text-sm font-bold text-neutral-900 dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all shadow-sm active:scale-95"
          >
            <Plus className="w-4 h-4" /> Add dynamic file
          </button>
          <AnimatePresence>
            {showCreateMenu && (
              <motion.div
                initial={{ opacity: 0, y: 5, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 5, scale: 0.98 }}
                className="absolute left-0 mt-2 w-56 bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 rounded-2xl p-1.5 z-50 shadow-2xl"
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
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-xl text-sm transition-colors text-left font-semibold text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                  >
                    <div className="w-8 h-8 rounded-lg bg-neutral-50 dark:bg-neutral-800 flex items-center justify-center">
                      {item.icon}
                    </div>
                    <span>{item.label}</span>
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
        <div className="flex items-center gap-1 text-sm font-semibold tracking-tight overflow-hidden dark:text-neutral-200">
          <button onClick={() => setCurrentFolderId(null)} className="hover:text-primary shrink-0">Home</button>
          
          {currentPath.length > 2 && (
            <div className="flex items-center gap-1 shrink-0">
               <ChevronRight className="w-4 h-4 text-neutral-400" />
               <span className="text-neutral-400">...</span>
            </div>
          )}

          {currentPath.slice(-2).map((path, i) => (
            <div key={i} className="flex items-center gap-1 overflow-hidden">
               <ChevronRight className="w-4 h-4 text-neutral-400 shrink-0" />
               <button onClick={() => {
                 // Logic to go back in breadcrumbs could go here
               }} className="hover:text-primary truncate max-w-[120px]">{path}</button>
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
                  { label: "Change Color", icon: <div className="w-4 h-4 rounded-full bg-gradient-to-r from-red-500 via-green-500 to-primary" />, onClick: () => setColorModalState({ isOpen: true, fileId: folder.id }) },
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

      {/* Recent Files Grid */}
      <div className="mt-8 px-4 flex flex-col gap-4">
        <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">Recent Files</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {recentFiles.map((file, idx) => (
              <motion.div
                key={file.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: idx * 0.05 }}
              >
                <FileGridCard 
                  file={file} 
                  onClick={() => setSelectedFile(file)} 
                  onDelete={() => setDeleteModalState({ isOpen: true, fileId: file.id })}
                />
              </motion.div>
            ))}
          </AnimatePresence>
          {recentFiles.length === 0 && !loading && (
            <div className="col-span-full flex flex-col items-center justify-center py-20 text-neutral-400 bg-white dark:bg-neutral-900 rounded-3xl border border-dashed border-neutral-200 dark:border-neutral-800">
              <p className="text-sm font-bold uppercase tracking-widest opacity-50">Empty Workspace</p>
            </div>
          )}
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

function FileGridCard({ file, onClick, onDelete }: { file: FileItem; onClick: () => void; onDelete: () => void }) {
  const getIcon = () => {
    switch (file.type) {
      case "script": return <Edit3 className="w-4 h-4" />;
      case "caption": return <MessageSquare className="w-4 h-4" />;
      case "thread": return <Twitter className="w-4 h-4" />;
      case "brainstorm": return <BrainCircuit className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  const getBgColor = () => {
    switch (file.type) {
      case "script": return "bg-primary";
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

  const getPreviewText = (htmlContent: string) => {
    if (!htmlContent) return 'Empty content...';
    try {
      const withoutBase64 = htmlContent.replace(/data:image\/[a-zA-Z]*;base64,[^\s"']+/g, '[Image]');
      const withoutGalleryJSON = withoutBase64.replace(/data-images='\[.*?\]'/g, '');
      let text = withoutGalleryJSON.replace(/<[^>]+>/g, ' ').trim();
      text = text.replace(/\s+/g, ' '); 
      if (text.length > 70) return text.substring(0, 70) + '...';
      return text || 'Empty content...';
    } catch {
      return 'Empty content...';
    }
  };

  return (
    <div 
      onClick={onClick}
      className="group bg-white dark:bg-neutral-900 rounded-3xl border border-neutral-100 dark:border-neutral-800 p-4 flex flex-col gap-4 cursor-pointer hover:border-neutral-200 dark:hover:border-neutral-700 transition-all hover:translate-y-[-2px] active:translate-y-0"
    >
      <div className="flex justify-between items-start">
        <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg shadow-black/5", getBgColor())}>
          {getIcon()}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-2 text-neutral-300 hover:text-red-500 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between items-center gap-2">
          <h3 className="font-bold text-sm truncate text-neutral-900 dark:text-white">{file.name}</h3>
          <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider shrink-0">{timeAgo(file.updatedAt)}</span>
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2 font-medium leading-relaxed">
          {getPreviewText(file.content)}
        </p>
      </div>

      <div className="relative aspect-video rounded-2xl overflow-hidden bg-neutral-50 dark:bg-neutral-800 border border-neutral-50 dark:border-neutral-800">
        <img 
          src={file.headerImage || ILLUSTRATIONS.boyAndGirlHoldingPen} 
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
          referrerPolicy="no-referrer"
          alt={file.name}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </div>
  );
}
