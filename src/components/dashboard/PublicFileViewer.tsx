import { useState, useEffect } from "react";
import { ref as dbRef, onValue } from "firebase/database";
import { rtdb } from "@/src/lib/firebase";
import { FileItem } from "@/src/types";
import Loader from "@/src/components/ui/Loader";
import { marked } from "marked";

const renderContentHTML = (content: string) => {
  if (!content) return "";
  
  let html = content;

  // 1. Support the :::gallery syntax just like the editor's preprocessMarkdown
  html = html.replace(/:::gallery\n([\s\S]*?)\n:::/g, (match, urls) => {
    const images = urls.trim().split('\n').filter(Boolean);
    return `<div data-type="gallery" data-images="${JSON.stringify(images).replace(/"/g, '&quot;')}"></div>`;
  });

  // 2. If it doesn't look like HTML, or it was markdown that was just partially converted, run it through marked
  if (!html.trim().startsWith('<') || html.includes('\n#') || html.includes('\n- ')) {
    html = marked.parse(html) as string;
  }

  // 3. Robust Gallery Parsing
  const divRegex = /<div\s+([^>]*data-type="gallery"[^>]*)>\s*<\/div>/g;
  html = html.replace(divRegex, (match, allAttrs) => {
    try {
      const imagesMatch = allAttrs.match(/data-images="([^"]*)"/) || allAttrs.match(/data-images='([^']*)'/);
      if (!imagesMatch) return match;
      
      const imagesJson = imagesMatch[1];
      const escapedJson = imagesJson.replace(/&quot;/g, '"');
      const images: string[] = JSON.parse(escapedJson).filter((src: string) => src && src.trim() !== "");
      const count = images.length;
      
      if (count === 0) return "";

      const gridClass = count === 1 ? 'grid-cols-1' : count === 2 ? 'grid-cols-2' : count >= 3 ? 'grid-cols-3' : '';
      
      const imageHTML = images.map((src: string, i: number) => {
        let spanClass = "";
        let aspectClass = "aspect-square";
        
        if (count === 3 && i === 0) {
          spanClass = "col-span-2 row-span-2";
          aspectClass = "aspect-auto";
        } else if (count === 5 && i < 2) {
          spanClass = "col-span-1";
        }
        
        return `<div class="relative rounded-2xl overflow-hidden bg-neutral-100 ${aspectClass} ${spanClass}">
                  <img src="${src}" class="w-full h-full object-cover transition-transform duration-500 hover:scale-105" referrerPolicy="no-referrer" />
                </div>`;
      }).join('');

      return `<div class="my-6 grid gap-2 clear-both ${gridClass}">${imageHTML}</div>`;
    } catch(e) {
      console.error("Gallery parsing error:", e);
      return match;
    }
  });

  return html;
};

const extractAllImages = (content: string): string[] => {
  if (!content) return [];
  const images: string[] = [];
  
  // Extract from :::gallery blocks
  const galleryRegex = /:::gallery\n([\s\S]*?)\n:::/g;
  let match;
  while ((match = galleryRegex.exec(content)) !== null) {
    const urls = match[1].trim().split('\n').filter(Boolean);
    images.push(...urls);
  }

  // Extract from standard markdown images ![alt](url)
  const mdImageRegex = /!\[.*?\]\((.*?)\)/g;
  while ((match = mdImageRegex.exec(content)) !== null) {
    images.push(match[1]);
  }

  // Extract from HTML img tags
  const htmlImgRegex = /<img.*?src=["'](.*?)["'].*?>/g;
  while ((match = htmlImgRegex.exec(content)) !== null) {
    images.push(match[1]);
  }

  // Extract from gallery divs if content was already partially processed
  const divRegex = /data-images="([^"]*)"/g;
  while ((match = divRegex.exec(content)) !== null) {
    try {
      const urls = JSON.parse(match[1].replace(/&quot;/g, '"'));
      if (Array.isArray(urls)) images.push(...urls);
    } catch(e) {}
  }

  return Array.from(new Set(images.filter(src => src && src.trim() !== "")));
};

export default function PublicFileViewer({ userId, fileId }: { userId: string; fileId: string }) {
  const [file, setFile] = useState<FileItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [allImages, setAllImages] = useState<string[]>([]);

  useEffect(() => {
    const fileRef = dbRef(rtdb, `files/${fileId}`);
    const unsub = onValue(fileRef, (snapshot) => {
      try {
        const data = snapshot.val();
        
        if (data) {
          if (data.ownerId === userId && data.isPublic) {
            setFile({ id: fileId, ...data });
            setAllImages(extractAllImages(data.content || ""));
            setError("");
          } else {
            setError("This page is private or could not be found.");
          }
        } else {
          setError("File not found.");
        }
      } catch (err) {
        console.error("Error fetching public file", err);
        setError("Error loading page.");
      } finally {
        setLoading(false);
      }
    }, (err) => {
      console.error("Realtime DB error:", err);
      setError("Connection error.");
      setLoading(false);
    });
    
    return () => unsub();
  }, [fileId, userId]);

  if (loading) return <div className="h-screen w-screen flex items-center justify-center bg-white"><Loader /></div>;
  
  if (error || !file) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-white text-black">
        <h1 className="text-2xl font-light mb-2">Unavailable</h1>
        <p className="text-neutral-500 font-light">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-white text-black selection:bg-neutral-100">
      <div className="max-w-[1400px] mx-auto px-6 py-12 md:py-20 lg:py-32">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
          
          {/* Main Content Column */}
          <div className="lg:col-span-8">
            {/* Tags (Mirroring Editor) */}
            {file.tags && file.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-10">
                {file.tags.map(tag => (
                  <span 
                    key={tag.id} 
                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 border border-neutral-100 shadow-sm"
                    style={{ backgroundColor: `${tag.color}15`, color: tag.color }}
                  >
                    <div className="w-1 h-1 rounded-full" style={{ backgroundColor: tag.color }}></div>
                    {tag.name}
                  </span>
                ))}
              </div>
            )}

            {/* Name as Title */}
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-light tracking-tight mb-12 leading-[1.1] text-neutral-900">
              {file.name}
            </h1>

            {/* Content */}
            <div className="tiptap prose prose-neutral max-w-none font-light leading-relaxed prose-img:rounded-2xl prose-img:shadow-sm prose-img:border prose-img:border-neutral-100 text-neutral-800"
                 dangerouslySetInnerHTML={{ __html: renderContentHTML(file.content || "") }}
            />
            
            {/* Simple Footer */}
            <div className="mt-32 pt-8 border-t border-neutral-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-neutral-100 border border-neutral-200" />
                <span className="text-xs text-neutral-400 font-medium tracking-tight">Published via AIS Studio</span>
              </div>
            </div>
          </div>

          {/* Sidebar Column (Desktop Only) */}
          <div className="hidden lg:block lg:col-span-4 lg:sticky lg:top-32 h-fit">
            <div className="space-y-8">
              <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Gallery Summary</h3>
                <span className="px-2 py-0.5 rounded-full bg-neutral-50 text-[10px] font-bold text-neutral-500 border border-neutral-100">
                  {allImages.length} {allImages.length === 1 ? 'Item' : 'Items'}
                </span>
              </div>

              {allImages.length > 0 ? (
                <div className="columns-2 gap-3 space-y-3">
                  {allImages.map((src, i) => (
                    <div key={i} className="break-inside-avoid group relative rounded-xl overflow-hidden bg-neutral-50 border border-neutral-100 shadow-sm transition-all hover:shadow-md">
                      <img 
                        src={src} 
                        className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-105" 
                        referrerPolicy="no-referrer"
                        alt={`Gallery item ${i + 1}`}
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors pointer-events-none" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 px-6 rounded-2xl bg-neutral-50 border border-dashed border-neutral-200 flex flex-col items-center justify-center text-center">
                  <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center mb-3">
                     <span className="text-neutral-300">🖼️</span>
                  </div>
                  <p className="text-xs text-neutral-400 font-medium">No images found in this document</p>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
