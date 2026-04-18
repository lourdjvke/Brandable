import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { FileItem } from "@/src/types";
import Loader from "@/src/components/ui/Loader";

const renderContentHTML = (html: string) => {
  if (!html) return "";
  
  // Find all gallery divs and turn them into CSS Grid layouts for pure HTML rendering
  const parsed = html.replace(/<div data-type="gallery" data-images='([^']*)'><\/div>/g, (match, imagesJson) => {
    try {
      const images: string[] = JSON.parse(imagesJson);
      const count = images.length;
      
      const gridClass = count === 1 ? 'grid-cols-1' : count === 2 ? 'grid-cols-2' : count >= 3 ? 'grid-cols-3' : '';
      
      const imageHTML = images.map((src, i) => {
        let spanClass = "";
        if (count === 3 && i === 0) spanClass = "col-span-2 row-span-2";
        else if (count === 5 && i < 2) spanClass = "col-span-1";
        
        return `<div class="relative rounded-2xl overflow-hidden bg-neutral-100 aspect-square ${spanClass}">
                  <img src="${src}" style="width: 100%; height: 100%; object-fit: cover;" />
                </div>`;
      }).join('');

      return `<div class="my-6 grid gap-2 clear-both ${gridClass}">${imageHTML}</div>`;
    } catch(e) {
      return match;
    }
  });

  return parsed;
};

export default function PublicFileViewer({ userId, fileId }: { userId: string; fileId: string }) {
  const [file, setFile] = useState<FileItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchFile() {
      try {
        const docRef = doc(db, "files", fileId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data() as FileItem;
          // Simple validation: Ensure the file belongs to this user and is set to public.
          if (data.ownerId === userId && data.isPublic) {
            setFile(data);
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
    }
    
    fetchFile();
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
    <div className="min-h-screen w-screen bg-white text-black overflow-y-auto hide-scrollbar">
      <div className="max-w-4xl mx-auto w-full p-8 md:p-12 lg:p-24 selection:bg-neutral-200">
        
        {file.headerImage && (
          <div className="w-full h-48 md:h-64 lg:h-80 overflow-hidden rounded-3xl mb-12">
            <img 
              src={file.headerImage} 
              alt="Header" 
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
        )}
        
        <h1 className="text-4xl md:text-5xl font-light tracking-tight mb-12 leading-tight">
          {file.name}
        </h1>

        <div className="tiptap prose prose-neutral max-w-none font-light leading-relaxed prose-img:rounded-2xl prose-img:shadow-sm prose-img:border prose-img:border-neutral-100"
             dangerouslySetInnerHTML={{ __html: renderContentHTML(file.content || "") }}
        />
        
      </div>
    </div>
  );
}
