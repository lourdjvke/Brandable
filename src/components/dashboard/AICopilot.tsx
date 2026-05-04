import { useState, useEffect, useRef, useMemo, useImperativeHandle, forwardRef } from "react";
import { UserProfile, ChatSession, ChatMessage, FileItem, FileType } from "@/src/types";
import { db, rtdb } from "@/src/lib/firebase";
import { collection, query, onSnapshot, addDoc, doc, updateDoc, deleteDoc, getDocs, where } from "firebase/firestore";
import { ref as dbRef, onValue, set, push, update, remove, query as rtdbQuery, orderByChild, equalTo, get as dbGet, child } from "firebase/database";
import { Copy, Send, Mic, Square, Settings, Plus, Image as ImageIcon, X, Loader2, ChevronRight, BrainCircuit, ChevronDown, User, Bot, MessageSquare, History, Volume2, RotateCcw, ExternalLink, ArrowDown, Check, Youtube, Minimize2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/src/lib/utils";
import { GoogleGenAI, LiveServerMessage, Modality, Type, ThinkingLevel } from "@google/genai";
import ReactMarkdown from "react-markdown";

const cleanText = (text: string) => {
  return text.replace(/\*\*/g, '').replace(/#/g, '').trim().substring(0, 40) + (text.length > 40 ? '...' : '');
};

interface MessageLinkMetadata {
  url: string;
  title: string;
  description: string;
  image?: string;
}

async function fetchUrlMetadata(url: string): Promise<MessageLinkMetadata> {
  // First try the server-side API
  try {
    const res = await fetch("/api/link-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });
    const data = await res.json();
    if (data && !data.error && data.title && data.title !== "N/A") {
      return {
        url,
        title: data.title,
        description: data.description || "",
        image: data.image
      };
    }
  } catch (err) {
    console.warn("API link preview failed, falling back to manual scrape");
  }

  // Fallback: Manual scrape using proxies if API fails or returns N/A
  try {
    const PROXIES = [
      (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
      (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
      (u: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`
    ];

    for (const proxyFn of PROXIES) {
      try {
        const proxyUrl = proxyFn(url);
        const response = await fetch(proxyUrl);
        if (!response.ok) continue;
        
        let html = "";
        if (proxyUrl.includes('allorigins')) {
          const json = await response.json();
          html = json.contents;
        } else {
          html = await response.text();
        }

        if (!html || html.length < 100) continue;

        const title = html.match(/<title>([^<]+)<\/title>/)?.[1] || 
                      html.match(/og:title" content="([^"]+)"/)?.[1] || 
                      new URL(url).hostname;
        const description = html.match(/meta name="description" content="([^"]+)"/)?.[1] || 
                            html.match(/og:description" content="([^"]+)"/)?.[1] || "";
        const image = html.match(/og:image" content="([^"]+)"/)?.[1] || 
                      html.match(/twitter:image" content="([^"]+)"/)?.[1];

        return {
          url,
          title: title.trim(),
          description: description.trim(),
          image: image
        };
      } catch (e) { continue; }
    }
  } catch (e) {
    console.error("Manual scrape error", e);
  }

  return { url, title: "Link", description: url };
}

function LinkPreview({ url }: { url: string }) {
  const [metadata, setMetadata] = useState<MessageLinkMetadata | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUrlMetadata(url).then(m => {
      setMetadata(m);
      setLoading(false);
    });
  }, [url]);

  if (loading) return null;
  if (!metadata?.title) return null;

  return (
    <a 
      href={url} 
      target="_blank" 
      rel="noopener noreferrer"
      className="flex flex-col gap-2 p-3 my-2 bg-neutral-50 border border-neutral-200 rounded-lg hover:bg-neutral-100 transition-colors group no-underline max-w-full overflow-hidden"
    >
      <div className="flex gap-3 items-start min-w-0">
        {metadata.image && (
          <img src={metadata.image} alt="" className="w-16 h-16 rounded object-cover shrink-0" referrerPolicy="no-referrer" />
        )}
        <div className="flex flex-col gap-0.5 overflow-hidden min-w-0 flex-1">
          <span className="text-sm font-semibold text-neutral-900 truncate group-hover:text-black block">{metadata.title}</span>
          {metadata.description && <p className="text-xs text-neutral-500 line-clamp-2 leading-relaxed">{metadata.description}</p>}
          <div className="flex items-center gap-1.5 mt-1 overflow-hidden min-w-0">
             <img src={`https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`} alt="" className="w-3 h-3 rounded-sm shrink-0 grayscale opacity-80 group-hover:grayscale-0 group-hover:opacity-100 transition-all" />
             <span className="text-[10px] text-neutral-400 truncate">{new URL(url).hostname}</span>
          </div>
        </div>
      </div>
    </a>
  );
}

function MessageBubble({ 
  msg, 
  viewingImage, 
  setViewingImage, 
  onSpeak, 
  onRetry,
  onAction,
  onOpenSettings,
  isRandomizerActive
}: { 
  msg: ChatMessage; 
  viewingImage: string | null; 
  setViewingImage: (url: string | null) => void;
  onSpeak: (text: string) => void;
  onRetry: () => void;
  onAction?: (action: string, data: any) => void;
  onOpenSettings?: () => void;
  isRandomizerActive: boolean;
}) {
  if (!msg) return null;
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const handleCopy = () => {
    navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const extractLinks = (text: string) => {
    const urlRegex = /((?:https?:\/\/|www\.)[^\s]+\.[a-z]{2,})/gi;
    return text.match(urlRegex) || [];
  };

  const links = useMemo(() => extractLinks(msg.content), [msg.content]);

  // Custom renderer for commands to make them UI appropriate
  const renderContent = (content: string) => {
    // Check for YouTube data payload
    const ytMatch = content.match(/%YOUTUBE_DATA%([\s\S]*?)%END_YOUTUBE%/);
    let displayContent = content;
    let ytVideos: any[] = [];

    if (ytMatch) {
      try {
        ytVideos = JSON.parse(ytMatch[1]);
        displayContent = content.replace(/%YOUTUBE_DATA%[\s\S]*?%END_YOUTUBE%/, "");
      } catch (e) {
        console.error("YouTube Data Parse Error", e);
      }
    }

    // Check for Transcription payload
    const transMatch = displayContent.match(/%TRANSCRIPTION%([\s\S]*?)%END_TRANSCRIPTION%/);
    let transcriptionText = "";
    if (transMatch) {
      transcriptionText = transMatch[1].trim();
      displayContent = displayContent.replace(/%TRANSCRIPTION%[\s\S]*?%END_TRANSCRIPTION%/, "\n\n*(Transcription moved to dedicated area below)*\n\n");
    }

    // Replace timestamps with clickable markdown links
    // Handles both %TIMESTAMP% format and generic [00:15] or 00:15 formats
    displayContent = displayContent.replace(/%TIMESTAMP%(\[?\d{1,2}:\d{2}\]?)%END_TIMESTAMP%/gi, (match, time) => {
       const cleanTime = time.replace(/[\[\]]/g, '');
       return `[▶️ ${cleanTime}](timestamp:${cleanTime})`;
    });

    // Catch raw [MM:SS] or MM:SS patterns and turn into timestamps if they aren't already part of a link
    // This is a bit more aggressive to ensure user request is met
    displayContent = displayContent.replace(/(^|\s)\[?(\d{1,2}:\d{2})\]?(?!\))/g, (match, space, time) => {
       return `${space}[▶️ ${time}](timestamp:${time})`;
    });

    return (
      <>
        <ReactMarkdown 
          components={{ 
            p: ({ children }) => {
              // Check if children is a single string that looks like a command
              const firstChild = children;
              if (typeof firstChild === 'string') {
                const trimmed = firstChild.trim();
                const isCommand = trimmed.toLowerCase().startsWith('command:') || 
                                  trimmed.startsWith('create_file') || 
                                  trimmed.startsWith('create_folder') || 
                                  trimmed.startsWith('update_file') || 
                                  trimmed.startsWith('delete_item') ||
                                  trimmed.startsWith('read_file') ||
                                  trimmed.startsWith('move_item') ||
                                  trimmed.startsWith('rename_item') ||
                                  trimmed.startsWith('open_item');
                
                if (isCommand) {
                  return (
                    <div className="my-2 bg-neutral-50 border border-neutral-200 rounded-md overflow-hidden text-left not-prose">
                      <div 
                        className="flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-neutral-100 transition-colors"
                        onClick={(e) => {
                          e.preventDefault();
                          setIsExpanded(!isExpanded);
                        }}
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                          <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">CMD</span>
                          <span className={cn("text-xs font-mono text-neutral-600 truncate transition-all", !isExpanded && "max-w-[200px]")}>
                            {trimmed.replace(/^command:\s*/, '')}
                          </span>
                        </div>
                        <ChevronDown className={cn("w-4 h-4 text-neutral-400 transition-transform", isExpanded && "rotate-180")} />
                      </div>
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="px-3 pb-3 pt-1 border-t border-neutral-100">
                              <pre className="text-[11px] font-mono text-neutral-800 whitespace-pre-wrap break-all leading-relaxed">
                                {trimmed}
                              </pre>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                }
              }
              return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>;
            },
            a: ({ href, children }) => {
              const isInternalTimestamp = href?.includes('timestamp:');
              const isYoutubeTimestamp = href?.match(/(?:youtube\.com|youtu\.be).*?[?&]t=(\d+)/);
              
              if (isInternalTimestamp || isYoutubeTimestamp) {
                let time = '00:00';
                if (isInternalTimestamp) {
                  const timeMatch = href.match(/timestamp:([\d:]+)/);
                  time = timeMatch ? timeMatch[1] : '00:00';
                } else if (isYoutubeTimestamp) {
                  const totalSec = parseInt(isYoutubeTimestamp[1]);
                  const mins = Math.floor(totalSec / 60);
                  const secs = totalSec % 60;
                  time = `${mins}:${secs.toString().padStart(2, '0')}`;
                }

                return (
                  <button 
                    type="button"
                    className="inline-flex items-center gap-1.5 mx-0.5 px-2 py-1 bg-primary/10 text-primary rounded-md text-[11px] font-bold hover:bg-primary hover:text-white transition-all active:scale-95 border border-primary/20"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onAction?.('play_timestamp', time);
                    }}
                  >
                    <Youtube className="w-3.5 h-3.5" />
                    {children || time}
                  </button>
                );
              }
              return <a href={href} className="text-primary hover:underline font-medium" target="_blank" rel="noopener noreferrer">{children}</a>
            }
          }}
        >
          {displayContent}
        </ReactMarkdown>

        {transcriptionText && (
          <div className="mt-4 p-5 bg-neutral-900 text-neutral-300 rounded-2xl border border-neutral-800 shadow-inner group-hover:shadow-lg transition-all">
             <div className="flex items-center justify-between mb-4 border-b border-neutral-800 pb-3">
                <div className="flex items-center gap-2">
                   <div className="p-1.5 bg-red-600/10 rounded-lg">
                      <Youtube className="w-4 h-4 text-red-500" />
                   </div>
                   <span className="text-xs font-bold uppercase tracking-[0.2em] text-white">Full Transcription</span>
                </div>
                <button 
                  onClick={() => {
                    const blob = new Blob([transcriptionText], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = "transcription.txt";
                    a.click();
                  }}
                  className="text-[10px] font-bold uppercase text-neutral-500 hover:text-white transition-colors flex items-center gap-2"
                >
                  <Copy className="w-3 h-3" /> Save txt
                </button>
             </div>
             <div className="text-xs font-mono leading-relaxed whitespace-pre-wrap max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {transcriptionText}
             </div>
          </div>
        )}

        {ytVideos.length > 0 && (
          <div className="mt-4 -mx-1">
             <div className="flex gap-3 overflow-x-auto pb-4 px-1 custom-scrollbar snap-x snap-mandatory">
                {ytVideos.map((video: any) => (
                  <motion.div 
                    key={video.id}
                    whileHover={{ y: -4 }}
                    onClick={() => onAction?.('watch_video', video)}
                    className="w-48 shrink-0 bg-white border border-neutral-100 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer snap-start"
                  >
                    <div className="aspect-video relative bg-neutral-100">
                      <img src={video.thumbnail} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-black/5 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                        <motion.div initial={{ scale: 0.5 }} whileHover={{ scale: 1 }} className="bg-white/90 p-2 rounded-full backdrop-blur-sm">
                           <Youtube className="w-5 h-5 text-red-600" />
                        </motion.div>
                      </div>
                      <div className="absolute bottom-1 right-1 bg-black/60 backdrop-blur-md px-1 py-0.5 rounded text-[8px] font-bold text-white uppercase">
                        {video.views ? (video.views >= 1000 ? (video.views/1000).toFixed(1) + 'K' : video.views) : 0} views
                      </div>
                    </div>
                    <div className="p-2 space-y-0.5">
                      <h4 className="text-[10px] font-bold text-neutral-900 line-clamp-2 leading-tight">{video.title}</h4>
                      <div className="flex items-center gap-1.5 opacity-50">
                        <span className="text-[8px] font-bold uppercase tracking-wider">{new Date(video.pubDate).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
             </div>
          </div>
        )}

        {content.includes('%MODELS_FAILED_ACTION%') && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button 
              onClick={() => onOpenSettings?.()}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-neutral-200 text-neutral-900 rounded-lg text-xs font-bold hover:bg-neutral-50 transition-all active:scale-95 font-sans"
            >
              <Settings className="w-3.5 h-3.5" />
              Open Options
            </button>
            {!isRandomizerActive && (
              <button 
                onClick={() => onAction?.('activate_randomizer', null)}
                className="flex items-center gap-2 px-3 py-1.5 bg-neutral-900 text-white rounded-lg text-xs font-bold hover:bg-black transition-all active:scale-95 font-sans"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Activate Randomizer
              </button>
            )}
          </div>
        )}
      </>
    );
  };

  return (
    <div className={cn(
      "flex flex-col group", 
      msg.role === "user" ? "max-w-[85%] self-end items-end" : "w-full max-w-full self-start items-start"
    )}>
      {msg.role === "assistant" && (
        <div className="flex items-center gap-2 mb-1.5 px-0.5">
          <div className="w-5 h-5 rounded-full bg-black flex items-center justify-center">
            <Bot className="w-3 h-3 text-white" />
          </div>
          <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">AI Copilot</span>
        </div>
      )}

      <div className={cn(
        "rounded-md text-sm leading-relaxed",
        msg.role === "user" ? "bg-black text-white px-3 py-2 rounded-tr-none" : 
        msg.role === "system" ? "bg-red-50 text-red-600 px-3 py-3 w-full border border-red-100/50 shadow-sm" : 
        "bg-transparent text-black w-full"
      )}>
        {msg.imageUrls && msg.imageUrls.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {msg.imageUrls.map((url, i) => (
              <img 
                key={i} 
                src={url} 
                alt="Attached" 
                className="w-20 h-20 object-cover rounded-lg cursor-pointer" 
                onClick={() => setViewingImage(url)}
              />
            ))}
          </div>
        )}
        <div className={cn(
          "prose prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-neutral-800 prose-pre:text-white",
          msg.role === "assistant" && "text-neutral-800",
          msg.isSilent && "opacity-70 italic"
        )}>
          {msg.isSilent && (
            <div className="flex items-center gap-1.5 mb-1 text-[10px] uppercase tracking-wider font-bold text-neutral-400 not-italic">
              <Mic className="w-3 h-3" />
              Voice Action
            </div>
          )}
          {(msg.role === 'assistant' || msg.role === 'system') ? renderContent(msg.content) : (
            <ReactMarkdown>{msg.content}</ReactMarkdown>
          )}
        </div>

        {msg.role === "user" && (msg.linkMetadata && msg.linkMetadata.length > 0 ? (
          <div className="mt-2 flex flex-col gap-1 max-w-[70vw] w-64 overflow-hidden self-end">
            {msg.linkMetadata.map((meta, idx) => (
              <div 
                key={idx}
                className="flex flex-col gap-2 p-3 my-2 bg-neutral-50 border border-neutral-200 rounded-lg hover:bg-neutral-100 transition-colors group no-underline max-w-full overflow-hidden"
              >
                <div className="flex gap-3 items-start min-w-0">
                  {meta.image && (
                    <img src={meta.image} alt="" className="w-16 h-16 rounded object-cover shrink-0" referrerPolicy="no-referrer" />
                  )}
                  <div className="flex flex-col gap-0.5 overflow-hidden min-w-0 flex-1">
                    <span className="text-sm font-semibold text-neutral-900 truncate group-hover:text-black block">{meta.title}</span>
                    {meta.description && <p className="text-xs text-neutral-500 line-clamp-2 leading-relaxed">{meta.description}</p>}
                    <div className="flex items-center gap-1.5 mt-1 overflow-hidden min-w-0">
                       <span className="text-[10px] text-neutral-400 truncate">{new URL(meta.url).hostname}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : links.length > 0 && (
          <div className="mt-2 flex flex-col gap-1 max-w-[70vw] w-64 overflow-hidden self-end">
            {links.map((link, idx) => <LinkPreview key={idx} url={link} />)}
          </div>
        ))}

        {msg.role === "assistant" && (
          <div className="mt-4 flex flex-col gap-3">
             {/* Sources */}
             {links.length > 0 && (
               <div className="flex flex-wrap gap-2 pt-2 border-t border-neutral-100">
                  <span className="text-[10px] font-bold text-neutral-300 mr-1 uppercase">Sources</span>
                  {links.map((link, idx) => (
                    <a 
                      key={idx}
                      href={link} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-2 py-1 bg-neutral-50 hover:bg-neutral-100 border border-neutral-100 rounded-full text-[10px] text-neutral-500 transition-colors group/link"
                    >
                      <img 
                        src={`https://www.google.com/s2/favicons?domain=${new URL(link).hostname}&sz=32`} 
                        alt="" 
                        className="w-3 h-3 rounded-sm grayscale group-hover/link:grayscale-0 transition-all" 
                      />
                      <span className="truncate max-w-[100px]">{new URL(link).hostname}</span>
                    </a>
                  ))}
               </div>
             )}

             {/* Actions */}
             <div className="flex items-center gap-3 opacity-100 mt-2 transition-opacity">
               <button 
                  onClick={() => onSpeak(msg.content)}
                  className="p-1.5 text-neutral-400 hover:text-black hover:bg-neutral-100 rounded-md transition-all active:scale-95"
                  title="Speak"
               >
                 <Volume2 className="w-3.5 h-3.5" />
               </button>
               <button 
                  onClick={handleCopy}
                  className="p-1.5 text-neutral-400 hover:text-black hover:bg-neutral-100 rounded-md transition-all active:scale-95"
                  title="Copy"
               >
                 {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
               </button>
               <button 
                  onClick={onRetry}
                  className="p-1.5 text-neutral-400 hover:text-black hover:bg-neutral-100 rounded-md transition-all active:scale-95"
                  title="Retry"
               >
                 <RotateCcw className="w-3.5 h-3.5" />
               </button>
             </div>
          </div>
        )}
      </div>
      <span className="text-[10px] text-neutral-400 mt-1 px-1 font-medium">
        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  );
}

interface AICopilotProps {
  profile: UserProfile;
  currentPath: string[];
  currentFolderId: string | null;
  files: FileItem[];
  onNavigate: (id: string | null) => void;
  onOpenSettings: () => void;
  sessionId: string | null;
  apiKey: string | null;
  onOpenFile: (file: FileItem) => void;
  onCreateFile: (name: string, folderId: string | null, content: string, type: FileType, headerImage?: string) => Promise<string | null>;
  onUpdateFile: (id: string, updates: Partial<FileItem>) => Promise<void>;
  onDeleteFile: (id: string) => Promise<void>;
  onCreateFolder: (name: string, parentId: string | null) => Promise<string | null>;
  onSessionChange?: (id: string) => void;
}

export default forwardRef<any, AICopilotProps>(function AICopilot({ 
  profile, 
  currentPath, 
  currentFolderId, 
  files,
  onNavigate, 
  onOpenSettings, 
  sessionId: propSessionId,
  apiKey: propApiKey,
  onOpenFile,
  onCreateFile, 
  onUpdateFile,
  onDeleteFile,
  onCreateFolder,
  onSessionChange 
}: AICopilotProps, ref) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(propSessionId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLive, setIsLive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isExecutingCommand, setIsExecutingCommand] = useState(false);
  const [toolExecutionStatus, setToolExecutionStatus] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [dynamicSuggestions, setDynamicSuggestions] = useState<string[]>([]);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);
  const [lastLiveResponse, setLastLiveResponse] = useState<string>("");
  const [liveUserTranscript, setLiveUserTranscript] = useState<string>("");

  useEffect(() => {
    if (isLive && (liveUserTranscript || lastLiveResponse)) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [isLive, liveUserTranscript, lastLiveResponse]);

  useEffect(() => {
    // Only fetch if no messages and we have an API key
    if (messages.length === 0 && propApiKey) {
      const fetchSuggestions = async () => {
        setIsSuggestionsLoading(true);
        try {
          const ai = new GoogleGenAI({ apiKey: propApiKey });
          const response = await ai.models.generateContent({
             model: "gemini-3-flash-preview",
             contents: [{ role: "user", parts: [{ text: `Based on the following workspace context, provide exactly 3 short, creative, and specific prompt suggestions for the user. 
             Suggestions should be max 6-8 words.
             Current folder path: /${currentPath.join("/")}
             Workspace files: ${JSON.stringify(files.slice(0, 15).map(f => ({ name: f.name, type: f.type })))}
             
             Return ONLY a JSON array of 3 strings. No markdown, no prose.`}] }],
             config: {
               responseMimeType: "application/json"
             }
          });
          
          const text = response.text || "[]";
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setDynamicSuggestions(parsed.slice(0, 3));
          } else {
            throw new Error("Invalid suggestions format");
          }
        } catch (err) {
          console.error("Suggestions error:", err);
          setDynamicSuggestions([
            "Outline a viral video script",
            "Generate captions for brand",
            "Organize current folder"
          ]);
        } finally {
          setIsSuggestionsLoading(false);
        }
      };
      fetchSuggestions();
    }
  }, [messages.length, files.length, currentPath, propApiKey]);

  useEffect(() => {
    if (propSessionId !== undefined && propSessionId !== currentSessionId) {
      setCurrentSessionId(propSessionId);
    }
  }, [propSessionId]);

  const deleteSession = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this chat session?")) return;
    try {
      await remove(dbRef(rtdb, `chatSessions/${id}`));
      if (currentSessionId === id) {
        setCurrentSessionId(null);
      }
    } catch (err) {
      console.error("Error deleting session:", err);
    }
  };

  const [attachedImages, setAttachedImages] = useState<{ url: string; file: File }[]>([]);
  const [isWatchingVideo, setIsWatchingVideo] = useState(false);
  const [activeVideoPlayer, setActiveVideoPlayer] = useState<{ videoId: string, timeSeconds: number, isMinimized?: boolean } | null>(null);
  const [linkPreview, setLinkPreview] = useState<any>(null);
  const [viewingImage, setViewingImage] = useState<string | null>(null);

  const [debouncedInput, setDebouncedInput] = useState(input);
  const [isRandomizerActive, setIsRandomizerActive] = useState(() => localStorage.getItem("gemini_random_model") === "true");

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedInput(input);
    }, 500);
    return () => clearTimeout(handler);
  }, [input]);

  useEffect(() => {
    // Stricter regex for clear link patterns (http/https or www)
    const urlRegex = /((?:https?:\/\/|www\.)[^\s]+\.[a-z]{2,})/gi;
    const match = debouncedInput.match(urlRegex);
    let urlToFetch = match ? match[0] : null;
    
    // Normalize www-only links for fetching
    if (urlToFetch && urlToFetch.toLowerCase().startsWith("www.")) {
      urlToFetch = "https://" + urlToFetch;
    }

    if (urlToFetch) {
        if (!linkPreview || linkPreview.url !== urlToFetch) {
            fetchUrlMetadata(urlToFetch).then(data => {
                if (data && data.title && data.title !== "Link") {
                    setLinkPreview(data);
                } else {
                    setLinkPreview(null);
                }
            }).catch(() => setLinkPreview(null));
        }
    } else {
        setLinkPreview(null);
    }
  }, [debouncedInput]);
  const [selectedModel, setSelectedModel] = useState<string>("gemini-3-flash-preview");
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const processedCommands = useRef<Set<string>>(new Set());
  const currentAiTextRef = useRef<string>("");
  const currentUserTextRef = useRef<string>("");

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const isAtBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 100;
    setShowScrollBottom(!isAtBottom);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSpeak = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  useEffect(() => {
    const processCommands = async () => {
      if (!currentSessionId) return;

      let lastDoneIndex = -1;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].content?.includes("execute=done") || messages[i].content?.includes("execution=done")) {
          lastDoneIndex = i;
          break;
        }
      }

      for (let i = lastDoneIndex + 1; i < messages.length; i++) {
        const msg = messages[i];
        if (!msg) continue;
        
        const commandLines = msg.content?.split('\n').filter(line => {
          const t = line.trim().toLowerCase();
          return t.startsWith("command:") || 
                 t.startsWith("create_file") || 
                 t.startsWith("create_folder") || 
                 t.startsWith("update_file") || 
                 t.startsWith("delete_item") ||
                 t.startsWith("read_file") ||
                 t.startsWith("read_item") ||
                 t.startsWith("move_item") ||
                 t.startsWith("move_file") ||
                 t.startsWith("rename_item") ||
                 t.startsWith("rename_file") ||
                 t.startsWith("open_item") ||
                 t.startsWith("open_file") ||
                 t.startsWith("open_folder") ||
                 t.startsWith("close_file") ||
                 t.startsWith("go_to_root") ||
                 t.startsWith("navigate_up") ||
                 t.startsWith("duplicate_item");
        }) || [];
        
        if (msg.role === 'assistant' && 
            commandLines.length > 0 && 
            !processedCommands.current.has(msg.id)) {
          
          processedCommands.current.add(msg.id);
          setToolExecutionStatus("Executing text commands...");
          
          try {
            for (let commandLine of commandLines) {
              let content = commandLine.trim();

              const cmdLineParser = (line: string, argName: string) => {
                const regex = new RegExp(`(?:--|-)?${argName}\\s*[:=]\\s*(?:"([^"]*)"|([^\\s]+))`, "i");
                const match = line.match(regex);
                if (match) return (match[1] !== undefined ? match[1] : match[2]) || "";
                if (argName === 'id') {
                  const fallbackMatch = line.match(/\s-([a-zA-Z0-9_-]{15,})/);
                  if (fallbackMatch) return fallbackMatch[1];
                }
                return null;
              };

              if (content.includes("create_file")) {
                const fileName = cmdLineParser(content, "name") || "Untitled";
                const folderNameOrId = cmdLineParser(content, "folder") || cmdLineParser(content, "folderId");
                const headerImage = cmdLineParser(content, "headerImage");
                let fileContent = cmdLineParser(content, "content") || "";
                fileContent = fileContent.replace(/\\n/g, '\n'); 
                
                let fileType: FileType = "script";
                if (fileName.endsWith(".txt")) fileType = "brainstorm";
                else if (fileName.includes("caption") || fileName.endsWith(".sm")) fileType = "caption";
                else if (fileName.includes("thread") || fileName.endsWith(".tw")) fileType = "thread";
                else if (fileName.includes("brainstorm")) fileType = "brainstorm";

                let folderId = currentFolderId;
                if (folderNameOrId && folderNameOrId !== "null" && folderNameOrId !== "undefined" && folderNameOrId !== "root") {
                  const existingFolder = files.find(f => f.type === 'folder' && (f.id === folderNameOrId || f.name.toLowerCase() === folderNameOrId.toLowerCase()));
                  if (existingFolder) folderId = existingFolder.id;
                  else folderId = folderNameOrId;
                } else if (folderNameOrId === "root" || folderNameOrId === "null") {
                  folderId = null;
                }

                await onCreateFile(fileName, folderId, fileContent, fileType);
                if (headerImage) {
                   const matchingFiles = files.filter(f => f.name === fileName && f.parentId === folderId);
                   if (matchingFiles.length > 0) {
                     await onUpdateFile(matchingFiles[0].id, { headerImage });
                   }
                }
              } else if (content.includes("create_folder")) {
                const folderName = cmdLineParser(content, "name") || "Untitled Folder";
                const parentNameOrId = cmdLineParser(content, "parent") || cmdLineParser(content, "parentId");
                
                let parentId = currentFolderId;
                if (parentNameOrId && parentNameOrId !== "null" && parentNameOrId !== "undefined" && parentNameOrId !== "root") {
                  const existingParent = files.find(f => f.type === 'folder' && (f.id === parentNameOrId || f.name.toLowerCase() === parentNameOrId.toLowerCase()));
                  if (existingParent) parentId = existingParent.id;
                  else parentId = parentNameOrId;
                } else if (parentNameOrId === "root" || parentNameOrId === "null") {
                  parentId = null;
                }

                await onCreateFolder(folderName, parentId);
              } else if (content.includes("update_file")) {
                const id = cmdLineParser(content, "id");
                let fileContent = cmdLineParser(content, "content");
                if (fileContent !== null) {
                  fileContent = fileContent.replace(/\\n/g, '\n');
                  if (id) await onUpdateFile(id, { content: fileContent });
                }
              } else if (content.includes("delete_item")) {
                const id = cmdLineParser(content, "id");
                const confirmed = cmdLineParser(content, "confirmed");
                if (id && (confirmed === "true" || confirmed === "1" || confirmed === "yes")) {
                  await onDeleteFile(id);
                }
              } else if (content.includes("move_item") || content.includes("move_file")) {
                const id = cmdLineParser(content, "id");
                const parentNameOrId = cmdLineParser(content, "parent") || cmdLineParser(content, "folderId") || cmdLineParser(content, "folder");
                if (id) {
                    let parentId = currentFolderId;
                    if (parentNameOrId && parentNameOrId !== "null" && parentNameOrId !== "undefined" && parentNameOrId !== "root") {
                      const existingParent = files.find(f => f.type === 'folder' && (f.id === parentNameOrId || f.name.toLowerCase() === parentNameOrId.toLowerCase()));
                      if (existingParent) parentId = existingParent.id;
                      else parentId = parentNameOrId;
                    } else if (parentNameOrId === "root" || parentNameOrId === "null") {
                      parentId = null;
                    }
                    await onUpdateFile(id, { parentId });
                }
              } else if (content.includes("rename_item") || content.includes("rename_file")) {
                const id = cmdLineParser(content, "id");
                const name = cmdLineParser(content, "name") || cmdLineParser(content, "title");
                if (id && name) {
                    await onUpdateFile(id, { name });
                }
              } else if (content.includes("open_item") || content.includes("open_file") || content.includes("open_folder")) {
                const id = cmdLineParser(content, "id") || content.match(/\s-([a-zA-Z0-9_-]{15,})/)?.[1];
                if (id) {
                    const file = files.find(f => f.id === id);
                    if (file) {
                        if (file.type === "folder") onNavigate(file.id);
                        else onOpenFile(file);
                    }
                }
              } else if (content.includes("duplicate_item")) {
                const id = cmdLineParser(content, "id");
                if (id) {
                  const original = files.find(f => f.id === id);
                  if (original) await onCreateFile(`${original.name} (Copy)`, original.parentId, original.content, original.type);
                }
              } else if (content.includes("close_file")) {
                onOpenFile(null as any);
              } else if (content.includes("go_to_root")) {
                onNavigate(null);
              } else if (content.includes("navigate_up")) {
                if (currentFolderId) {
                  const cf = files.find(f => f.id === currentFolderId);
                  onNavigate(cf?.parentId || null);
                }
              } else if (content.includes("read_file") || content.includes("read_item")) {
                const id = cmdLineParser(content, "id");
                if (id) {
                  const file = files.find(f => f.id === id);
                  if (file) {
                    console.log("Reading file content for text AI command...");
                  }
                }
              } else if (content.includes("read_url")) {
                const url = cmdLineParser(content, "url");
                if (url) {
                  try {
                    const response = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
                    const data = await response.json();
                    await saveMessage(currentSessionId, {
                      role: "system",
                      content: `URL content for ${url}: ${data.contents.substring(0, 1000)}...`,
                      createdAt: Date.now()
                    });
                  } catch (e: any) {
                    await saveMessage(currentSessionId, {
                      role: "system",
                      content: `Execution failed: Could not read URL ${url}`,
                      createdAt: Date.now()
                    });
                  }
                }
              }
            }

            // Provide visual feedback / system marker that the commands ran
            await saveMessage(currentSessionId, {
              role: "system",
              content: `Text commands executed successfully. execute=done`,
              createdAt: Date.now()
            });
          } catch (e: any) {
            console.error("Failed to parse/execute auto-detection AI commands:", e);
            await saveMessage(currentSessionId, {
              role: "system",
              content: `Execution failed: ${e.message || String(e)}`,
              createdAt: Date.now()
            });
          } finally {
            setToolExecutionStatus(null);
          }
        }
      }
    };
    processCommands();
  }, [messages, onCreateFile, onUpdateFile, onDeleteFile, onCreateFolder, currentFolderId, currentSessionId, files]);

  const TEXT_MODELS = [
    { id: "gemini-3-flash-preview", name: "Gemini 3 Flash", desc: "Latest & Fast" },
    { id: "gemini-2.5-flash-preview", name: "Gemini 2.5 Flash", desc: "Balanced & Smart" },
    { id: "gemini-2.5-flash-lite-preview", name: "Gemini 2.5 Flash Lite", desc: "Efficiency Focus" },
    { id: "gemini-3.1-flash-lite-preview", name: "Gemini 3.1 Flash Lite", desc: "Next-gen Lightweight" },
  ];

  useImperativeHandle(ref, () => ({
    startLiveSession,
    stopLiveSession,
    get isLive() { return isLive; }
  }));

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Live API Refs
  const aiRef = useRef<any>(null);
  const liveSessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const currentAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  const getApiKey = () => {
    if (propApiKey && propApiKey.trim().length > 0) return propApiKey;
    return process.env.GEMINI_API_KEY;
  };

  const genAI = useMemo(() => {
    const key = getApiKey();
    if (!key) return null;
    try {
      return new GoogleGenAI({ apiKey: key });
    } catch (e) {
      console.error("GenAI Init Error:", e);
      return null;
    }
  }, [propApiKey, sessions]);

  const liveAI = useMemo(() => {
    const key = getApiKey();
    if (!key) return null;
    try {
      return new GoogleGenAI({ apiKey: key });
    } catch (e) {
      console.error("LiveAI Init Error:", e);
      return null;
    }
  }, [propApiKey, sessions]);

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  useEffect(() => {
    if (!profile.uid) return;

    // Realtime Database listener for sessions
    const sessionsRef = rtdbQuery(dbRef(rtdb, "chatSessions"), orderByChild("ownerId"), equalTo(profile.uid));
    const unsubscribe = onValue(sessionsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const sessionList = Object.entries(data).map(([id, s]: [string, any]) => ({
          ...s,
          id,
          messages: s.messages ? (Array.isArray(s.messages) ? s.messages : Object.values(s.messages)) : []
        }));
        sessionList.sort((a, b) => b.updatedAt - a.updatedAt);
        setSessions(sessionList as ChatSession[]);
        
        if (!currentSessionIdRef.current && sessionList.length > 0 && !propSessionId) {
          setCurrentSessionId(sessionList[0].id);
        }
      } else {
        setSessions([]);
      }
    });

    return () => unsubscribe();
  }, [profile.uid, propSessionId]);

  useEffect(() => {
    if (onSessionChange && currentSessionId) {
      onSessionChange(currentSessionId);
    }
  }, [currentSessionId, onSessionChange]);

  useEffect(() => {
    if (!currentSessionId) {
      setMessages([]);
      return;
    }
    const session = sessions.find(s => s.id === currentSessionId);
    if (session) {
      setMessages(session.messages || []);
    }
  }, [currentSessionId, sessions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const createNewSession = async () => {
    const newSession: Omit<ChatSession, "id"> = {
      ownerId: profile.uid,
      title: "New Chat",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: []
    };
    const newRef = push(dbRef(rtdb, "chatSessions"));
    await set(newRef, newSession);
    setCurrentSessionId(newRef.key);
    setShowSessions(false);
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

  const saveMessage = async (sessionId: string, message: Omit<ChatMessage, "id">) => {
    const newMessage = { 
      ...message, 
      id: Date.now().toString() 
    };
    
    try {
      // Fetch latest messages from DB to avoid staleness
      const snapshot = await dbGet(child(dbRef(rtdb), `chatSessions/${sessionId}`));
      const sessionData = snapshot.val();
      const existingMessages = sessionData?.messages 
        ? (Array.isArray(sessionData.messages) ? sessionData.messages : Object.values(sessionData.messages)) 
        : [];
      
      const updatedMessages = cleanObject([...existingMessages, newMessage]);

      await update(dbRef(rtdb, `chatSessions/${sessionId}`), {
        messages: updatedMessages,
        updatedAt: Date.now()
      });
      return updatedMessages;
    } catch (err) {
      console.error("Error saving message to Realtime Database:", err);
      // Fallback to local optimistic update if DB fails
      const session = sessions.find(s => s.id === sessionId);
      const existingMessages = session?.messages || [];
      return [...existingMessages, newMessage];
    }
  };

  const generateTitle = async (sessionId: string, firstMessage: string) => {
    try {
      if (!genAI) return;
      const response = await genAI.models.generateContent({
        model: "gemini-flash-latest",
        contents: `Generate a short, concise title (max 4 words) for a chat that starts with: "${firstMessage}". Return only the title text.`
      });
      const title = response.text?.replace(/["']/g, "").trim() || "New Chat";
      await update(dbRef(rtdb, `chatSessions/${sessionId}`), { title });
    } catch (err) {
      console.error("Failed to generate title in RTDB:", err);
    }
  };

  const fetchYouTubeData = async () => {
    try {
      const snap = await dbGet(child(dbRef(rtdb), `youtube_channels/${profile.uid}`));
      if (snap.exists()) {
        const data = snap.val();
        if (!data.name) {
          return { error: "YouTube connection is currently experiencing high traffic. Please try again in a bit." };
        }
        const vids = data.videos ? Object.values(data.videos) : [];
        vids.sort((a: any, b: any = {}) => new Date(b.pubDate || 0).getTime() - new Date(a.pubDate || 0).getTime());
        return {
          channelName: data.name,
          subscriberCount: data.subCount,
          description: data.desc,
          category: data.tag,
          videos: vids
        };
      }
      return { error: "YouTube connection is currently experiencing high traffic. Please try again in a bit." };
    } catch (err) {
      console.error("Error fetching YouTube data:", err);
      return { error: "YouTube connection is currently experiencing high traffic. Please try again in a bit." };
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + attachedImages.length > 4) {
      alert("You can attach up to 4 images.");
      return;
    }
    
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachedImages(prev => [...prev, { url: reader.result as string, file }]);
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeImage = (index: number) => {
    setAttachedImages(prev => prev.filter((_, i) => i !== index));
  };

  const stopCurrentAudio = () => {
    if (currentAudioSourceRef.current) {
      currentAudioSourceRef.current.stop();
      currentAudioSourceRef.current = null;
    }
    audioQueueRef.current = [];
    isPlayingRef.current = false;
  };

  const createItem = async (type: FileType, name: string, parentId: string | null, content?: string) => {
    const newFile: Omit<FileItem, "id"> = {
      name,
      type,
      parentId, 
      ownerId: profile.uid,
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      content: content || ""
    };
    const newRef = push(dbRef(rtdb, "files"));
    await set(newRef, newFile);
    return newRef.key!;
  };

  const handleSend = async (retryContent?: string) => {
    const sendContent = retryContent || input;
    if (!sendContent.trim() && attachedImages.length === 0) return;
    
    if (!genAI) {
      alert("Please set your Gemini API Key in Settings.");
      onOpenSettings();
      return;
    }

    let sessionId = currentSessionId;
    if (!sessionId) {
      const newSession: Omit<ChatSession, "id"> = {
        ownerId: profile.uid,
        title: "New Chat",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: []
      };
      const newRef = push(dbRef(rtdb, "chatSessions"));
      await set(newRef, newSession);
      sessionId = newRef.key!;
      setCurrentSessionId(sessionId);
    }

    const userMsgContent = sendContent;
    const imageUrls = attachedImages.map(img => img.url);
    
    const userMessage: Omit<ChatMessage, "id"> = {
      role: "user",
      content: userMsgContent,
      createdAt: Date.now()
    };
    if (imageUrls.length > 0) {
      userMessage.imageUrls = imageUrls;
    }

    // Optimistic UI update - now including link metadata if available during typing
    const optimisticMessage: ChatMessage = { 
        ...userMessage, 
        id: "temp-" + Date.now(),
        linkMetadata: linkPreview ? [linkPreview as MessageLinkMetadata] : undefined 
    };
    setMessages(prev => [...prev, optimisticMessage]);
    setInput("");
    setAttachedImages([]);
    setLinkPreview(null);
    setIsGenerating(true);

    // Fetch link metadata proactively if links are present (and not already available from typing)
    const urlRegex = /((?:https?:\/\/|www\.)[^\s]+\.[a-z]{2,})/gi;
    const urlsInMessage = userMsgContent.match(urlRegex) || [];
    
    let finalMetadata: MessageLinkMetadata[] = [];
    if (linkPreview) {
        finalMetadata = [linkPreview as MessageLinkMetadata];
    } else if (urlsInMessage.length > 0) {
        finalMetadata = await Promise.all(urlsInMessage.map(u => fetchUrlMetadata(u)));
    }

    let linkMetadataSummary = "";
    if (finalMetadata.length > 0) {
      linkMetadataSummary = finalMetadata.map(m => 
        `[URL Context: ${m.url} | Title: ${m.title} | Description: ${m.description}]`
      ).join("\n");
    }
    
    // Update message content with metadata for the AI call
    const messageWithMeta: Omit<ChatMessage, "id"> = { 
        ...userMessage, 
        content: userMsgContent + (linkMetadataSummary ? `\n\n${linkMetadataSummary}` : ""),
        linkMetadata: finalMetadata.length > 0 ? finalMetadata : undefined
    };

    const currentMessages = await saveMessage(sessionId, messageWithMeta);
    setMessages(currentMessages);
    
    // Get fresh session data to check title
    const sessionSnap = await dbGet(child(dbRef(rtdb), `chatSessions/${sessionId}`));
    const session = sessionSnap.val();
    if (session && (session.title === "New Chat" || !session.title)) {
      generateTitle(sessionId, userMsgContent);
    }

    try {
      const useRandomModel = isRandomizerActive;
      const availableModels = TEXT_MODELS.map(m => m.id);
      
      let lastError = null;
      let finalResponse = null;
      
      // Track untried models to avoid repeating in random mode
      let untriedModels = useRandomModel ? [...availableModels] : [selectedModel];

      // Prepare final content for AI including metadata summary if any
      const lastUserMsgContent = linkMetadataSummary 
        ? `${userMsgContent}\n\nLink Metadata Provided:\n${linkMetadataSummary}\n(AI: Use this metadata instead of read_url if it covers what you need)`
        : userMsgContent;

      while (untriedModels.length > 0) {
        // Pick a model
        let usedModelName = useRandomModel 
          ? untriedModels.splice(Math.floor(Math.random() * untriedModels.length), 1)[0]
          : untriedModels.shift()!;

        try {
          const functionDeclarations = [
            {
              name: "create_file",
              description: "Create a new file.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: "Name of the file" },
                  folderId: { type: Type.STRING, description: "ID of the folder or null" },
                  content: { type: Type.STRING, description: "Initial content for the file" },
                  type: { type: Type.STRING, description: "Type of file (e.g. script, caption, brainstorm)"},
                  headerImage: { type: Type.STRING, description: "Base64 image data or URL for the header image" }
                },
                required: ["name", "content"]
              }
            },
            {
              name: "create_folder",
              description: "Create a new folder.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: "Name of the folder" },
                  parentId: { type: Type.STRING, description: "ID of the parent folder or null" }
                },
                required: ["name"]
              }
            },
            {
              name: "update_file",
              description: "Update an existing file.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING, description: "ID of the file" },
                  content: { type: Type.STRING, description: "New content for the file" }
                },
                required: ["id", "content"]
              }
            },
            {
              name: "read_file",
              description: "Reads the content of an existing file.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING, description: "ID of the file to read" }
                },
                required: ["id"]
              }
            },
            {
              name: "duplicate_item",
              description: "Duplicate an existing file or folder.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING, description: "ID of the item to duplicate" }
                },
                required: ["id"]
              }
            },
            {
              name: "search_content",
              description: "Perform a deep semantic search across the entire workspace. Returns high-fidelity snippets. Use this anytime the user asks to find a concept, topic, or specific wording.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  query: { type: Type.STRING, description: "The text or topic to search for" }
                },
                required: ["query"]
              }
            },
            {
              name: "analyze_workspace",
              description: "Get a comprehensive analysis of the current workspace structure and all contents.",
              parameters: { type: Type.OBJECT, properties: {} }
            },
            {
              name: "close_file",
              description: "Close the currently open file preview.",
              parameters: { type: Type.OBJECT, properties: {} }
            },
            {
              name: "go_to_root",
              description: "Navigate to the root level of the workspace.",
              parameters: { type: Type.OBJECT, properties: {} }
            },
            {
              name: "navigate_up",
              description: "Go back one level up in the folder structure (useful for 'closing' a folder).",
              parameters: { type: Type.OBJECT, properties: {} }
            },
            {
              name: "braindump",
              description: "Process a messy brain dump of ideas and organize them into structured files within a new folder.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  rawText: { type: Type.STRING, description: "The messy text/ideas to organize" },
                  suggestedFolderName: { type: Type.STRING, description: "Name for the new folder to contain the structured ideas" }
                },
                required: ["rawText"]
              }
            },
            {
              name: "delete_item",
              description: "Delete a file or folder. IMPORTANT: You MUST ask the user for confirmation before calling this tool.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING, description: "ID of the item" },
                  confirmed: { type: Type.BOOLEAN, description: "Whether the user has confirmed the deletion." }
                },
                required: ["id"]
              }
            },
            {
              name: "rename_item",
              description: "Rename a file or folder without changing its content.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING, description: "ID of the item" },
                  name: { type: Type.STRING, description: "New name" }
                },
                required: ["id", "name"]
              }
            },
            {
              name: "get_youtube_data",
              description: "Fetch the latest data and videos from the user's connected YouTube channel. Use this ONLY when explicitly asked to 'open connected youtube', 'show my videos', etc.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  limit: { type: Type.NUMBER, description: "Number of videos to fetch (max 15)" }
                }
              }
            },
            {
              name: "move_item",
              description: "Move a file or folder to a new parent folder. Use null or 'root' to move to root.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING, description: "ID of the item" },
                  parentId: { type: Type.STRING, description: "ID of the new parent folder, or null" }
                },
                required: ["id"]
              }
            },
            {
              name: "open_item",
              description: "Open a file or folder in the UI (navigates into it).",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING, description: "ID of the item to open" }
                },
                required: ["id"]
              }
            }
          ];

          const history = (currentMessages || []).slice(0, -1)
            .filter(m => m && (m.role === "user" || m.role === "assistant"))
            .map(m => ({
              role: m.role === "assistant" ? "model" as const : "user" as const,
              parts: [{ text: m.content || "" }]
            }));

          let firstUserIndex = history.findIndex(h => h.role === "user");
          const finalHistory = firstUserIndex !== -1 ? history.slice(firstUserIndex) : [];

          if (!currentMessages || currentMessages.length === 0) {
            throw new Error("No messages to send");
          }

          const lastMsg = currentMessages[currentMessages.length - 1];
          // If the last message is a system message (e.g. from command execution marker), 
          // we need to find the last actual user message for the main prompt
          let lastUserMsg = lastMsg;
          if (lastUserMsg && lastUserMsg.role !== "user") {
            const lastUserIdx = [...currentMessages].reverse().findIndex(m => m && m.role === "user");
            if (lastUserIdx !== -1) {
              lastUserMsg = currentMessages[currentMessages.length - 1 - lastUserIdx];
            }
          }

          if (!lastUserMsg) {
            throw new Error("No user message found in history");
          }

          const lastMsgParts: any[] = [{ text: lastUserMsgContent || "" }];
          
          // Automatically extract YouTube URLs to pass as native video input
          const ytRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
          const match = (lastUserMsgContent || "").match(ytRegex);
          let detectedVideoId = null;
          if (match && match[1]) {
            detectedVideoId = match[1];
            setIsWatchingVideo(true);
            lastMsgParts.push({ fileData: { mimeType: "video/mp4", fileUri: `https://www.youtube.com/watch?v=${detectedVideoId}` } });
          }

          if (userMessage.imageUrls) {
            userMessage.imageUrls.forEach(url => {
              const base64Data = url.split(',')[1];
              const mimeType = url.split(';')[0].split(':')[1];
              lastMsgParts.push({ inlineData: { data: base64Data, mimeType } });
            });
          }

          const systemInstruction = `You are Brandable's AI Copilot. You help users manage their content, scripts, captions, and brainstorms.
              Current context: User is in folder path: /${currentPath.join("/")}.
              Current file system knowledge: ${JSON.stringify(files.map(f => ({ id: f.id, name: f.name, type: f.type, parentId: f.parentId })))}

              CRITICAL UI KNOWLEDGE: The File Editor now uses a TipTap HTML Rich Text editor. It NO LONGER uses standard Markdown. 
              When creating or updating files with the \`create_file\` or \`update_file\` (if exists) tools, you MUST provide valid HTML content.
              - To add a placeholder inline image, use exactly: <img src="" />
              - To add a Bento Gallery with 3 placeholder slots, use exactly: <div data-type="gallery" data-images='["", "", ""]'></div>
              - Use standard HTML tags for formatting (<h1>, <p>, <strong>, <em>, <ul>, etc.) instead of Markdown.

              You can use tools to create files, folders, read files, update files, delete items, move items, rename, or open items.
              IMPORTANT:
              1. DO NOT ask for permission for basic tasks. Be intelligent and self-directed. Just execute what the user is asking.
              2. If any tool execution fails (e.g. file not found, permission error), you MUST append "Execution failed: [Error Reason]" to your response for the UI to display the error.
              3. When creating a file from an attached image, you SHOULD include the image/thumbnail data in the headerImage property of the file creation tool if supported.
              4. To read a file, use \`read_file\`.
              5. To move a file/folder, use \`move_item\`. To move to root, set parentId to null or "root". To navigate to the workspace homepage, use \`go_to_root\`.
              4. To open a file/folder in the UI, use \`open_item\` with the ID. 
              5. To close the currently open file, use \`close_file\`. To "close" a folder (navigate out), use \`navigate_up\` or \`go_to_root\`.
              6. To rename without changing content, use \`rename_item\`.
              7. For deletions, ALWAYS ask for confirmation first unless they already confirmed.
              8. Use \`analyze_workspace\` to give brand recommendations or overview of the project.
              9. All items (scripts, brainstorms, threads) are files.
              10. Use \`search_content\` robustly. If the user asks where they wrote about X, use the tool. The tool returns matching snippets. Use those to confidently point them to the exact file.
              11. YOUTUBE CAPABILITY: When the user asks to "open YouTube", "show my videos", or mentions "connected channel", use \`get_youtube_data\`. 
              When you receive the YouTube data (videos), you MUST output the video list using the format: %YOUTUBE_DATA%[JSON_ARRAY_OF_VIDEOS]%END_YOUTUBE% as part of your text response. ALWAYS return this tag first before any other text analysis if videos are discovered.
              
              CRITICAL: IDENTIFYING VIDEO OWNERSHIP:
              The YouTube data includes a 'category' field. You MUST use this to determine ownership:
              - 'personal': These are the user's OWN videos. Refer to them as "your videos".
              - 'competitor': These are videos from a competitor. DO NOT say "your videos". Refer to them as "competitor videos" or "videos from [ChannelName]".
              - 'inspiration': These are videos the user finds inspiring from ANOTHER channel. DO NOT say "your videos". Refer to them as "inspiration videos" or "videos from [ChannelName]".
              
              Tailor your advice accordingly: competitor = analysis/divergence, personal = growth/consistency, inspiration = theme extraction.

              CRITICAL: NATIVE VIDEO ANALYSIS:
              If the user sends a YouTube video URL, or clicks "watch_video", the system has natively attached the video stream. You MUST automatically be able to "watch" the video and listen to its audio. 
              When analyzing videos, ALWAYS provide key milestones or visual/verbal identifiers with timestamps formatted EXACTLY as %TIMESTAMP%MM:SS%END_TIMESTAMP% (DO NOT use brackets around the time). This powers the user's interactive player.
              
              TRANSCRIPTION:
              If the user asks for a transcription, wrap the full text in %TRANSCRIPTION%...%END_TRANSCRIPTION% tags to render it in a specialized readability-focused block.
              
              CRITICAL: COMPREHENSIVENESS & ANTI-LAZINESS:
              - You are FORBIDDEN from being "lazy" or provide "short summaries" when a user requests a full transcription, script, or in-depth analysis.
              - When creating files (\`create_file\`), you MUST provide the COMPLETE and EXHAUSTIVE content. NEVER truncate or say "[...rest of text]".
              - If a video is long, you MUST provide the full, comprehensive transcription or analysis. The user values completeness over speed for file-linked data.
              - While chat responses can be helpful and direct, any data being moved into a "File" (Script, Brainstorm, Transcription) must be high-quality, professional, and exhaustive.
              
              12. Always describe what you did or are about to do in your final text response.
              
              Alternatively, you can also output raw commands perfectly formatted in your response text to execute them, e.g.:
              command: create_file --name="filename.txt" --folder="folderNameOrId" --content="your content\\nhere"
              command: move_item --id="itemId" --parent="folderIdOrNull"
              command: rename_item --id="itemId" --name="new name"
              command: open_item --id="itemId"
              command: close_file
              command: go_to_root
              command: delete_item --id="itemId" --confirmed=true
              command: duplicate_item --id="itemId"
              command: search --query="keyword"
              `;

          const response = await genAI.models.generateContent({
            model: usedModelName,
            contents: [...finalHistory, { role: "user", parts: lastMsgParts }],
            config: {
              tools: [{ functionDeclarations }],
              systemInstruction: `${systemInstruction}
              
              ADDITIONAL INSTRUCTIONS:
              1. If a URL is provided in the message, the system has proactively already fetched metadata (Title, Description) for you. Use this info to carry on the conversation.
              2. CRITICAL: If the user sends a link with no explicit file operation instructions, you MUST simply reply with a conversational message. DO NOT create files, DO NOT move files, and DO NOT use any tools for URLs unless explicitly commanded.
              3. Be concise in your chat responses, but ALWAYS EXHAUSTIVE AND THOROUGH in file content creation or when explicitly asked for full analysis. Use proper markdown formatting for chat.
              4. After successfully performing tool actions, summarize the results naturally.`
            }
          });

          finalResponse = response;
          let functionCalls = finalResponse.functionCalls;
          let toolTurnDepth = 0;
          while (functionCalls && functionCalls.length > 0 && toolTurnDepth < 10) {
            toolTurnDepth++;
            setToolExecutionStatus("Executing tasks...");
            let functionResponses: any[] = [];
            for (const call of functionCalls) {
              setToolExecutionStatus(`Executing task: ${call.name.replace('_', ' ')}...`);
              let callResponse: any = { error: "Unknown error" };
              try {
                if (call.name === "create_file") {
                  const { name, folderId, content, type, headerImage } = call.args as any;
                  const newId = await onCreateFile(name, folderId || currentFolderId, content, type as FileType);
                  if (headerImage && newId) {
                    await onUpdateFile(newId, { headerImage });
                  }
                  callResponse = { success: true, id: newId };
                } else if (call.name === "create_folder") {
                  const { name, parentId } = call.args as any;
                  const newId = await onCreateFolder(name, parentId || currentFolderId);
                  callResponse = { success: true, id: newId };
                } else if (call.name === "read_file") {
                  const { id } = call.args as any;
                  const fileStr = files.find(f => f.id === id);
                  if (fileStr) {
                    callResponse = { success: true, content: fileStr.content || "File is empty or content is unavailable." };
                  } else {
                    callResponse = { error: "File not found" };
                  }
                } else if (call.name === "update_file") {
                  const { id, content } = call.args as any;
                  await onUpdateFile(id, { content });
                  callResponse = { success: true };
                } else if (call.name === "delete_item") {
                  const { id, confirmed } = call.args as any;
                  if (confirmed === true || confirmed === "true") {
                    await onDeleteFile(id);
                    callResponse = { success: true };
                  } else {
                    callResponse = { error: "Action cancelled. Deletion requires confirmation." };
                  }
                } else if (call.name === "duplicate_item") {
                  const { id } = call.args as any;
                  const original = files.find(f => f.id === id);
                  if (original) {
                    const newId = await onCreateFile(`${original.name} (Copy)`, original.parentId, original.content, original.type);
                    callResponse = { success: true, newId };
                  } else {
                    callResponse = { error: "Item not found" };
                  }
                } else if (call.name === "search_content") {
                  const { query } = call.args as any;
                  const q = query.toLowerCase();
                  const results = files.filter(f => 
                    f.name.toLowerCase().includes(q) || 
                    (f.content && f.content.toLowerCase().includes(q))
                  ).map(f => {
                    let snippet = "";
                    if (f.content && f.content.toLowerCase().includes(q)) {
                      const idx = f.content.toLowerCase().indexOf(q);
                      snippet = "..." + f.content.substring(Math.max(0, idx - 40), Math.min(f.content.length, idx + q.length + 40)).replace(/<[^>]*>?/gm, '') + "...";
                    }
                    return { id: f.id, name: f.name, type: f.type, snippet };
                  });
                  callResponse = { success: true, matchCount: results.length, results };
                } else if (call.name === "analyze_workspace") {
                  callResponse = { 
                    success: true, 
                    summary: `Workspace has ${files.length} items. Total files: ${files.filter(f => f.type !== 'folder').length}, total folders: ${files.filter(f => f.type === 'folder').length}.`,
                    items: files.map(f => ({ name: f.name, type: f.type, folder: f.parentId || 'root' }))
                  };
                } else if (call.name === "get_youtube_data") {
                  const data = await fetchYouTubeData();
                  callResponse = { success: true, ...data };
                } else if (call.name === "braindump") {
                  const { rawText, suggestedFolderName } = call.args as any;
                  const folderId = await onCreateFolder(suggestedFolderName || "Organized Ideas", currentFolderId);
                  if (folderId) await onCreateFile("Organized Brain Dump", folderId, rawText, "brainstorm");
                  callResponse = { success: true, folderId };
                } else if (call.name === "close_file") {
                  onOpenFile(null as any);
                  callResponse = { success: true };
                } else if (call.name === "go_to_root") {
                  onNavigate(null);
                  callResponse = { success: true };
                } else if (call.name === "navigate_up") {
                  if (currentFolderId) {
                    const currentFolder = files.find(f => f.id === currentFolderId);
                    onNavigate(currentFolder?.parentId || null);
                  }
                  callResponse = { success: true };
                } else if (call.name === "rename_item") {
                  const { id, name } = call.args as any;
                  await onUpdateFile(id, { name });
                  callResponse = { success: true };
                } else if (call.name === "move_item") {
                  const { id, parentId } = call.args as any;
                  await onUpdateFile(id, { parentId: parentId === "root" || parentId === "null" ? null : parentId });
                  callResponse = { success: true };
                } else if (call.name === "open_item") {
                  const { id } = call.args as any;
                  const file = files.find(f => f.id === id);
                  if (file) {
                    if (file.type === "folder") onNavigate(file.id);
                    else onOpenFile(file);
                    callResponse = { success: true };
                  } else {
                    callResponse = { error: "Item not found" };
                  }
                }
              } catch (err: any) {
                console.error("Tool execution error:", err);
                callResponse = { error: err.message || String(err) };
              }
              functionResponses.push({
                name: call.name,
                content: [callResponse],
                callId: call.id
              });
            }

            const historyWithCalls = [
              ...finalHistory, 
              { role: "user" as const, parts: lastMsgParts },
              { role: "model" as const, parts: finalResponse.candidates![0].content.parts },
              { role: "function" as const, parts: functionResponses.map(fr => ({ 
                functionResponse: { name: fr.name, response: fr.content[0] } 
              })) }
            ];

            const nextStep = await genAI!.models.generateContent({
              model: usedModelName,
              contents: historyWithCalls as any,
               config: {
                 tools: [{ functionDeclarations }],
                 systemInstruction: `${systemInstruction}
              
              ADDITIONAL INSTRUCTIONS:
              1. If a URL is provided in the message, the system has proactively already fetched metadata (Title, Description) for you. Use this info to carry on the conversation.
              2. CRITICAL: If the user sends a link with no explicit file operation instructions, you MUST simply reply with a conversational message. DO NOT create files, DO NOT move files, and DO NOT use any tools for URLs unless explicitly commanded.
              3. Be concise in your chat responses, but ALWAYS EXHAUSTIVE AND THOROUGH in file content creation or when explicitly asked for full analysis. Use proper markdown formatting for chat.
              4. After successfully performing tool actions, summarize the results naturally.`
               }
            });

            finalResponse = nextStep;
            functionCalls = finalResponse.functionCalls;
          }

          if (detectedVideoId) {
            setIsWatchingVideo(false);
          }
          setToolExecutionStatus(null);
          break; // Success!
        } catch (err: any) {
          if (typeof setIsWatchingVideo === 'function') setIsWatchingVideo(false);
          console.error(`Attempt failed with model ${usedModelName}:`, err);
          
          const isQuota = err.message?.toLowerCase().includes('quota') || 
                          err.message?.toLowerCase().includes('429');
          
          lastError = err;
          // If random mode is on, we keep trying other models in untriedModels
          if (!useRandomModel) break; 
        }
      }

      if (!finalResponse) throw lastError;

      const responseText = finalResponse.text || "Finished executing actions.";
      let assistantMessage: Omit<ChatMessage, "id"> = {
        role: "assistant",
        content: responseText,
        createdAt: Date.now()
      };

      await saveMessage(sessionId, assistantMessage);
      
      // Try to update title if it's still generic
      const finalSessionSnap = await dbGet(child(dbRef(rtdb), `chatSessions/${sessionId}`));
      const finalSession = finalSessionSnap.val();
      if (finalSession && (finalSession.title === "New Chat" || !finalSession.title)) {
        generateTitle(sessionId, `${userMsgContent} ${responseText}`);
      }
    } catch (err: any) {
      if (typeof setIsWatchingVideo === 'function') setIsWatchingVideo(false);
      console.error("Chat error:", err);
      
      const errorMessage = err.message?.includes('quota') 
        ? "Model failed: Quota exceeded (429). Please wait or switch models."
        : `Model failed: ${err.message || String(err)}`;

      await saveMessage(sessionId, {
        role: "system",
        content: `${errorMessage}\n\n%MODELS_FAILED_ACTION%`,
        createdAt: Date.now()
      });
    } finally {
      setIsGenerating(false);
      setToolExecutionStatus(null);
    }
  };

  const startLiveSession = async () => {
    if (!liveAI) {
      alert("Please set your Gemini API Key in Settings.");
      onOpenSettings();
      return;
    }

    let sessionId = currentSessionId;
    if (!sessionId) {
      const newSession: Omit<ChatSession, "id"> = {
        ownerId: profile.uid,
        title: "Live Session",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: []
      };
      const newRef = push(dbRef(rtdb, "chatSessions"));
      await set(newRef, newSession);
      sessionId = newRef.key!;
      setCurrentSessionId(sessionId);
    }

    setIsConnecting(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: "audio/webm" });

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      const playbackContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      playbackContextRef.current = playbackContext;
      nextPlayTimeRef.current = playbackContext.currentTime;

      currentAiTextRef.current = "";
      currentUserTextRef.current = "";

      const flushLiveTranscription = async () => {
        const aiText = currentAiTextRef.current;
        const userText = currentUserTextRef.current;
        if (sessionId && (aiText || userText)) {
          if (userText) {
            await saveMessage(sessionId, {
              role: "user",
              content: userText,
              createdAt: Date.now()
            });
          }
          if (aiText) {
            await saveMessage(sessionId, {
              role: "assistant",
              content: aiText,
              createdAt: Date.now()
            });
          }
          currentAiTextRef.current = "";
          currentUserTextRef.current = "";
          setLastLiveResponse("");
          setLiveUserTranscript("");
        }
      };

      const sessionPromise = (liveAI as any).live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          generationConfig: {
            responseModalities: ["TEXT", "AUDIO"],
          },
          systemInstruction: {
            parts: [{ text: `You are Brandable's AI Copilot. You are in a live voice session.
            Current context: User is in folder path: /${currentPath.join("/")}.
            Current file system knowledge: ${JSON.stringify(files.map(f => ({ id: f.id, name: f.name, type: f.type, parentId: f.parentId })))}
            
            CRITICAL UI KNOWLEDGE: The File Editor now uses a TipTap HTML Rich Text editor. It NO LONGER uses standard Markdown. 
            When creating files with the \`create_file\` tool, you MUST provide valid HTML content.
            - To add a placeholder inline image, use exactly: <img src="" />
            - To add a Bento Gallery with 3 placeholder slots, use exactly: <div data-type="gallery" data-images='["", "", ""]'></div>
            - Use standard HTML tags for formatting (<h1>, <p>, <strong>, <em>, <ul>, etc.) instead of Markdown.

            You can use tools to create files, folders, read files, update, delete, rename, move, duplicate, search, analyze, navigate out, and open items.
            IMPORTANT: 
            IDENTIFYING VIDEO OWNERSHIP: The YouTube data includes a 'category' (personal, competitor, inspiration). 
            - 'personal': These are the user's OWN videos.
            - 'competitor' / 'inspiration': These belong to OTHERS. DO NOT refer to them as "your videos". Use "competitor's videos" or "inspiration videos".
            Tailor advice: competitor = analysis, personal = refinement, inspiration = extracting themes.
            1. DO NOT ask for permission for basic tasks. Be intelligent and self-directed. Just execute what the user is asking.
            2. If you need to know what a file contains, use \`read_file\`.
            3. To open a file/folder in the UI, use \`open_item\`.
            4. To close a file or folder, use \`close_file\` or \`go_to_root\` / \`navigate_up\`.
            5. For deletions, ALWAYS ask for confirmation first unless they already confirmed.
            6. Provide a clear and concise text transcription of your full response.` }]
          },
          tools: [{
            functionDeclarations: [
              {
                name: "create_file",
                description: "Create a new file.",
                parameters: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    folderId: { type: "string" },
                    content: { type: "string" },
                    type: { type: "string" }
                  }, required: ["name", "content"]
                }
              },
              {
                name: "create_folder",
                description: "Create a new folder.",
                parameters: {
                  type: "object",
                  properties: { name: { type: "string" }, parentId: { type: "string" } }, required: ["name"]
                }
              },
              {
                name: "update_file",
                description: "Update an existing file.",
                parameters: {
                  type: "object",
                  properties: { id: { type: "string" }, content: { type: "string" } }, required: ["id", "content"]
                }
              },
              {
                name: "read_file",
                description: "Reads the content of an existing file.",
                parameters: {
                  type: "object",
                  properties: { id: { type: "string" } }, required: ["id"]
                }
              },
              {
                name: "delete_item",
                description: "Delete a file or folder. Requires confirmed=true.",
                parameters: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    confirmed: { type: "boolean" }
                  }, required: ["id"]
                }
              },
              {
                name: "rename_item",
                description: "Rename a file or folder.",
                parameters: {
                  type: "object",
                  properties: { id: { type: "string" }, name: { type: "string" } }, required: ["id", "name"]
                }
              },
              {
                name: "duplicate_item",
                description: "Duplicate an existing file or folder.",
                parameters: {
                  type: "object",
                  properties: { id: { type: "string" } }, required: ["id"]
                }
              },
              {
                name: "search_content",
                description: "Search for text within files.",
                parameters: {
                  type: "object",
                  properties: { query: { type: "string" } }, required: ["query"]
                }
              },
              {
                name: "close_file",
                description: "Close the currently open file preview.",
                parameters: { type: "object", properties: {} }
              },
              {
                name: "go_to_root",
                description: "Navigate to the root level.",
                parameters: { type: "object", properties: {} }
              },
              {
                name: "navigate_up",
                description: "Go back one level up in the folder structure.",
                parameters: { type: "object", properties: {} }
              },
              {
                name: "analyze_workspace",
                description: "Analyze workspace structure.",
                parameters: { type: "object", properties: {} }
              },
              {
                name: "braindump",
                description: "Organize messy ideas into structured files.",
                parameters: {
                  type: "object",
                  properties: { rawText: { type: "string" }, suggestedFolderName: { type: "string" } }, required: ["rawText"]
                }
              },
              {
                name: "move_item",
                description: "Move a file or folder.",
                parameters: {
                  type: "object",
                  properties: { id: { type: "string" }, parentId: { type: "string" } }, required: ["id"]
                }
              },
              {
                name: "get_youtube_data",
                description: "Fetch latest linked YouTube data and videos.",
                parameters: {
                  type: "object",
                  properties: { limit: { type: "number" } }
                }
              },
              {
                name: "open_item",
                description: "Open a file or folder in UI.",
                parameters: {
                  type: "object",
                  properties: { id: { type: "string" } }, required: ["id"]
                }
              }
            ]
          }],
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Aoede",
              }
            }
          },
          outputAudioTranscription: {},
          inputAudioTranscription: {}
        },
        callbacks: {
          onopen: () => {
            console.log("Live session opened");
            setToolExecutionStatus(null);
          },
          onmessage: async (message: any) => {
            // Handle GoAway signal from server (e.g. session timeout)
            // The protocol sends setupComplete: false to indicate session is ending
            if (message.setupComplete === false) {
              console.log("Gemini Live session ending (GoAway signal received)");
              stopLiveSession();
              return;
            }

            // Handle tool calls in live session
            if (message.toolCall?.functionCalls) {
              const functionResponses: any[] = [];
              for (const call of message.toolCall.functionCalls) {
                  setToolExecutionStatus(`Executing ${call.name.replace('_', ' ')}...`);
                  let callResponse: any = { error: "Unknown error" };
                  try {
                      if (call.name === "create_file") {
                          const { name, folderId, content, type } = call.args;
                          const newId = await onCreateFile(name, folderId || currentFolderId, content, type as FileType);
                          callResponse = { success: true, id: newId };
                      } else if (call.name === "get_youtube_data") {
                          const data = await fetchYouTubeData();
                          callResponse = { success: true, ...data };
                      } else if (call.name === "create_folder") {
                          const { name, parentId } = call.args;
                          const newId = await onCreateFolder(name, parentId || currentFolderId);
                          callResponse = { success: true, id: newId };
                      } else if (call.name === "update_file") {
                          const { id, content } = call.args;
                          await onUpdateFile(id, { content });
                          callResponse = { success: true };
                      } else if (call.name === "read_file") {
                          const { id } = call.args;
                          const fileStr = files.find(f => f.id === id);
                          if (fileStr) {
                              callResponse = { success: true, content: fileStr.content || "File is empty." };
                          } else {
                              callResponse = { error: "File not found" };
                          }
                      } else if (call.name === "delete_item") {
                          const { id, confirmed } = call.args;
                          if (confirmed === true || confirmed === "true") {
                            await onDeleteFile(id);
                            callResponse = { success: true };
                          } else {
                            callResponse = { error: "Deletion requires confirmation." };
                          }
                      } else if (call.name === "duplicate_item") {
                          const { id } = call.args;
                          const original = files.find(f => f.id === id);
                          if (original) {
                              const newId = await onCreateFile(`${original.name} (Copy)`, original.parentId, original.content, original.type);
                              callResponse = { success: true, id: newId };
                          } else {
                              callResponse = { error: "Item not found" };
                          }
                      } else if (call.name === "search_content") {
                          const { query } = call.args;
                          const results = files.filter(f => 
                              f.name.toLowerCase().includes(query.toLowerCase()) || 
                              (f.content && f.content.toLowerCase().includes(query.toLowerCase()))
                          );
                          callResponse = { success: true, results: results.map(r => ({ id: r.id, name: r.name })) };
                      } else if (call.name === "analyze_workspace") {
                          callResponse = { success: true, summary: `Workspace has ${files.length} items.` };
                      } else if (call.name === "braindump") {
                          const { rawText, suggestedFolderName } = call.args;
                          const folderId = await onCreateFolder(suggestedFolderName || "Organized Ideas", currentFolderId);
                          await onCreateFile("Organized Ideas", folderId as string, rawText, "brainstorm");
                          callResponse = { success: true, folderId };
                      } else if (call.name === "close_file") {
                           onOpenFile(null as any);
                           callResponse = { success: true };
                      } else if (call.name === "go_to_root") {
                           onNavigate(null);
                           callResponse = { success: true };
                      } else if (call.name === "navigate_up") {
                           if (currentFolderId) {
                               const cf = files.find(f => f.id === currentFolderId);
                               onNavigate(cf?.parentId || null);
                           }
                           callResponse = { success: true };
                      } else if (call.name === "move_item") {
                          const { id, parentId } = call.args;
                          const newParent = parentId === "root" || parentId === "null" ? null : parentId;
                          await onUpdateFile(id, { parentId: newParent });
                          callResponse = { success: true };
                      } else if (call.name === "rename_item") {
                          const { id, name } = call.args;
                          await onUpdateFile(id, { name });
                          callResponse = { success: true };
                      } else if (call.name === "open_item") {
                          const { id } = call.args;
                          const file = files.find(f => f.id === id);
                          if (file) {
                              if (file.type === "folder") onNavigate(file.id);
                              else onOpenFile(file);
                              callResponse = { success: true };
                          } else {
                              callResponse = { error: "File not found" };
                          }
                      }
                  } catch (e: any) {
                      console.error("Tool execution failed", e);
                      callResponse = { error: e.message || String(e) };
                  }
                  functionResponses.push({
                      id: call.id,
                      name: call.name,
                      response: callResponse
                  });
              }
              setToolExecutionStatus(null);
              if (liveSessionRef.current) {
                if (liveSessionRef.current.sendToolResponse) {
                   liveSessionRef.current.sendToolResponse({ functionResponses });
                } else {
                   liveSessionRef.current.send({ toolResponse: { functionResponses } });
                }
              }
            }

            // Sync transcription to message bubble
            const inputTranscription = message.serverContent?.inputAudioTranscription || message.serverContent?.inputTranscription;
            const outputTranscription = message.serverContent?.outputAudioTranscription || message.serverContent?.outputTranscription;

            if (inputTranscription && inputTranscription.text) {
              // The API usually sends chunks for input transcription as well.
              const text = inputTranscription.text;
              currentUserTextRef.current = (currentUserTextRef.current + " " + text).trim();
              setLiveUserTranscript(currentUserTextRef.current);
            }

            if (outputTranscription && outputTranscription.text) {
              currentAiTextRef.current = (currentAiTextRef.current + " " + outputTranscription.text).trim();
              setLastLiveResponse(currentAiTextRef.current);
            }

            if (message.serverContent?.close || message.serverContent?.goAway) {
              console.log("Server signaled connection close or GoAway.");
              stopLiveSession();
              return;
            }

            if (message.serverContent?.interrupted) {
              stopCurrentAudio();
            }

            let newText = "";

            if (message.serverContent?.modelTurn) {
              const parts = message.serverContent.modelTurn.parts;
              for (const part of parts) {
                if (part.inlineData && part.inlineData.data) {
                  const base64Audio = part.inlineData.data;
                  const binaryString = atob(base64Audio);
                  const len = binaryString.length;
                  const bytes = new Uint8Array(len);
                  for (let i = 0; i < len; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                  }
                  const pcm16 = new Int16Array(bytes.buffer);
                  
                  if (playbackContextRef.current) {
                    const audioBuffer = playbackContextRef.current.createBuffer(1, pcm16.length, 24000);
                    const channelData = audioBuffer.getChannelData(0);
                    for (let i = 0; i < pcm16.length; i++) {
                      channelData[i] = pcm16[i] / 0x7FFF;
                    }
                    
                    const playSource = playbackContextRef.current.createBufferSource();
                    playSource.buffer = audioBuffer;
                    playSource.connect(playbackContextRef.current.destination);
                    
                    const playTime = Math.max(playbackContextRef.current.currentTime, nextPlayTimeRef.current);
                    playSource.start(playTime);
                    nextPlayTimeRef.current = playTime + audioBuffer.duration;
                    currentAudioSourceRef.current = playSource;
                  }
                }
                if (part.text) {
                  currentAiTextRef.current += part.text;
                  setLastLiveResponse(currentAiTextRef.current);
                }
              }
            }

            // Also capture server-transcribed text
            if (message.serverContent?.outputAudioTranscription) {
              if (message.serverContent.outputAudioTranscription.text) {
                // already handled above
              }
            }

            if (message.serverContent?.turnComplete) {
              flushLiveTranscription();
            }
          },
          onclose: () => {
            stopLiveSession();
          },
          onerror: (err: any) => {
            console.error("Live session error:", err);
            stopLiveSession();
          }
        }
      });

      sessionPromise.then((session: any) => {
        liveSessionRef.current = session;
        setIsLive(true);
        setIsConnecting(false);

        processor.onaudioprocess = (e) => {
          const inputData = e.inputBuffer.getChannelData(0);
          const pcm16 = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            pcm16[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
          }
          const buffer = new ArrayBuffer(pcm16.length * 2);
          const view = new DataView(buffer);
          for (let i = 0; i < pcm16.length; i++) {
            view.setInt16(i * 2, pcm16[i], true);
          }
          const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
          
          session.sendRealtimeInput({
            audio: { data: base64, mimeType: 'audio/pcm;rate=16000' }
          });
        };

        source.connect(processor);
        processor.connect(audioContext.destination);
      }).catch((err: any) => {
        console.error("Failed to connect live session:", err);
        setIsConnecting(false);
        alert("Failed to start live session.");
      });

    } catch (err) {
      console.error("Failed to start live session:", err);
      setIsConnecting(false);
      alert("Failed to start live session. Please check permissions.");
    }
  };

  const stopLiveSession = async () => {
    // Collect any remaining live text before shutting down
    if (currentSessionId && (currentAiTextRef.current || currentUserTextRef.current)) {
      if (currentUserTextRef.current) {
        await saveMessage(currentSessionId, {
          role: "user",
          content: currentUserTextRef.current,
          createdAt: Date.now()
        });
      }
      if (currentAiTextRef.current) {
        await saveMessage(currentSessionId, {
          role: "assistant",
          content: currentAiTextRef.current,
          createdAt: Date.now()
        });
      }
      currentAiTextRef.current = "";
      currentUserTextRef.current = "";
      setLastLiveResponse("");
      setLiveUserTranscript("");
    }
    
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
    }
    if (liveSessionRef.current) {
      liveSessionRef.current.close();
    }
    stopCurrentAudio();
    if (processorRef.current) {
      processorRef.current.disconnect();
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(console.error);
    }
    if (playbackContextRef.current && playbackContextRef.current.state !== 'closed') {
      playbackContextRef.current.close().catch(console.error);
    }
    setIsLive(false);
    setIsConnecting(false);
  };

  const handleMessageAction = (action: string, data: any) => {
    if (action === 'activate_randomizer') {
      localStorage.setItem("gemini_random_model", "true");
      setIsRandomizerActive(true);
      return;
    }

    if (action === 'watch_video') {
      const url = data.link || "";
      const title = data.title || "video";
      
      const ytMatch = url.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      if (ytMatch && ytMatch[1]) {
        setActiveVideoPlayer({ videoId: ytMatch[1], timeSeconds: 0 });
      }

      setInput(`Tell me more about this video: ${title} (${url})`);
      handleSend(`I'm clicking on this video: ${title}. Please provide more details and options like summarize or transcribe. URL: ${url}`);
    } else if (action === 'play_timestamp') {
      // data is "MM:SS"
      const parts = data.split(':').map(Number).reverse();
      let seconds = 0;
      if (parts[0]) seconds += parts[0];
      if (parts[1]) seconds += parts[1] * 60;
      if (parts[2]) seconds += parts[2] * 3600;

      const ytRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
      let lastVideoId = activeVideoPlayer?.videoId || null;
      
      if (!lastVideoId) {
        const allMessagesReversed = [...messages].reverse();
        for (let i = 0; i < allMessagesReversed.length; i++) {
           const content = allMessagesReversed[i].content;
           const match = content.match(ytRegex);
           if (match && match[1]) {
             lastVideoId = match[1];
             break;
           }
           // Also check for hidden JSON data
           const jsonMatch = content.match(/%YOUTUBE_DATA%([\s\S]*?)%END_YOUTUBE%/);
           if (jsonMatch) {
             try {
               const parsed = JSON.parse(jsonMatch[1]);
               const vids = Array.isArray(parsed) ? parsed : (parsed.videos || []);
               if (vids.length > 0) {
                 lastVideoId = vids[0].id;
                 break;
               }
             } catch (e) {}
           }
        }
      }

      if (lastVideoId) {
        setActiveVideoPlayer({ videoId: lastVideoId, timeSeconds: seconds });
        // Scroll to the new player position if it was out of view
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        alert("No video discovered in this chat yet. Please share a YouTube link first!");
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-black relative overflow-hidden">
      {/* Header */}
      <div className={cn(
        "flex items-center justify-between px-4 h-14 border-b border-neutral-100 dark:border-neutral-800 bg-white dark:bg-black z-10 shrink-0 transition-all",
        activeVideoPlayer && "md:h-14 h-12"
      )}>
        <div className="flex items-center gap-2.5">
          <div className={cn(
            "p-2 bg-neutral-50 dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 rounded-lg transition-all relative overflow-hidden",
            activeVideoPlayer && "p-2"
          )}>
            <BrainCircuit className={cn("w-5 h-5 text-black dark:text-white transition-all", activeVideoPlayer && "w-4 h-4")} />
            {activeVideoPlayer && (
               <motion.div 
                 animate={{ opacity: [0.4, 1, 0.4] }} 
                 transition={{ duration: 2, repeat: Infinity }}
                 className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white" 
               />
            )}
          </div>
          <div className="flex flex-col">
            <h2 className={cn("text-sm font-extrabold text-neutral-900 tracking-tight transition-all", activeVideoPlayer && "text-xs leading-none mb-0.5")}>AI Copilot</h2>
            {activeVideoPlayer && (
               <div className="flex items-center gap-1.5 overflow-hidden">
                 <Youtube className="w-2.5 h-2.5 text-red-600" />
                 <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest truncate max-w-[120px]">Active Video</span>
               </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {activeVideoPlayer?.isMinimized && (
            <button 
              onClick={() => setActiveVideoPlayer(prev => prev ? { ...prev, isMinimized: false } : null)}
              className="px-2 py-1 bg-red-50 text-red-600 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-red-100 transition-all flex items-center gap-1.5"
            >
              <Youtube className="w-3 h-3" />
              Maximize
            </button>
          )}
          <button 
            onClick={() => setShowSessions(true)}
            className="p-2.5 text-neutral-400 hover:text-black hover:bg-neutral-50 rounded-xl transition-all active:scale-95"
          >
            <History className="w-5 h-5" />
          </button>
          <button 
            onClick={onOpenSettings}
            className="p-2.5 text-neutral-400 hover:text-black hover:bg-neutral-50 rounded-xl transition-all active:scale-95"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Sessions Bottom Sheet */}
      <AnimatePresence>
        {showSessions && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSessions(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm z-40 transition-all"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="absolute bottom-0 inset-x-0 h-[50vh] bg-white dark:bg-neutral-900 rounded-t-[32px] z-50 flex flex-col overflow-hidden shadow-2xl border-t border-neutral-100 dark:border-neutral-800"
            >
              <div className="flex flex-col h-full bg-white dark:bg-neutral-900">
                <div className="flex items-center justify-between px-6 py-5 border-b border-neutral-100 dark:border-neutral-800">
                  <div className="flex items-center gap-3">
                    <History className="w-5 h-5 text-neutral-400" />
                    <h3 className="font-bold text-neutral-900 dark:text-white leading-none">History</h3>
                  </div>
                  <button 
                    onClick={createNewSession}
                    className="p-2 bg-black dark:bg-primary text-white rounded-full hover:scale-110 active:scale-95 transition-all"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="flex-1 overflow-y-auto px-4 py-2 custom-scrollbar">
                  {sessions.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-neutral-400 gap-3 grayscale opacity-60">
                      <MessageSquare className="w-10 h-10" />
                      <p className="text-sm font-medium">No conversations yet</p>
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      {sessions.map((s) => (
                        <div
                          key={s.id}
                          onClick={() => {
                            setCurrentSessionId(s.id);
                            setShowSessions(false);
                          }}
                          className={cn(
                            "group w-full max-w-full flex items-center justify-between gap-2 p-4 rounded-2xl transition-all border text-left overflow-hidden cursor-pointer",
                            currentSessionId === s.id 
                              ? "bg-black dark:bg-primary border-black dark:border-primary text-white" 
                              : "bg-white dark:bg-neutral-900 border-neutral-50 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
                          )}
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0 pr-2">
                             <div className={cn(
                               "w-2 h-2 rounded-full shrink-0 animate-pulse",
                               currentSessionId === s.id ? "bg-white" : "bg-neutral-200"
                             )} />
                             <span className="text-sm font-semibold truncate block">
                               {s.title ? cleanText(s.title) : "Untitled Chat"}
                             </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "shrink-0 text-[10px] uppercase font-bold tracking-widest opacity-40 group-hover:opacity-100 transition-opacity",
                              currentSessionId === s.id ? "text-white" : "text-neutral-400"
                            )}>
                               {new Date(s.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteSession(s.id);
                              }}
                              className={cn(
                                "p-1.5 rounded-lg transition-all opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:text-white",
                                currentSessionId === s.id ? "text-white/40 hover:text-white hover:bg-white/20" : "text-neutral-300"
                              )}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Persistent Video Player Area */}
      <AnimatePresence>
        {activeVideoPlayer && !activeVideoPlayer.isMinimized && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="w-full bg-white border-b border-neutral-100 shadow-xl z-20 overflow-hidden relative"
          >
            <div className="flex items-center justify-between px-4 py-2 bg-neutral-50 border-b border-neutral-100/50">
               <div className="flex items-center gap-2.5">
                 <div className="p-1 bg-red-600/10 rounded-lg">
                   <Youtube className="w-4 h-4 text-red-600" />
                 </div>
                 <div className="flex flex-col">
                   <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-900">Reference Player</span>
                   <span className="text-[9px] font-medium text-neutral-400">Time: {Math.floor(activeVideoPlayer.timeSeconds / 60)}:{(activeVideoPlayer.timeSeconds % 60).toString().padStart(2, '0')}</span>
                 </div>
               </div>
               <div className="flex items-center gap-2">
                 <button 
                  onClick={() => setActiveVideoPlayer(prev => prev ? { ...prev, isMinimized: true } : null)}
                  className="p-1.5 hover:bg-neutral-200 rounded-full transition-colors active:scale-95 text-neutral-400 hover:text-neutral-900"
                  title="Minimize"
                 >
                   <Minimize2 className="w-4 h-4" />
                 </button>
                 <button 
                   onClick={() => setActiveVideoPlayer(null)} 
                   className="p-1.5 hover:bg-red-50 rounded-full transition-colors active:scale-95 text-neutral-400 hover:text-red-600"
                   title="Close"
                 >
                   <X className="w-4 h-4" />
                 </button>
               </div>
            </div>
            <div className="aspect-video w-full bg-black relative">
              <iframe 
                key={activeVideoPlayer.videoId + (activeVideoPlayer.timeSeconds || 0)} 
                src={`https://www.youtube.com/embed/${activeVideoPlayer.videoId}?start=${activeVideoPlayer.timeSeconds}&autoplay=1&rel=0&modestbranding=1`} 
                allow="autoplay; encrypted-media" 
                allowFullScreen 
                className="w-full h-full border-0 absolute inset-0"
              />
              {isWatchingVideo && (
                 <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center pointer-events-none">
                    <div className="flex flex-col items-center gap-3">
                       <div className="flex gap-1.5">
                          {[0, 1, 2].map(i => (
                            <motion.div 
                              key={i}
                              animate={{ height: [8, 16, 8] }}
                              transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
                              className="w-1 bg-red-500 rounded-full"
                            />
                          ))}
                       </div>
                       <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white animate-pulse">Analyzing Frames</span>
                    </div>
                 </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className={cn(
          "flex-1 overflow-y-auto p-4 space-y-8 flex flex-col scroll-smooth custom-scrollbar relative transition-all",
          activeVideoPlayer && !activeVideoPlayer.isMinimized && "md:p-4 p-2 md:space-y-8 space-y-4" 
        )}
      >
        {messages.length === 0 ? (
          <div className={cn(
            "flex-1 flex flex-col items-center justify-center p-8 space-y-6 text-center max-w-sm mx-auto transition-all",
            activeVideoPlayer && "md:p-8 p-4 md:space-y-6 space-y-3"
          )}>
            {!activeVideoPlayer && (
              <div className="w-20 h-20 bg-neutral-50 border border-neutral-100 rounded-3xl flex items-center justify-center animate-pulse">
                <BrainCircuit className="w-10 h-10 text-neutral-900" />
              </div>
            )}
            <div>
              <h3 className={cn("text-xl font-bold text-neutral-900 mb-2 mt-[-50px]", activeVideoPlayer && "mt-0 text-lg")}>How can I help you?</h3>
              {!activeVideoPlayer && (
                <p className="text-sm text-neutral-500 leading-relaxed font-medium">
                  I can help you build brainstorms, scripts, captions, organize folders or just brainstorm ideas for your next big thing.
                </p>
              )}
            </div>
            <div className={cn("grid gap-2 w-full", activeVideoPlayer && "md:grid hidden")}>
              {isSuggestionsLoading ? (
                <div className="flex items-center justify-center gap-2 py-4">
                  <Loader2 className="w-3 h-3 animate-spin text-neutral-400" />
                  <span className="text-xs text-neutral-400 font-medium">Getting suggestions...</span>
                </div>
              ) : (
                dynamicSuggestions.map((suggestion, i) => (
                  <button 
                    key={i}
                    onClick={() => setInput(suggestion)}
                    className="px-4 py-3 bg-neutral-50 border border-neutral-100 rounded-2xl text-xs font-semibold text-neutral-600 hover:bg-neutral-100 hover:border-neutral-200 transition-all text-left whitespace-nowrap overflow-hidden text-ellipsis hover:translate-y-[-1px] active:translate-y-0"
                  >
                    {suggestion}
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble 
              key={msg.id} 
              msg={msg} 
              viewingImage={viewingImage} 
              setViewingImage={setViewingImage}
              onSpeak={handleSpeak}
              onRetry={() => handleSend(msg.content)}
              onAction={handleMessageAction}
              onOpenSettings={onOpenSettings}
              isRandomizerActive={isRandomizerActive}
            />
          ))
        )}

        {isLive && (liveUserTranscript || lastLiveResponse) && (
          <div className="space-y-8 flex flex-col">
            {liveUserTranscript && (
              <MessageBubble 
                msg={{ 
                  id: "live-user", 
                  role: "user", 
                  content: liveUserTranscript, 
                  createdAt: Date.now(),
                  isSilent: true // Use silent styling for partial voice transcription
                }} 
                viewingImage={null} 
                setViewingImage={() => {}} 
                onSpeak={handleSpeak}
                onRetry={() => handleSend(liveUserTranscript)}
                onAction={handleMessageAction}
                onOpenSettings={onOpenSettings}
                isRandomizerActive={isRandomizerActive}
              />
            )}
            {lastLiveResponse && (
              <MessageBubble 
                msg={{ 
                  id: "live-ai", 
                  role: "assistant", 
                  content: lastLiveResponse, 
                  createdAt: Date.now() 
                }} 
                viewingImage={null} 
                setViewingImage={() => {}} 
                onSpeak={handleSpeak} 
                onRetry={() => {}} 
                onAction={handleMessageAction}
                onOpenSettings={onOpenSettings}
                isRandomizerActive={isRandomizerActive}
              />
            )}
          </div>
        )}

        {isWatchingVideo && (
          <div className="self-start px-0.5 space-y-2 mb-4">
             <div className="flex items-center gap-2 opacity-70">
              <Youtube className="w-3 h-3 text-red-500" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-red-500 animate-pulse">Watching Video...</span>
            </div>
            <div className="h-1 w-32 bg-neutral-100 rounded-full overflow-hidden">
               <motion.div 
                 initial={{ x: "-100%" }}
                 animate={{ x: "100%" }}
                 transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                 className="h-full w-1/2 bg-red-500 rounded-full"
               />
            </div>
          </div>
        )}

        {isGenerating && (
          <div className="self-start px-0.5">
            <div className="flex items-center gap-2 mb-1.5 opacity-50">
              <Bot className="w-3 h-3" />
              <span className="text-[10px] font-bold uppercase tracking-widest">AI Thinking</span>
            </div>
            <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
          </div>
        )}
        
        {toolExecutionStatus && (
          <div className="self-start text-[10px] text-blue-500 font-bold uppercase tracking-widest px-0.5 flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin inline-block" />
            {toolExecutionStatus}
          </div>
        )}

        <div ref={messagesEndRef} />
        
        {/* Hidden debug area as requested to ensure live updates remain active */}
        <textarea 
          className="hidden" 
          value={lastLiveResponse} 
          readOnly 
          aria-hidden="true" 
        />
        
        {/* Scroll Bottom Button */}
        <AnimatePresence>
          {showScrollBottom && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 20 }}
              onClick={scrollToBottom}
              className="fixed bottom-32 right-8 p-3 bg-black text-white rounded-full shadow-xl z-20 hover:scale-110 active:scale-95 transition-all outline-none"
            >
              <ArrowDown className="w-5 h-5" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Input Area */}
      <div className={cn(
        "p-4 bg-white/80 backdrop-blur-xl border-t border-neutral-100 shrink-0 transition-all",
        activeVideoPlayer && "md:p-4 p-2" // Minimal padding on mobile when player is active
      )}>
        {/* Attached Images Preview */}
        {attachedImages.length > 0 && !activeVideoPlayer && ( // Hide image preview on mobile when player is active to save space
          <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
            {attachedImages.map((img, idx) => (
              <div key={idx} className="relative shrink-0">
                <img src={img.url} alt="Preview" className="w-16 h-16 object-cover rounded-xl border border-neutral-200" />
                <button 
                  onClick={() => removeImage(idx)}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-black text-white rounded-full flex items-center justify-center shadow-sm"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className={cn(
          "flex items-end gap-2 bg-neutral-100 p-1.5 rounded-2xl border border-neutral-100 focus-within:border-neutral-200 focus-within:bg-neutral-50 transition-all relative",
          activeVideoPlayer && "rounded-xl" // Slightly sharper corners for minimal look
        )}>
          <input 
            type="file" 
            accept="image/*" 
            multiple 
            className="hidden" 
            ref={fileInputRef}
            onChange={handleImageUpload}
          />
          {!activeVideoPlayer && ( // Hide attachment button on mobile when player is active
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="p-2.5 text-neutral-400 hover:text-black transition-all rounded-xl hover:bg-white shrink-0 active:scale-95"
            >
              <ImageIcon className="w-5 h-5" />
            </button>
          )}
          
          {linkPreview && (
              <div className="absolute bottom-full mb-2 inset-x-0 mx-2 bg-white border border-neutral-100 rounded-xl overflow-hidden shadow-xl p-3 flex gap-3">
                 {linkPreview.image && <img src={linkPreview.image} className="w-16 h-16 rounded object-cover shrink-0" />}
                 <div className="min-w-0 flex flex-col gap-0.5 justify-center">
                    <div className="text-sm font-semibold truncate text-neutral-900">{linkPreview.title}</div>
                    <div className="text-xs text-neutral-500 line-clamp-2 leading-relaxed">{linkPreview.description}</div>
                    <div className="text-[10px] text-neutral-400 truncate">{linkPreview.url}</div>
                 </div>
              </div>
          )}
          
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={activeVideoPlayer ? "Ask about current timestamp..." : "Ask AI anything..."}
            className={cn(
              "flex-1 bg-transparent border-none outline-none resize-none max-h-32 py-2.5 text-sm font-semibold text-neutral-900 placeholder:text-neutral-400",
              activeVideoPlayer && "py-1.5"
            )}
            rows={1}
          />

          {input.trim() || attachedImages.length > 0 ? (
            <button 
              onClick={() => handleSend()}
              disabled={isGenerating}
              className="p-2.5 bg-black text-white rounded-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-30 shrink-0 shadow-lg shadow-black/10"
            >
              <Send className="w-5 h-5" />
            </button>
          ) : (
            <button 
              onClick={isLive ? stopLiveSession : startLiveSession}
              disabled={isConnecting}
              className={cn(
                "p-2.5 rounded-xl transition-all shrink-0 relative overflow-hidden active:scale-95",
                isLive ? "bg-red-500 text-white" : "bg-white text-neutral-400 border border-neutral-100 hover:text-black hover:bg-neutral-50 shadow-sm",
                activeVideoPlayer && "p-1.5"
              )}
            >
              {isLive && (
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
                </motion.div>
              )}
              <div className="relative z-10">
                {isConnecting ? <Loader2 className="w-5 h-5 animate-spin" /> : isLive ? <Square className="w-5 h-5 fill-current" /> : <Mic className={cn("w-5 h-5", activeVideoPlayer && "w-4 h-4")} />}
              </div>
            </button>
          )}
        </div>
      </div>

      {/* Image Viewer Popup */}
      <AnimatePresence>
        {viewingImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-neutral-950/90 backdrop-blur-xl flex items-center justify-center p-4 lg:p-12"
            onClick={() => setViewingImage(null)}
          >
            <button 
              className="absolute top-6 right-6 p-3 bg-white/10 rounded-full text-white hover:bg-white/20 transition-all backdrop-blur-md z-10 active:scale-95"
              onClick={() => setViewingImage(null)}
            >
              <X className="w-6 h-6" />
            </button>
            <motion.img 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              src={viewingImage} 
              className="max-w-full max-h-full object-contain rounded-3xl shadow-2xl border border-white/10"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
})
