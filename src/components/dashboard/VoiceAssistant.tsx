import { useState, useEffect, useRef, useImperativeHandle, forwardRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mic, MicOff, Loader2, X, Brain, Waves, Play, Square } from "lucide-react";
import { GoogleGenAI as LiveGenAI } from "@google/genai";
import { cn } from "@/src/lib/utils";
import { useNotifications } from "./NotificationSystem";
import { FileItem, FileType } from "@/src/types";

interface VoiceAssistantProps {
  files: FileItem[];
  currentPath: string[];
  onNavigate: (folderId: string | null) => void;
  onFilter: (query: string | null) => void;
  onOpenFile: (file: FileItem) => void;
  onUpdateFile: (id: string, updates: Partial<FileItem>) => Promise<void>;
  onDeleteFile: (id: string) => Promise<void>;
  onCreateFolder: (name: string, parentId: string | null) => Promise<string | undefined>;
  onCreateFile: (name: string, folderId: string | null, content?: string, type?: FileType) => Promise<string | undefined>;
  currentFolderId: string | null;
  currentSessionId: string | null;
  onLogAction: (msg: string, isSilent?: boolean, role?: 'user' | 'assistant' | 'system') => Promise<void>;
  onStateChange?: (isActive: boolean) => void;
  apiKey: string;
}

export default forwardRef<any, VoiceAssistantProps>(function VoiceAssistant({ 
  files, 
  currentPath,
  onNavigate, 
  onFilter, 
  onOpenFile, 
  onUpdateFile,
  onDeleteFile,
  onCreateFolder, 
  onCreateFile, 
  currentFolderId, 
  currentSessionId, 
  apiKey: propApiKey,
  onLogAction, 
  onStateChange
}: VoiceAssistantProps, ref) {
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [lastLiveResponse, setLastLiveResponse] = useState<string>("");
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    onStateChange?.(isActive);
  }, [isActive, onStateChange]);
  const { addNotification } = useNotifications();

  // Gemini Live Refs
  const liveSessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const currentAiTextRef = useRef<string>("");
  const currentUserTextRef = useRef<string>("");

  useImperativeHandle(ref, () => ({
    toggle: () => {
      if (isActive) stopSession();
      else startSession();
    },
    isActive
  }));

  const getApiKey = () => {
    if (propApiKey && propApiKey.trim().length > 0) return propApiKey;
    return process.env.GEMINI_API_KEY;
  };

  const startSession = async () => {
    if (isConnecting) return;
    setIsConnecting(true);

    const apiKey = getApiKey();
    if (!apiKey) {
      setIsConnecting(false);
      addNotification({ title: "API Key Missing", message: "Please set your Gemini API key in Settings.", type: "error" });
      return;
    }

    try {
      setSessionError(null);
      const liveAI = new LiveGenAI({ apiKey } as any);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = audioContext;
      
      // Ensure context is running - critical for waves/audio activity
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      const playbackContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      playbackContextRef.current = playbackContext;
      if (playbackContext.state === 'suspended') {
        await playbackContext.resume();
      }
      nextPlayTimeRef.current = playbackContext.currentTime;

      // Connect audio chain early to ensure waves show up even before AI connects
      source.connect(processor);
      processor.connect(audioContext.destination);

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Calculate volume level for waveform visualization - ALWAYS RUN for waves
        let sum = 0;
        for(let i=0; i<inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        setVoiceLevel(Math.sqrt(sum / inputData.length));

        // Only send audio if session is connected
        if (liveSessionRef.current) {
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
          
          liveSessionRef.current.sendRealtimeInput({
            audio: { data: base64, mimeType: 'audio/pcm;rate=16000' }
          });
        }
      };

      const sessionPromise = (liveAI as any).live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          systemInstruction: {
            parts: [{ text: `You are Brandable's AI Copilot. You are in a live voice session.
            Current context: User is in folder path: /${currentPath.join("/")}.
            Current file system knowledge: ${JSON.stringify(files.map(f => ({ id: f.id, name: f.name, type: f.type, parentId: f.parentId })))}

            You can use tools to create files, folders, read files, update, delete, rename, move, duplicate, search, analyze, and open items. 
            IMPORTANT:
            1. DO NOT ask for permission for basic tasks. Be intelligent and self-directed. Just execute what the user is asking.
            2. To read a file (including threads, social media scripts, etc.), use \`read_file\`. You MUST read the content before summarizing or suggesting edits.
            3. To open a file or folder in the UI, use \`open_item\`. To close a file, use \`close_file\`. To "close" a folder, use \`navigate_up\` or \`go_to_root\`.
            4. To rename without changing content, use \`rename_item\`.
            5. To move an item, use \`move_item\`. To move to root, set parentId to null or "root". To go to the homepage/root workspace, use \`go_to_root\`.
            6. For deletions, ALWAYS ask for confirmation first unless they already confirmed.
            7. All items (scripts, brainstorms, threads) are files.
            8. Provide a clear and concise text transcription of your full response including the commands.
            
            Alternatively, you can also output raw commands perfectly formatted in your response text to execute them, e.g.:
            command: create_file --name="filename.txt" --folder="folderNameOrId" --content="your content\nhere"
            command: move_item --id="itemId" --parent="folderIdOrNull"
            command: delete_item --id="itemId" --confirmed=true
            command: duplicate_item --id="itemId"
            command: search --query="keyword"
            ` }]
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
                  properties: { id: { type: "string" }, confirmed: { type: "boolean" } }, required: ["id"]
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
                description: "Move a file or folder to a new parent.",
                parameters: {
                  type: "object",
                  properties: { id: { type: "string" }, parentId: { type: "string" } }, required: ["id"]
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
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } },
          outputAudioTranscription: {},
          inputAudioTranscription: {}
        },
        callbacks: {
          onopen: () => {
            setIsConnecting(false);
            setIsActive(true);
            addNotification({ title: "Voice Assistant Active", message: "Listening...", type: "task" });
          },
          onmessage: async (message: any) => {
            if (message.serverContent?.interrupted) {
                // Clear any pending audio if user interrupts
                nextPlayTimeRef.current = playbackContextRef.current?.currentTime || 0;
            }

            // Check for tool calls
            if (message.toolCall?.functionCalls) {
              const functionResponses: any[] = [];
              for (const call of message.toolCall.functionCalls) {
                  addNotification({ title: "Executing Action", message: call.name.replace('_', ' '), type: "task" });
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
                          if (confirmed === true || confirmed === "true" || confirmed === 1) {
                            await onDeleteFile(id);
                            callResponse = { success: true };
                          } else {
                            callResponse = { error: "Deletion requires confirmation. Ask user first." };
                          }
                      } else if (call.name === "duplicate_item") {
                          const { id } = call.args;
                          const original = files.find(f => f.id === id);
                          if (original) {
                              const newId = await onCreateFile(`${original.name} (Copy)`, original.parentId, original.content, original.type);
                              callResponse = { success: true, id: newId };
                          } else {
                              callResponse = { error: "File not found" };
                          }
                      } else if (call.name === "search_content") {
                          const { query } = call.args;
                          const results = files.filter(f => 
                              f.name.toLowerCase().includes(query.toLowerCase()) || 
                              (f.content && f.content.toLowerCase().includes(query.toLowerCase()))
                          );
                          callResponse = { success: true, results: results.map(r => ({ id: r.id, name: r.name, type: r.type })) };
                      } else if (call.name === "analyze_workspace") {
                          callResponse = { success: true, summary: "Workspace has " + files.length + " items." };
                      } else if (call.name === "braindump") {
                          const { rawText, suggestedFolderName } = call.args;
                          const folderId = await onCreateFolder(suggestedFolderName || "Organized Ideas", currentFolderId);
                          await onCreateFile("Organized Ideas Content", folderId as string, rawText, "brainstorm");
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
              if (liveSessionRef.current.sendToolResponse) {
                liveSessionRef.current.sendToolResponse({ functionResponses });
              } else if (liveSessionRef.current.send) {
                liveSessionRef.current.send({ toolResponse: { functionResponses } });
              }
            }

            // Check for audio output in model turn
            if (message.serverContent?.modelTurn?.parts) {
                for (const part of message.serverContent.modelTurn.parts) {
                    if (part.inlineData && part.inlineData.data) {
                        handleAudioOutput(part.inlineData.data);
                    }
                    if (part.text) {
                        currentAiTextRef.current += part.text;
                    }
                }
            }

            // Also check for audio output in model transcript turn if needed
            if (!message.serverContent?.modelTurn?.parts && message.serverContent?.inlineData?.data) {
                handleAudioOutput(message.serverContent.inlineData.data);
            }

            // Capture model's output transcription (what the AI is saying)
            if (message.serverContent?.outputTranscription && message.serverContent.outputTranscription.text) {
                currentAiTextRef.current += message.serverContent.outputTranscription.text;
            }
            
            // Capture user's input transcription (what the user said)
            if (message.serverContent?.inputAudioTranscription && message.serverContent.inputAudioTranscription.text) {
                currentUserTextRef.current += message.serverContent.inputAudioTranscription.text;
                onLogAction(message.serverContent.inputAudioTranscription.text, true, 'user');
            }

            // Check for completed turn
            if (message.serverContent?.turnComplete) {
                const text = currentAiTextRef.current.trim();
                if (text) {
                    onLogAction(text, true, 'assistant');
                    setLastLiveResponse(text);
                }
                currentAiTextRef.current = "";
                currentUserTextRef.current = "";
            }
          },
          onclose: () => stopSession(),
          onerror: (err: any) => {
            console.error("Live session error:", err);
            const errorMsg = err.message || "Connection failed. Please check your API key and quota.";
            setSessionError(errorMsg);
            addNotification({ 
              title: "Voice Assistant Error", 
              message: errorMsg, 
              type: "error" 
            });
            stopSession(false); // don't notify "offline" if we just notified error
          }
        }
      });
      
      const session = await sessionPromise;
      liveSessionRef.current = session;
      setIsConnecting(false);
      setIsActive(true);
      addNotification({ title: "Voice Assistant Active", message: "Listening...", type: "task" });
    } catch (err: any) {
      console.error("Voice Assistant Connection Error:", err);
      setIsConnecting(false);
      const errorMsg = err.message || "Unable to start voice assistant. Check microphone permissions.";
      setSessionError(errorMsg);
      addNotification({ title: "Connection Failed", message: errorMsg, type: "error" });
    }
  };

  const handleAudioOutput = async (base64: string) => {
    if (!playbackContextRef.current) return;
    
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    
    const pcmData = new Int16Array(bytes.buffer);
    const float32Data = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) float32Data[i] = pcmData[i] / 32768;

    const buffer = playbackContextRef.current.createBuffer(1, float32Data.length, 24000);
    buffer.getChannelData(0).set(float32Data);

    const source = playbackContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(playbackContextRef.current.destination);

    const startTime = Math.max(playbackContextRef.current.currentTime, nextPlayTimeRef.current);
    source.start(startTime);
    nextPlayTimeRef.current = startTime + buffer.duration;
  };

  const stopSession = (notify = true) => {
    if (liveSessionRef.current) liveSessionRef.current.close();
    if (processorRef.current) processorRef.current.disconnect();
    
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(console.error);
    }
    if (playbackContextRef.current && playbackContextRef.current.state !== 'closed') {
      playbackContextRef.current.close().catch(console.error);
    }
    
    liveSessionRef.current = null;
    audioContextRef.current = null;
    playbackContextRef.current = null;
    processorRef.current = null;
    
    setIsActive(false);
    setIsConnecting(false);
    setVoiceLevel(0);

    if (notify) {
      addNotification({
        title: "Assistant Offline",
        message: "Voice assistant session ended.",
        type: "info"
      });
    }
  };

  return (
    <AnimatePresence>
      {(isActive || isConnecting || sessionError) && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] w-full max-w-sm px-4"
        >
          <div className="bg-black/95 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col items-center gap-6 overflow-hidden relative">
            {/* Animated Aura */}
            <motion.div 
              animate={{ 
                scale: [1, 1.1, 1],
                opacity: [0.3, 0.5, 0.3],
              }}
              transition={{ duration: 3, repeat: Infinity }}
              className="absolute inset-0 bg-blue-500/10 blur-3xl z-0"
            />

            <div className="relative z-10 flex flex-col items-center gap-4 w-full">
              <div className="flex items-center justify-between w-full mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-[10px] text-white/50 uppercase tracking-[0.2em] font-bold">
                    Connected to Copilot
                  </span>
                </div>
                <button onClick={() => stopSession()} className="p-1 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Waveform Visualization */}
              <div className="h-12 flex items-center justify-center gap-1.5 w-full">
                {[...Array(12)].map((_, i) => (
                  <motion.div
                    key={i}
                    animate={{ 
                      height: (isActive || isConnecting) ? [8, 8 + (voiceLevel * 100 * Math.random()), 8] : [8, 12, 8]
                    }}
                    transition={{ 
                      duration: 0.2 + (Math.random() * 0.2), 
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                    className={cn(
                      "w-1.5 rounded-full",
                      (isActive || isConnecting) ? "bg-white" : "bg-white/20"
                    )}
                  />
                ))}
              </div>

              <div className="text-center px-4 w-full">
                <AnimatePresence mode="wait">
                  {sessionError ? (
                    <motion.div 
                      key="error"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-red-500/20 border border-red-500/50 p-4 rounded-2xl text-red-500 text-[10px] font-bold"
                    >
                      <p className="mb-2">ERROR</p>
                      <p className="text-white/80 font-medium leading-tight">{sessionError}</p>
                      <button 
                        onClick={() => { setSessionError(null); startSession(); }}
                        className="mt-3 px-4 py-1.5 bg-red-500 text-white rounded-full text-[10px] hover:bg-red-600 transition-colors"
                      >
                        Try Again
                      </button>
                    </motion.div>
                  ) : lastLiveResponse && isActive ? (
                    <motion.p 
                      key="response"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="text-white text-xs leading-relaxed font-bold line-clamp-3 bg-white/10 p-4 rounded-2xl border border-white/10"
                    >
                      "{lastLiveResponse}"
                    </motion.p>
                  ) : (
                    <motion.div key="status" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      <h3 className="text-white font-bold text-lg">
                        {isConnecting ? "Connecting..." : "Listening..."}
                      </h3>
                      <p className="text-white/40 text-xs mt-1 font-medium italic">
                        "Create a script for..."
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex items-center gap-4 mt-2">
                <button 
                  onClick={() => stopSession()}
                  className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-red-500 transition-all group"
                >
                  {isConnecting ? <Loader2 className="w-6 h-6 animate-spin" /> : <Square className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
