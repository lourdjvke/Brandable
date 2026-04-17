import { useState, useEffect, useRef, useMemo, useImperativeHandle, forwardRef } from "react";
import { UserProfile, ChatSession, ChatMessage, FileItem, FileType } from "@/src/types";
import { db } from "@/src/lib/firebase";
import { collection, query, where, onSnapshot, addDoc, doc, updateDoc, deleteDoc, getDocs, orderBy, limit, arrayUnion } from "firebase/firestore";
import { Copy, Send, Mic, Square, Settings, Plus, Image as ImageIcon, X, Loader2, ChevronRight, BrainCircuit, ChevronDown, User, Bot, MessageSquare } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/src/lib/utils";
import { GoogleGenAI as LiveGenAI, LiveServerMessage, Modality } from "@google/genai";
import { GoogleGenerativeAI, FunctionDeclaration } from "@google/generative-ai";
import ReactMarkdown from "react-markdown";

interface AICopilotProps {
  profile: UserProfile;
  currentPath: string[];
  currentFolderId: string | null;
  files: FileItem[];
  onNavigate: (folderId: string | null) => void;
  onOpenSettings: () => void;
  sessionId: string | null;
  apiKey: string;
  onSessionChange: (id: string | null) => void;
  onCreateFile: (name: string, folderId: string | null, content?: string, type?: FileType) => Promise<string | undefined>;
  onUpdateFile: (id: string, updates: Partial<FileItem>) => Promise<void>;
  onDeleteFile: (id: string) => Promise<void>;
  onCreateFolder: (name: string, parentId: string | null) => Promise<string | undefined>;
}

function parseCommandArg(line: string, argName: string) {
  const regex = new RegExp(`--${argName}=(?:"([^"]*)"|([^\\s]+))`);
  const match = line.match(regex);
  if (!match) return null;
  return (match[1] !== undefined ? match[1] : match[2]) || "";
}

function MessageBubble({ msg, viewingImage, setViewingImage }: { msg: ChatMessage; viewingImage: string | null; setViewingImage: (url: string | null) => void }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Custom renderer for commands to make them UI appropriate
  const renderContent = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, i) => {
      const trimmed = line.trim();
      const isCommand = trimmed.startsWith('command:') || 
                        trimmed.startsWith('create_file') || 
                        trimmed.startsWith('create_folder') || 
                        trimmed.startsWith('update_file') || 
                        trimmed.startsWith('delete_item');

      if (isCommand) {
        return (
          <div key={i} className="my-2 bg-neutral-50 border border-neutral-200 rounded-md overflow-hidden">
            <div 
              className="flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-neutral-100 transition-colors"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">AI Action</span>
                <span className={cn("text-xs font-mono text-neutral-600 truncate transition-all", !isExpanded && "max-w-[200px]")}>
                  {trimmed.replace(/^command:\s*/, '')}
                </span>
              </div>
              <ChevronDown className={cn("w-4 h-4 text-neutral-400 transition-transform", isExpanded && "rotate-180")} />
            </div>
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: "auto" }}
                  exit={{ height: 0 }}
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
      return (
        <ReactMarkdown key={i} components={{ p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p> }}>
          {line}
        </ReactMarkdown>
      );
    });
  };

  return (
    <div className={cn("flex flex-col max-w-[85%]", msg.role === "user" ? "self-end items-end" : "self-start items-start")}>
      <div className={cn(
        "px-3 py-2 rounded-md text-sm leading-relaxed w-full",
        msg.role === "user" ? "bg-black text-white rounded-tr-none" : 
        msg.role === "system" ? "bg-red-50 text-red-600" : "bg-neutral-100 text-black rounded-tl-none"
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
          msg.isSilent && "opacity-70 italic"
        )}>
          {msg.isSilent && (
            <div className="flex items-center gap-1.5 mb-1 text-[10px] uppercase tracking-wider font-bold text-neutral-400 not-italic">
              <Mic className="w-3 h-3" />
              Voice Action
            </div>
          )}
          {msg.role === 'assistant' ? renderContent(msg.content) : (
            <ReactMarkdown>{msg.content}</ReactMarkdown>
          )}
        </div>
      </div>
      <span className="text-[10px] text-neutral-400 mt-1 px-1 font-medium">
        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  );
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

  useEffect(() => {
    if (propSessionId !== undefined && propSessionId !== currentSessionId) {
      setCurrentSessionId(propSessionId);
    }
  }, [propSessionId]);

  const [attachedImages, setAttachedImages] = useState<{ url: string; file: File }[]>([]);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [lastLiveResponse, setLastLiveResponse] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string>("gemini-2.5-flash");
  const [showModelSelector, setShowModelSelector] = useState(false);
  const processedCommands = useRef<Set<string>>(new Set());

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
        
        const commandLines = msg.content?.split('\n').filter(line => {
          const t = line.trim();
          return t.startsWith("command:") || 
                 t.startsWith("create_file") || 
                 t.startsWith("create_folder") || 
                 t.startsWith("update_file") || 
                 t.startsWith("delete_item") ||
                 t.startsWith("read_file");
        }) || [];
        
        if (msg.role === 'assistant' && 
            commandLines.length > 0 && 
            !processedCommands.current.has(msg.id)) {
          
          processedCommands.current.add(msg.id);
          setToolExecutionStatus("Executing text commands...");
          
          try {
            for (let commandLine of commandLines) {
              let content = commandLine.trim();

              const parseCommandArg = (line: string, argName: string) => {
                const regex = new RegExp(`--${argName}=(?:"([^"]*)"|([^\\s]+))`);
                const match = line.match(regex);
                if (!match) return null;
                return (match[1] !== undefined ? match[1] : match[2]) || "";
              };

              if (content.includes("create_file")) {
                const fileName = parseCommandArg(content, "name") || "Untitled";
                const folderNameOrId = parseCommandArg(content, "folder");
                let fileContent = parseCommandArg(content, "content") || "";
                fileContent = fileContent.replace(/\\n/g, '\n'); // Support literal \n output
                
                let fileType: FileType = "script";
                if (fileName.endsWith(".txt")) fileType = "brainstorm";
                else if (fileName.includes("caption") || fileName.endsWith(".sm")) fileType = "caption";
                else if (fileName.includes("thread") || fileName.endsWith(".tw")) fileType = "thread";
                else if (fileName.includes("brainstorm")) fileType = "brainstorm";

                let folderId = currentFolderId;
                if (folderNameOrId && folderNameOrId !== "null" && folderNameOrId !== "undefined") {
                  const existingFolder = files.find(f => f.type === 'folder' && (f.id === folderNameOrId || f.name.toLowerCase() === folderNameOrId.toLowerCase()));
                  if (existingFolder) folderId = existingFolder.id;
                }

                await onCreateFile(fileName, folderId, fileContent, fileType);
              } else if (content.includes("create_folder")) {
                const folderName = parseCommandArg(content, "name") || "Untitled Folder";
                const parentNameOrId = parseCommandArg(content, "parent");
                
                let parentId = currentFolderId;
                if (parentNameOrId && parentNameOrId !== "null" && parentNameOrId !== "undefined") {
                  const existingParent = files.find(f => f.type === 'folder' && (f.id === parentNameOrId || f.name.toLowerCase() === parentNameOrId.toLowerCase()));
                  if (existingParent) parentId = existingParent.id;
                }

                await onCreateFolder(folderName, parentId);
              } else if (content.includes("update_file")) {
                const id = parseCommandArg(content, "id");
                let fileContent = parseCommandArg(content, "content");
                if (fileContent !== null) {
                  fileContent = fileContent.replace(/\\n/g, '\n');
                  if (id) await onUpdateFile(id, { content: fileContent });
                }
              } else if (content.includes("delete_item")) {
                const id = parseCommandArg(content, "id");
                if (id) await onDeleteFile(id);
              }
            }

            // Provide visual feedback / system marker that the commands ran
            await saveMessage(currentSessionId, {
              role: "system",
              content: `Text commands executed successfully. execute=done`,
              createdAt: Date.now()
            });
          } catch (e) {
            console.error("Failed to parse/execute auto-detection AI commands:", e);
          } finally {
            setToolExecutionStatus(null);
          }
        }
      }
    };
    processCommands();
  }, [messages, onCreateFile, onUpdateFile, onDeleteFile, onCreateFolder, currentFolderId, currentSessionId, files]);

  const TEXT_MODELS = [
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
    { id: "gemini-3.1-flash-lite-preview", name: "Gemini 3.1 Flash Lite" },
    { id: "gemini-3-flash-preview", name: "Gemini 3 Flash" },
    { id: "gemini-2.5-flash-lite-preview", name: "Gemini 2.5 Flash Lite" },
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
      return new GoogleGenerativeAI(key);
    } catch (e) {
      console.error("GenAI Init Error:", e);
      return null;
    }
  }, [propApiKey, sessions]);

  const liveAI = useMemo(() => {
    const key = getApiKey();
    if (!key) return null;
    try {
      return new LiveGenAI({ apiKey: key } as any);
    } catch (e) {
      console.error("LiveAI Init Error:", e);
      return null;
    }
  }, [propApiKey, sessions]);

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  useEffect(() => {
    const testConnection = async () => {
      try {
        const { getDocFromServer } = await import("firebase/firestore");
        await getDocFromServer(doc(db, "chatSessions", "connection-test"));
      } catch (error: any) {
        if (error.message?.includes("offline")) {
          console.error("Firestore is offline. Please check your internet connection or Firebase configuration.");
        }
      }
    };
    testConnection();
  }, []);

  useEffect(() => {
    onSessionChange(currentSessionId);
  }, [currentSessionId, onSessionChange]);

  useEffect(() => {
    if (!profile.uid) return;
    const q = query(collection(db, "chatSessions"), where("ownerId", "==", profile.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const sessionList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatSession))
        .sort((a, b) => b.updatedAt - a.updatedAt);
      setSessions(sessionList);
      if (!currentSessionId && sessionList.length > 0 && !propSessionId) {
        setCurrentSessionId(sessionList[0].id);
      }
    });
    return () => unsubscribe();
  }, [profile.uid]);

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
    const docRef = await addDoc(collection(db, "chatSessions"), newSession);
    setCurrentSessionId(docRef.id);
    setShowSessions(false);
  };

  const saveMessage = async (sessionId: string, message: Omit<ChatMessage, "id">) => {
    const newMessage = { ...message, id: Date.now().toString() };
    const sessionRef = doc(db, "chatSessions", sessionId);
    
    try {
      await updateDoc(sessionRef, {
        messages: arrayUnion(newMessage),
        updatedAt: Date.now()
      });
      
      // Return the updated messages for immediate use
      const session = sessions.find(s => s.id === sessionId);
      if (session) {
        return [...(session.messages || []), newMessage];
      }
      return [newMessage];
    } catch (err) {
      console.error("Error saving message:", err);
      return [];
    }
  };

  const generateTitle = async (sessionId: string, firstMessage: string) => {
    try {
      if (!genAI) return;
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const result = await model.generateContent(`Generate a short, concise title (max 4 words) for a chat that starts with: "${firstMessage}"`);
      const response = await result.response;
      const title = response.text().replace(/["']/g, "").trim() || "New Chat";
      await updateDoc(doc(db, "chatSessions", sessionId), { title });
    } catch (err) {
      console.error("Failed to generate title:", err);
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
    const docRef = await addDoc(collection(db, "files"), newFile);
    return docRef.id;
  };

  const handleSend = async () => {
    if (!input.trim() && attachedImages.length === 0) return;
    
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
      const docRef = await addDoc(collection(db, "chatSessions"), newSession);
      sessionId = docRef.id;
      setCurrentSessionId(sessionId);
    }

    const userMsgContent = input;
    const imageUrls = attachedImages.map(img => img.url);
    
    const userMessage: Omit<ChatMessage, "id"> = {
      role: "user",
      content: userMsgContent,
      createdAt: Date.now()
    };
    if (imageUrls.length > 0) {
      userMessage.imageUrls = imageUrls;
    }

    const currentMessages = await saveMessage(sessionId, userMessage);
    
    const session = sessions.find(s => s.id === sessionId);
    if (session && session.title === "New Chat") {
      generateTitle(sessionId, userMsgContent);
    }

    setInput("");
    setAttachedImages([]);
    setIsGenerating(true);

    try {
      const useRandomModel = localStorage.getItem("gemini_random_model") === "true";
      const availableModels = TEXT_MODELS.map(m => m.id);
      
      let attempts = 0;
      let lastError = null;
      let finalResponse = null;
      let usedModelName = selectedModel;

      while (attempts < 3) {
        try {
          const currentModelName = (useRandomModel && attempts > 0) 
            ? availableModels[Math.floor(Math.random() * availableModels.length)]
            : usedModelName;
          
          usedModelName = currentModelName;

          const tools: any = [{
            functionDeclarations: [
              {
                name: "create_file",
                description: "Create a new file.",
                parameters: {
                  type: "object",
                  properties: {
                    name: { type: "string", description: "Name of the file" },
                    folderId: { type: "string", description: "ID of the folder or null" },
                    content: { type: "string", description: "Initial content for the file" },
                    type: { type: "string", description: "Type of file (e.g. script, caption, brainstorm)"}
                  },
                  required: ["name", "content"]
                }
              },
              {
                name: "create_folder",
                description: "Create a new folder.",
                parameters: {
                  type: "object",
                  properties: {
                    name: { type: "string", description: "Name of the folder" },
                    parentId: { type: "string", description: "ID of the parent folder or null" }
                  },
                  required: ["name"]
                }
              },
              {
                name: "update_file",
                description: "Update an existing file.",
                parameters: {
                  type: "object",
                  properties: {
                    id: { type: "string", description: "ID of the file" },
                    content: { type: "string", description: "New content for the file" }
                  },
                  required: ["id", "content"]
                }
              },
              {
                name: "read_file",
                description: "Reads the content of an existing file.",
                parameters: {
                  type: "object",
                  properties: {
                    id: { type: "string", description: "ID of the file to read" }
                  },
                  required: ["id"]
                }
              },
              {
                name: "delete_item",
                description: "Delete a file or folder.",
                parameters: {
                  type: "object",
                  properties: {
                    id: { type: "string", description: "ID of the item" }
                  },
                  required: ["id"]
                }
              }
            ]
          }];

          const model = genAI.getGenerativeModel({ 
            model: usedModelName,
            tools,
            systemInstruction: `You are Brandable's AI Copilot. You help users manage their content, scripts, captions, and brainstorms.
            Current context: User is in folder path: /${currentPath.join("/")}.
            Current file system knowledge: ${JSON.stringify(files.map(f => ({ id: f.id, name: f.name, type: f.type, parentId: f.parentId })))}

            You can use tools to create files, folders, read files, update files, and delete items.
            Alternatively, you can also output raw commands perfectly formatted in your response text to execute them, e.g.:
            command: create_file --name="filename.txt" --folder="folderNameOrId" --content="your content\\nhere"
            
            IMPORTANT:
            1. DO NOT ask for permission for basic tasks. Be intelligent and self-directed. Just execute what the user is asking.
            2. If you need to know what a file contains, use \`read_file\`. NEVER use \`update_file\` to read a file, and do not update files unless the user explicitly requests an update.
            3. Always describe what you did or are about to do in your final text response.`
          });

          const history = currentMessages.slice(0, -1).map(m => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }]
          }));

          // Gemini requires the first message in history to be from the 'user'
          let firstUserIndex = history.findIndex(h => h.role === "user");
          const finalHistory = firstUserIndex !== -1 ? history.slice(firstUserIndex) : [];

          const lastMsg = currentMessages[currentMessages.length - 1];
          const lastMsgParts: any[] = [{ text: lastMsg.content }];
          if (lastMsg.imageUrls) {
            lastMsg.imageUrls.forEach(url => {
              const base64Data = url.split(',')[1];
              const mimeType = url.split(';')[0].split(':')[1];
              lastMsgParts.push({ inlineData: { data: base64Data, mimeType } });
            });
          }

          const chat = model.startChat({ history: finalHistory });
          let result = await chat.sendMessage(lastMsgParts);
          finalResponse = await result.response;

          let functionCalls = finalResponse.functionCalls();
          while (functionCalls && functionCalls.length > 0) {
            setToolExecutionStatus("Executing tasks...");
            let functionResponses: any[] = [];
            for (const call of functionCalls) {
              setToolExecutionStatus(`Executing task: ${call.name.replace('_', ' ')}...`);
              let callResponse: any = { error: "Unknown error" };
              try {
                if (call.name === "create_file") {
                  const { name, folderId, content, type } = call.args;
                  const newId = await onCreateFile(name, folderId || currentFolderId, content, type as FileType);
                  callResponse = { success: true, id: newId };
                } else if (call.name === "create_folder") {
                  const { name, parentId } = call.args;
                  const newId = await onCreateFolder(name, parentId || currentFolderId);
                  callResponse = { success: true, id: newId };
                } else if (call.name === "read_file") {
                  const { id } = call.args;
                  const fileStr = files.find(f => f.id === id);
                  if (fileStr) {
                    callResponse = { success: true, content: fileStr.content || "File is empty or content is unavailable." };
                  } else {
                    callResponse = { error: "File not found" };
                  }
                } else if (call.name === "update_file") {
                  const { id, content } = call.args;
                  await onUpdateFile(id, { content });
                  callResponse = { success: true };
                } else if (call.name === "delete_item") {
                  const { id } = call.args;
                  await onDeleteFile(id);
                  callResponse = { success: true };
                } else {
                  callResponse = { error: "Unknown tool" };
                }
              } catch (e: any) {
                console.error("Function call execution error:", e);
                callResponse = { error: e.message || String(e) };
              }
              functionResponses.push({
                functionResponse: { name: call.name, response: callResponse }
              });
            }
            result = await chat.sendMessage(functionResponses);
            finalResponse = await result.response;
            functionCalls = finalResponse.functionCalls();
          }

          setToolExecutionStatus(null);
          break; // Success!
        } catch (err) {
          console.error(`Attempt ${attempts + 1} failed with model ${usedModelName}:`, err);
          lastError = err;
          attempts++;
          if (!useRandomModel) break; 
        }
      }

      if (!finalResponse) throw lastError;

      const responseText = finalResponse.text() || "Finished executing actions.";
      let assistantMessage: Omit<ChatMessage, "id"> = {
        role: "assistant",
        content: responseText,
        createdAt: Date.now()
      };

      await saveMessage(sessionId, assistantMessage);
      
      // If still "New Chat", try to generate a better title based on the assistant's response too
      if (session && session.title === "New Chat") {
        generateTitle(sessionId, `${userMsgContent} ${responseText}`);
      }
    } catch (err) {
      console.error("Chat error:", err);
      await saveMessage(sessionId, {
        role: "system",
        content: "Error communicating with AI. Please check your API key.",
        createdAt: Date.now()
      });
    } finally {
      setIsGenerating(false);
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
      const docRef = await addDoc(collection(db, "chatSessions"), newSession);
      sessionId = docRef.id;
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

      let currentAiText = "";

      const sessionPromise = (liveAI as any).live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          systemInstruction: {
            parts: [{ text: `You are Brandable's AI Copilot. You are in a live voice session.
            Current context: User is in folder path: /${currentPath.join("/")}.
            Current file system knowledge: ${JSON.stringify(files.map(f => ({ id: f.id, name: f.name, type: f.type, parentId: f.parentId })))}

            Available commands:
            - Create file: command: create_file --name=filename.txt --folder=folderNameOrId --content="content"
            - Create folder: command: create_folder --name=folderName --parent=parentNameOrId
            - Update file: command: update_file --id=fileId --content="content"
            - Delete item: command: delete_item --id=itemId

            Always provide a clear and concise text transcription of your full response including the commands.` }]
          },
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
          },
          onmessage: async (message: any) => {
            // Debug refinement: Only update when we have output transcription
            if (message.serverContent?.outputTranscription && message.serverContent.outputTranscription.text) {
              console.log("Live transcription message received:", message.serverContent.outputTranscription.text);
              
              // Accumulate words with proper spacing for the current turn
              currentAiText = (currentAiText + " " + message.serverContent.outputTranscription.text).trim();
              setLastLiveResponse(currentAiText);
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
                  newText += part.text;
                }
              }
            }

            // Also capture server-transcribed text to show in the debug area if part.text isn't provided
            if (message.serverContent?.outputAudioTranscription) {
              if (message.serverContent.outputAudioTranscription.text) {
                 newText += message.serverContent.outputAudioTranscription.text;
              }
            }

            if (newText) {
              currentAiText += newText;
              setLastLiveResponse(currentAiText);
            }

            if (message.serverContent?.turnComplete) {
              if (currentAiText.trim() && currentSessionIdRef.current) {
                let finalContent = currentAiText.trim();
                
                // No longer parsing JSON here, just save the assistant message
                finalContent = currentAiText.trim();
                
                await saveMessage(currentSessionIdRef.current, {
                  role: "assistant",
                  content: finalContent,
                  createdAt: Date.now()
                });
                setLastLiveResponse(currentAiText);
                currentAiText = "";
              }
            }
          },
          onclose: () => {
            stopLiveSession();
          },
          onerror: (err: any) => {
            console.error("Live session error:", err);
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

  const stopLiveSession = () => {
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

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Header */}
      <div className="p-4 border-b border-neutral-200 flex items-center justify-between bg-white z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-sm bg-black flex items-center justify-center text-white">
            <BrainCircuit className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-sm">AI Copilot</h2>
            <button 
              onClick={() => setShowModelSelector(!showModelSelector)}
              className="text-[10px] text-neutral-400 font-medium uppercase tracking-wider flex items-center gap-1 hover:text-black transition-colors"
            >
              {isLive ? "Gemini 3 Flash Live" : (TEXT_MODELS.find(m => m.id === selectedModel)?.name || "Chat Assistant")}
              {!isLive && <ChevronDown className={cn("w-3 h-3 transition-transform", showModelSelector && "rotate-180")} />}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={createNewSession} className="p-2 hover:bg-neutral-100 rounded-sm transition-colors text-black font-medium text-xs flex items-center gap-1">
            <Plus className="w-4 h-4" /> New
          </button>
          <button 
            onClick={() => setShowSessions(!showSessions)}
            className="p-2 hover:bg-neutral-100 rounded-sm transition-colors text-neutral-500"
          >
            <MessageSquare className={cn("w-5 h-5 transition-colors", showSessions && "text-black")} />
          </button>
        </div>
      </div>
      
      {isLive && (
        <div className="p-4 border-b border-neutral-100 bg-neutral-50 animate-in slide-in-from-top duration-300">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-neutral-500 font-bold uppercase">Raw Voice Response</span>
            <button onClick={() => navigator.clipboard.writeText(lastLiveResponse)} className="p-1 hover:bg-neutral-200 rounded-sm">
              <Copy className="w-3 h-3 text-neutral-500" />
            </button>
          </div>
          <textarea
            readOnly
            value={lastLiveResponse}
            className="w-full text-xs font-mono bg-white border border-neutral-200 p-2 rounded-sm h-24 resize-none"
            placeholder="Waiting for AI response..."
          />
        </div>
      )}

      {/* Model Selector Dropdown */}
      <AnimatePresence>
        {showModelSelector && !isLive && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="absolute top-[73px] left-0 right-0 bg-white border-b border-neutral-100 shadow-lg z-30 overflow-hidden"
          >
            <div className="p-2 flex flex-col gap-1">
              <p className="px-3 py-1 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Select Model</p>
              {TEXT_MODELS.map(model => (
                <button
                  key={model.id}
                  onClick={() => {
                    setSelectedModel(model.id);
                    setShowModelSelector(false);
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2 text-xs rounded-md transition-colors",
                    selectedModel === model.id ? "bg-black text-white" : "hover:bg-neutral-100 text-neutral-600"
                  )}
                >
                  {model.name}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sessions Dropdown */}
      <AnimatePresence>
        {showSessions && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="absolute top-[73px] left-0 right-0 bg-white border-b border-neutral-100 shadow-lg z-20 overflow-hidden max-h-64 overflow-y-auto"
          >
            <div className="p-2 flex flex-col gap-1">
              <p className="px-3 py-1 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Chat History</p>
              {sessions.map(session => (
                <button
                  key={session.id}
                  onClick={() => {
                    setCurrentSessionId(session.id);
                    setShowSessions(false);
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2.5 text-xs rounded-md transition-colors flex items-center justify-between group",
                    currentSessionId === session.id ? "bg-neutral-100 font-semibold" : "hover:bg-neutral-50"
                  )}
                >
                  <span className="truncate flex-1">{session.title}</span>
                  <span className="text-[9px] text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    {new Date(session.updatedAt).toLocaleDateString()}
                  </span>
                </button>
              ))}
              {sessions.length === 0 && (
                <p className="px-3 py-4 text-center text-xs text-neutral-400">No chat history yet</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6 hide-scrollbar relative z-0 pb-32">
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-neutral-400 gap-4">
            <div className="w-16 h-16 rounded-full bg-neutral-50 flex items-center justify-center">
              <MessageSquare className="w-8 h-8 opacity-50" />
            </div>
            <p className="text-sm font-medium">How can I help you today?</p>
          </div>
        ) : (
          messages.map((msg) => (
             <MessageBubble key={msg.id} msg={msg} viewingImage={viewingImage} setViewingImage={setViewingImage} />
          ))
        )}
        {isGenerating && (
          <div className="self-start bg-neutral-100 px-4 py-3 rounded-2xl rounded-tl-sm">
            <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
          </div>
        )}
        {toolExecutionStatus && (
          <div className="self-start text-xs text-blue-500 font-medium px-4 py-2 flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin inline-block" />
            {toolExecutionStatus}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-xl border-t border-neutral-100 z-10">
        {/* Attached Images Preview */}
        {attachedImages.length > 0 && (
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

        <div className="flex items-end gap-2 bg-neutral-100 p-1.5 rounded-md border border-neutral-200 focus-within:border-black transition-all relative z-10">
          <input 
            type="file" 
            accept="image/*" 
            multiple 
            className="hidden" 
            ref={fileInputRef}
            onChange={handleImageUpload}
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-neutral-500 hover:text-black transition-colors rounded-sm hover:bg-neutral-200 shrink-0"
          >
            <ImageIcon className="w-5 h-5" />
          </button>
          
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask anything..."
            className="flex-1 bg-transparent border-none outline-none resize-none max-h-32 py-2 text-sm font-medium"
            rows={1}
          />

          {input.trim() || attachedImages.length > 0 ? (
            <button 
              onClick={handleSend}
              disabled={isGenerating}
              className="p-2 bg-black text-white rounded-sm hover:bg-neutral-800 transition-colors disabled:opacity-50 shrink-0"
            >
              <Send className="w-5 h-5" />
            </button>
          ) : (
            <button 
              onClick={isLive ? stopLiveSession : startLiveSession}
              disabled={isConnecting}
              className={cn(
                "p-2 rounded-sm transition-all shrink-0 relative overflow-hidden",
                isLive ? "bg-red-500 text-white" : "bg-white text-black border border-neutral-200 hover:bg-neutral-100"
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
              <div className="relative z-10">
                {isConnecting ? <Loader2 className="w-5 h-5 animate-spin" /> : isLive ? <Square className="w-5 h-5 fill-current" /> : <Mic className="w-5 h-5" />}
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
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4"
            onClick={() => setViewingImage(null)}
          >
            <button 
              className="absolute top-6 right-6 p-2 bg-white/10 rounded-full text-white hover:bg-white/20 transition-colors"
              onClick={() => setViewingImage(null)}
            >
              <X className="w-6 h-6" />
            </button>
            <motion.img 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              src={viewingImage} 
              className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
})
