import { useState, useEffect, useRef } from "react";
import { FileItem, UserProfile, Tag, TAG_COLORS } from "@/src/types";
import { db } from "@/src/lib/firebase";
import { doc, updateDoc, onSnapshot } from "firebase/firestore";
import { ArrowLeft, Save, Loader2, Edit3, MessageSquare, Twitter, BrainCircuit, FileText, Tag as TagIcon, X, Plus, Image as ImageIcon } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/src/lib/utils";

interface FileEditorProps {
  file: FileItem;
  onBack: () => void;
  profile: UserProfile;
}

export default function FileEditor({ file, onBack, profile }: FileEditorProps) {
  const [content, setContent] = useState(file.content || "");
  const [name, setName] = useState(file.name);
  const [tags, setTags] = useState<Tag[]>(file.tags || []);
  const [headerImage, setHeaderImage] = useState(file.headerImage || "");
  const [saving, setSaving] = useState(false);
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "files", file.id), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as FileItem;
        if (data.content !== content) setContent(data.content || "");
        if (data.name !== name) setName(data.name);
        if (JSON.stringify(data.tags) !== JSON.stringify(tags)) setTags(data.tags || []);
        if (data.headerImage !== headerImage) setHeaderImage(data.headerImage || "");
      }
    });
    return () => unsub();
  }, [file.id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "files", file.id), {
        name,
        content,
        tags,
        headerImage,
        updatedAt: Date.now()
      });
    } catch (err) {
      console.error("Error saving file:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setHeaderImage(reader.result as string);
      handleSave();
    };
    reader.readAsDataURL(file);
  };

  const addTag = () => {
    if (!newTagName.trim()) return;
    const newTag: Tag = {
      id: Date.now().toString(),
      name: newTagName.trim(),
      type: "flexible",
      color: TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)]
    };
    setTags([...tags, newTag]);
    setNewTagName("");
    setShowTagMenu(false);
  };

  const removeTag = (id: string) => {
    setTags(tags.filter(t => t.id !== id));
  };

  const getIcon = () => {
    switch (file.type) {
      case "script": return <Edit3 className="w-5 h-5" />;
      case "caption": return <MessageSquare className="w-5 h-5" />;
      case "thread": return <Twitter className="w-5 h-5" />;
      case "brainstorm": return <BrainCircuit className="w-5 h-5" />;
      default: return <FileText className="w-5 h-5" />;
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="h-full flex flex-col bg-white overflow-hidden relative"
    >
      {/* Header Image */}
      <div className="relative h-48 bg-neutral-100 shrink-0 group">
        {headerImage ? (
          <img src={headerImage} alt="Header" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-neutral-400">
            <ImageIcon className="w-8 h-8 opacity-50" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="bg-white text-black px-4 py-2 rounded-full text-sm font-medium shadow-lg hover:scale-105 transition-transform"
          >
            {headerImage ? "Change Cover" : "Add Cover"}
          </button>
          <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleImageUpload} />
        </div>
      </div>

      <header className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between bg-white sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-4 flex-1">
          <button onClick={onBack} className="p-2 -ml-2 hover:bg-neutral-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3 flex-1">
            <div className="w-10 h-10 rounded-xl bg-black text-white flex items-center justify-center shrink-0">
              {getIcon()}
            </div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="font-bold text-xl outline-none bg-transparent w-full"
              placeholder="Untitled"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-full text-sm font-medium hover:bg-neutral-800 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span className="hidden sm:inline">Save</span>
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full">
        <div className="flex flex-wrap items-center gap-2 mb-6">
          {tags.map(tag => (
            <span 
              key={tag.id} 
              className="px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1"
              style={{ backgroundColor: `${tag.color}30`, color: tag.color }}
            >
              {tag.name}
              <button onClick={() => removeTag(tag.id)} className="hover:bg-black/10 rounded-full p-0.5"><X className="w-3 h-3" /></button>
            </span>
          ))}
          
          <div className="relative">
            <button 
              onClick={() => setShowTagMenu(!showTagMenu)}
              className="px-3 py-1 rounded-full text-xs font-medium bg-neutral-100 text-neutral-600 hover:bg-neutral-200 flex items-center gap-1 transition-colors"
            >
              <Plus className="w-3 h-3" /> Add Tag
            </button>
            
            <AnimatePresence>
              {showTagMenu && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute top-full left-0 mt-2 p-2 bg-white rounded-xl shadow-xl border border-neutral-100 z-20 flex items-center gap-2"
                >
                  <input 
                    type="text" 
                    value={newTagName}
                    onChange={e => setNewTagName(e.target.value)}
                    placeholder="Tag name..."
                    className="text-sm px-2 py-1 outline-none bg-neutral-50 rounded-lg"
                    onKeyDown={e => e.key === 'Enter' && addTag()}
                    autoFocus
                  />
                  <button onClick={addTag} className="p-1.5 bg-black text-white rounded-lg"><Plus className="w-4 h-4" /></button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Start typing here..."
          className="w-full h-full min-h-[500px] resize-none outline-none text-base leading-relaxed text-neutral-800 placeholder:text-neutral-300"
        />
      </div>
    </motion.div>
  );
}
