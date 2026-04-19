import { useState, useEffect, useRef } from "react";
import { FileItem, UserProfile, Tag, TAG_COLORS } from "@/src/types";
import { db } from "@/src/lib/firebase";
import { doc, updateDoc, onSnapshot } from "firebase/firestore";
import { 
  ArrowLeft, Save, Loader2, Edit3, MessageSquare, Twitter, 
  BrainCircuit, FileText, X, Plus, Image as ImageIcon,
  Bold, Italic, Heading1, Heading2, List, ListOrdered, Maximize2, Quote, Globe, ExternalLink
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/src/lib/utils";
import { useEditor, EditorContent, ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import { Node, mergeAttributes } from '@tiptap/core';
import { marked } from 'marked';

export const compressImage = async (f: File): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxSize = 800; // Aggressively compress width/height
        if (width > height && width > maxSize) {
          height *= maxSize / width;
          width = maxSize;
        } else if (height > maxSize) {
          width *= maxSize / height;
          height = maxSize;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.6)); // Aggressive quality
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(f);
  });
};

interface FileEditorProps {
  file: FileItem;
  onBack: () => void;
  profile: UserProfile;
}

const BlogImageComponent = (props: any) => {
  const { node, updateAttributes } = props;
  const src = node.attrs.src;
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
     const file = e.target.files?.[0];
     if (!file) return;
     const base64 = await compressImage(file);
     updateAttributes({ src: base64 });
  };

  return (
    <NodeViewWrapper className="max-w-full my-6 clear-both" contentEditable={false}>
      {src ? (
        <div className="relative inline-block rounded-2xl overflow-hidden group">
          <img src={src} className="w-full h-auto rounded-2xl shadow-sm border border-neutral-100" />
          <div 
            className="absolute top-3 right-3 p-2 bg-black/60 hover:bg-black/90 rounded-xl text-white cursor-pointer transition-all backdrop-blur-md shadow-lg"
            onClick={() => inputRef.current?.click()}
            title="Replace image"
          >
            <Edit3 className="w-4 h-4" />
          </div>
        </div>
      ) : (
        <div 
          className="w-full aspect-video bg-neutral-50 rounded-2xl border-2 border-dashed border-neutral-200 flex flex-col items-center justify-center cursor-pointer hover:bg-neutral-100 transition-colors"
          onClick={() => inputRef.current?.click()}
        >
          <div className="w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center mb-3">
            <ImageIcon className="w-5 h-5 text-neutral-400" />
          </div>
          <span className="text-sm text-neutral-500 font-medium">Click to add an image</span>
        </div>
      )}
      <input type="file" accept="image/*" className="hidden" ref={inputRef} onChange={handleUpload} />
    </NodeViewWrapper>
  );
};

const CustomImage = Image.extend({
  addNodeView() {
    return ReactNodeViewRenderer(BlogImageComponent);
  },
  addAttributes() {
    return {
      ...this.parent?.(),
      src: {
        default: null,
      },
    }
  },
  parseHTML() {
    return [
      {
        tag: 'img[src]',
      },
    ]
  },
  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)]
  },
});

const BentoGalleryComponent = (props: any) => {
  const { node, updateAttributes } = props;
  const images = node.attrs.images as string[];
  const slotIndexRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
     console.log("BentoGalleryComponent handleUpload triggered");
     const file = e.target.files?.[0];
     if (!file) return;
     const base64 = await compressImage(file);
     const newImages = [...images];
     if (slotIndexRef.current !== null) {
        newImages[slotIndexRef.current] = base64;
     }
     console.log("BentoGalleryComponent updating images:", newImages);
     updateAttributes({ images: newImages });
  };

  const addSlot = () => {
     if (images.length < 6) {
        updateAttributes({ images: [...images, ""] });
     }
  }

  const count = images.length;

  return (
    <NodeViewWrapper className="my-6 clear-both" contentEditable={false}>
       <div className={cn("grid gap-2", count === 1 ? 'grid-cols-1' : count === 2 ? 'grid-cols-2' : count >= 3 ? 'grid-cols-3' : '')}>
         {images.map((src, i) => (
           <div key={i} 
             className={cn(
               "relative rounded-2xl overflow-hidden bg-neutral-100 aspect-square group",
               count === 3 && i === 0 ? "col-span-2 row-span-2 aspect-auto" : "",
               count === 5 && i < 2 ? "col-span-1" : ""
             )}
           >
             {src ? (
               <>
                 <img src={src} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                 <div 
                   className="absolute top-2 right-2 p-2 bg-black/60 hover:bg-black/90 rounded-xl text-white cursor-pointer transition-all backdrop-blur-md shadow-lg"
                   onClick={() => { slotIndexRef.current = i; inputRef.current?.click(); }}
                   title="Replace image"
                 >
                   <Edit3 className="w-3.5 h-3.5" />
                 </div>
               </>
             ) : (
               <div 
                 className="w-full h-full min-h-[150px] flex flex-col items-center justify-center cursor-pointer border-2 border-dashed border-neutral-200 hover:bg-neutral-50 transition-colors"
                 onClick={() => { slotIndexRef.current = i; inputRef.current?.click(); }}
               >
                 <div className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center mb-2">
                   <Plus className="w-4 h-4 text-neutral-400" />
                 </div>
                 <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Add Image</span>
               </div>
             )}
           </div>
         ))}
       </div>
       {count < 6 && (
         <button 
            onClick={addSlot} 
            className="mt-3 flex items-center justify-center w-full py-2.5 border border-neutral-200 rounded-xl hover:bg-neutral-50 text-neutral-500 font-medium text-sm transition-colors active:scale-[0.98]"
         >
           <Plus className="w-4 h-4 mr-1.5" /> 
           Add Image Slot
         </button>
       )}
       <input type="file" accept="image/*" className="hidden" ref={inputRef} onChange={handleUpload} />
    </NodeViewWrapper>
  );
};


const GalleryExtension = Node.create({
  name: 'bentoGallery',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      images: {
        default: [],
        parseHTML: element => {
          const attr = element.getAttribute('data-images') || '[]';
          console.log("GalleryExtension parseHTML attribute:", attr);
          try {
            return JSON.parse(attr);
          } catch(e) {
            console.error("GalleryExtension parseHTML parse error:", attr, e);
            return [];
          }
        },
        renderHTML: attributes => ({
          'data-images': JSON.stringify(attributes.images),
        })
      },
    }
  },
  parseHTML() {
    return [{ tag: 'div[data-type="gallery"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'gallery' })]
  },
  addNodeView() {
    return ReactNodeViewRenderer(BentoGalleryComponent)
  },
});

export default function FileEditor({ file, onBack, profile }: FileEditorProps) {
  const [name, setName] = useState(file.name);
  const [tags, setTags] = useState<Tag[]>(file.tags || []);
  const [headerImage, setHeaderImage] = useState(file.headerImage || "");
  const [isPublic, setIsPublic] = useState(file.isPublic || false);
  const [saving, setSaving] = useState(false);
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [publishing, setPublishing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const initialContent = useRef(file.content || "");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [extractedImages, setExtractedImages] = useState<string[]>([]);

  const preprocessMarkdown = (markdown: string) => {
    let html = markdown.replace(/:::gallery\n([\s\S]*?)\n:::/g, (match, urls) => {
      const images = urls.trim().split('\n').filter(Boolean);
      return `<div data-type="gallery" data-images="${JSON.stringify(images).replace(/"/g, '&quot;')}"></div>`;
    });
    // Use marked to basic HTML if not already HTML
    if (!html.includes('<') || html.includes(':::gallery')) {
      html = marked.parse(html) as string;
    }
    return html;
  };

  const editor = useEditor({
    extensions: [
      StarterKit,
      CustomImage,
      GalleryExtension,
      Placeholder.configure({
        placeholder: 'Start writing...',
      }),
    ],
    content: preprocessMarkdown(initialContent.current),
    onUpdate: () => setHasUnsavedChanges(true),
    editorProps: {
      attributes: {
        class: 'tiptap prose prose-neutral max-w-none w-full outline-none font-light leading-relaxed prose-img:rounded-2xl prose-img:shadow-sm prose-img:border prose-img:border-neutral-100',
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const updateGallerySummary = () => {
      const imgs: string[] = [];
      editor.state.doc.descendants((node: any) => {
        if (node.type.name === 'image' && node.attrs.src) imgs.push(node.attrs.src);
        if (node.type.name === 'bentoGallery') {
          (node.attrs.images || []).forEach((src: string) => src && imgs.push(src));
        }
      });
      // De-duplicate if same image used twice
      setExtractedImages(Array.from(new Set(imgs)));
    };
    updateGallerySummary();
    editor.on('update', updateGallerySummary);
    return () => { editor.off('update', updateGallerySummary); };
  }, [editor]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "files", file.id), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as FileItem;
        if (data.name !== name) setName(data.name);
        if (JSON.stringify(data.tags) !== JSON.stringify(tags)) setTags(data.tags || []);
        if (data.headerImage !== headerImage) setHeaderImage(data.headerImage || "");
        if (data.isPublic !== isPublic) setIsPublic(data.isPublic || false);
        
        if (data.content && data.content !== initialContent.current && !hasUnsavedChanges && editor) {
            initialContent.current = data.content;
            editor.commands.setContent(preprocessMarkdown(data.content));
        }
      }
    });
    return () => unsub();
  }, [file.id, editor]);

  const handleSave = async (overrideData?: any) => {
    if (!editor) return;
    setSaving(true);
    try {
      const htmlContent = editor.getHTML();
      await updateDoc(doc(db, "files", file.id), {
        name,
        content: htmlContent, // Save as HTML
        tags,
        headerImage,
        isPublic,
        updatedAt: Date.now(),
        ...overrideData
      });
      setHasUnsavedChanges(false);
      initialContent.current = htmlContent;
    } catch (err) {
      console.error("Error saving file:", err);
    } finally {
      setSaving(false);
    }
  };

  const togglePublic = async () => {
    setPublishing(true);
    const newValue = !isPublic;
    try {
      if (hasUnsavedChanges) {
        await handleSave({ isPublic: newValue });
      } else {
        await updateDoc(doc(db, "files", file.id), { isPublic: newValue, updatedAt: Date.now() });
      }
      setIsPublic(newValue);
      if (newValue) {
        // Copy to clipboard
        navigator.clipboard.writeText(`${window.location.origin}/v/${file.ownerId}/${file.id}`);
        alert("Public link copied to clipboard!");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to toggle publish status");
    } finally {
      setPublishing(false);
    }
  };

  // Auto-save disabled per user request
  // useEffect(() => {
  //   if (!hasUnsavedChanges || !editor) return;
  //   const timeout = setTimeout(() => {
  //     handleSave();
  //   }, 1500);
  //   return () => clearTimeout(timeout);
  // }, [hasUnsavedChanges, name, tags, headerImage, editor]);

  const compressImage = async (f: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new window.Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxSize = 1200;
          if (width > height && width > maxSize) {
            height *= maxSize / width;
            width = maxSize;
          } else if (height > maxSize) {
            width *= maxSize / height;
            height = maxSize;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(f);
    });
  };

  const handleHeaderImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;
    const compressedBase64 = await compressImage(uploadedFile);
    setHeaderImage(compressedBase64);
    handleSave({ headerImage: compressedBase64 });
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
    setHasUnsavedChanges(true);
  };

  const removeTag = (id: string) => {
    setTags(tags.filter(t => t.id !== id));
    setHasUnsavedChanges(true);
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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="h-full flex flex-col bg-white overflow-hidden relative"
    >
      <header className="px-6 h-16 border-b border-neutral-100 flex items-center justify-between bg-white shrink-0">
        <div className="flex items-center gap-4 flex-1">
          <button onClick={onBack} className="p-2 -ml-2 hover:bg-neutral-50 rounded-xl transition-all active:scale-95">
            <ArrowLeft className="w-5 h-5 text-neutral-400" />
          </button>
          <div className="flex items-center gap-3 flex-1">
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="w-10 h-10 rounded-xl bg-neutral-50 border border-neutral-100 flex items-center justify-center shrink-0 overflow-hidden relative group"
            >
              {headerImage ? (
                <>
                  <img src={headerImage} alt="Cover" className="w-full h-full object-cover transition-opacity group-hover:opacity-40" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <ImageIcon className="w-4 h-4 text-black" />
                  </div>
                </>
              ) : getIcon()}
              <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleHeaderImageUpload} />
            </button>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                 setName(e.target.value);
                 setHasUnsavedChanges(true);
              }}
              className="outline-none bg-transparent w-full font-light text-lg tracking-tight text-neutral-900 placeholder:text-neutral-200"
              placeholder="Give it a name..."
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isPublic ? (
            <div className="flex items-center bg-green-50 text-green-600 px-3 py-1.5 rounded-full text-xs font-medium mr-2">
              <Globe className="w-3 h-3 mr-1.5" />
              Published
              <button 
                onClick={(e) => { e.stopPropagation(); window.open(`/v/${file.ownerId}/${file.id}`, '_blank'); }}
                className="ml-2 hover:text-green-800"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : null}
          <button
            onClick={togglePublic}
            disabled={publishing}
            className={cn(
              "p-2.5 rounded-full transition-all flex items-center justify-center",
              isPublic ? "bg-neutral-100 text-neutral-600 hover:bg-neutral-200" : "bg-neutral-100 text-neutral-400 hover:bg-neutral-200 hover:text-black"
            )}
            title={isPublic ? "Make Private" : "Publish to Web"}
          >
            {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
          </button>
          <button
            onClick={() => handleSave()}
            disabled={saving || !hasUnsavedChanges}
            className={cn(
              "p-2.5 rounded-full transition-all flex items-center justify-center",
              hasUnsavedChanges && !saving ? "bg-black text-white hover:scale-105 active:scale-95" : "bg-neutral-50 text-neutral-300 pointer-events-none"
            )}
            title="Save"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Sticky Formatting Toolbar */}
      {editor && (
        <div className="sticky top-0 z-10 w-full bg-white/80 backdrop-blur-md border-b border-neutral-100 px-6 py-2 flex items-center gap-1 overflow-x-auto no-scrollbar">
          <button onClick={() => editor.chain().focus().toggleBold().run()} className={cn("p-2 rounded-lg transition-colors", editor.isActive('bold') ? 'bg-neutral-100 text-black' : 'text-neutral-400 hover:text-black hover:bg-neutral-50')}>
            <Bold className="w-4 h-4" />
          </button>
          <button onClick={() => editor.chain().focus().toggleItalic().run()} className={cn("p-2 rounded-lg transition-colors", editor.isActive('italic') ? 'bg-neutral-100 text-black' : 'text-neutral-400 hover:text-black hover:bg-neutral-50')}>
            <Italic className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-neutral-200 mx-2" />
          <button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={cn("p-2 rounded-lg transition-colors", editor.isActive('heading', { level: 1 }) ? 'bg-neutral-100 text-black' : 'text-neutral-400 hover:text-black hover:bg-neutral-50')}>
            <Heading1 className="w-4 h-4" />
          </button>
          <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={cn("p-2 rounded-lg transition-colors", editor.isActive('heading', { level: 2 }) ? 'bg-neutral-100 text-black' : 'text-neutral-400 hover:text-black hover:bg-neutral-50')}>
            <Heading2 className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-neutral-200 mx-2" />
          <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={cn("p-2 rounded-lg transition-colors", editor.isActive('bulletList') ? 'bg-neutral-100 text-black' : 'text-neutral-400 hover:text-black hover:bg-neutral-50')}>
            <List className="w-4 h-4" />
          </button>
          <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className={cn("p-2 rounded-lg transition-colors", editor.isActive('orderedList') ? 'bg-neutral-100 text-black' : 'text-neutral-400 hover:text-black hover:bg-neutral-50')}>
            <ListOrdered className="w-4 h-4" />
          </button>
          <button onClick={() => editor.chain().focus().toggleBlockquote().run()} className={cn("p-2 rounded-lg transition-colors", editor.isActive('blockquote') ? 'bg-neutral-100 text-black' : 'text-neutral-400 hover:text-black hover:bg-neutral-50')}>
            <Quote className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-neutral-200 mx-2" />
          <button onClick={() => editor.chain().focus().insertContent({ type: 'image', attrs: { src: '' } }).run()} className="p-2 rounded-lg transition-colors text-neutral-400 hover:text-black hover:bg-neutral-50" title="Insert Image">
            <ImageIcon className="w-4 h-4" />
          </button>
          <button onClick={() => editor.chain().focus().insertContent({ type: 'bentoGallery', attrs: { images: ['', '', ''] } }).run()} className="flex items-center gap-2 p-2 px-3 rounded-lg transition-colors bg-neutral-50 text-neutral-600 hover:text-black hover:bg-neutral-100" title="Insert Gallery">
            <Maximize2 className="w-4 h-4" />
            <span className="text-xs font-medium">Add Gallery</span>
          </button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto no-scrollbar scroll-smooth" ref={scrollRef}>
          <div className="max-w-3xl mx-auto px-6 py-12">
            {/* Tags */}
            <div className="flex flex-wrap items-center gap-2 mb-10">
              {tags.map(tag => (
                <span 
                  key={tag.id} 
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5"
                  style={{ backgroundColor: `${tag.color}15`, color: tag.color }}
                >
                  {tag.name}
                  <button onClick={() => removeTag(tag.id)} className="hover:opacity-50 transition-opacity"><X className="w-3 h-3" /></button>
                </span>
              ))}
              
              <div className="relative">
                <button 
                  onClick={() => setShowTagMenu(!showTagMenu)}
                  className="w-7 h-7 rounded-lg bg-neutral-50 border border-neutral-100 flex items-center justify-center text-neutral-400 hover:text-black transition-colors"
                  title="Add tag"
                >
                  <Plus className="w-4 h-4" />
                </button>
                
                <AnimatePresence>
                  {showTagMenu && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="absolute top-full left-0 mt-2 p-1.5 bg-white rounded-xl shadow-2xl border border-neutral-100 z-50 flex items-center gap-2"
                    >
                      <input 
                        type="text" 
                        value={newTagName}
                        onChange={e => setNewTagName(e.target.value)}
                        placeholder="Tag..."
                        className="text-xs px-2 py-1.5 outline-none bg-neutral-50 rounded-lg w-24"
                        onKeyDown={e => e.key === 'Enter' && addTag()}
                        autoFocus
                      />
                      <button onClick={addTag} className="p-1.5 bg-black text-white rounded-lg"><Plus className="w-3.5 h-3.5" /></button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="relative group min-h-[500px]">
               <EditorContent editor={editor} />
               <style>{`
                 .ProseMirror p.is-editor-empty:first-child::before {
                   color: #a3a3a3;
                   content: attr(data-placeholder);
                   float: left;
                   height: 0;
                   pointer-events: none;
                 }
               `}</style>
            </div>
          </div>
        </div>

        {/* Gallery Sidebar - Desktop only */}
        {extractedImages.length > 0 && (
          <aside className="hidden lg:flex w-80 border-l border-neutral-50 bg-neutral-50/20 flex-col overflow-hidden">
             <div className="p-6 border-b border-neutral-100 bg-white/50 backdrop-blur-sm">
                <div className="px-2 py-1.5 bg-neutral-900 rounded-lg inline-flex items-center gap-2 mb-4">
                   <ImageIcon className="w-3 h-3 text-white" />
                   <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white">Gallery</span>
                </div>
                <h3 className="text-xl font-bold text-neutral-900 tracking-tight">Gallery Summary</h3>
                <p className="text-xs text-neutral-400 font-medium mt-1">All visual assets in this document</p>
             </div>
             
             <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
                <div className="columns-2 gap-3 space-y-3">
                   {extractedImages.map((src, i) => (
                     <motion.div 
                       key={i}
                       initial={{ opacity: 0, scale: 0.9 }}
                       animate={{ opacity: 1, scale: 1 }}
                       transition={{ delay: i * 0.05 }}
                       className="relative group rounded-xl overflow-hidden border border-neutral-100 shadow-sm bg-white break-inside-avoid"
                     >
                       <img 
                          src={src} 
                          className="w-full h-auto transition-transform duration-500 group-hover:scale-110" 
                          alt={`Gallery item ${i}`}
                       />
                       <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                          <Maximize2 className="w-4 h-4 text-white" />
                       </div>
                     </motion.div>
                   ))}
                </div>
             </div>
          </aside>
        )}
      </div>
    </motion.div>
  );
}
