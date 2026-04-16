import { useState, useEffect, useRef, useImperativeHandle, forwardRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mic, MicOff, Loader2, X, Brain, Waves, Play, Square } from "lucide-react";
import { GoogleGenAI as LiveGenAI } from "@google/genai";
import { cn } from "@/src/lib/utils";
import { useNotifications } from "./NotificationSystem";

interface VoiceAssistantProps {
  files: any[];
  currentPath: string[];
  onNavigate: (folderId: string | null) => void;
  onFilter: (query: string | null) => void;
  onOpenFile: (file: any) => void;
  onUpdateFile: (id: string, updates: any) => Promise<void>;
  onDeleteFile: (id: string) => Promise<void>;
  onCreateFolder: (name: string, parentId: string | null) => Promise<string | void>;
  onCreateFile: (name: string, folderId: string | null, content?: string) => Promise<string | void>;
  currentFolderId: string | null;
  currentSessionId: string | null;
  onLogAction: (msg: string, isSilent?: boolean) => Promise<void>;
  onStateChange?: (isActive: boolean) => void;
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
  onLogAction, 
  onStateChange
}: VoiceAssistantProps, ref) {
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [lastLiveResponse, setLastLiveResponse] = useState<string>("");

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

  useImperativeHandle(ref, () => ({
    toggle: () => {
      if (isActive) stopSession();
      else startSession();
    },
    isActive
  }));

  const apiKey = localStorage.getItem("gemini_api_key") || process.env.GEMINI_API_KEY;

  const startSession = async () => {
    if (isConnecting) return;
    setIsConnecting(true);

    try {
      const liveAI = new LiveGenAI({ apiKey } as any);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = audioContext;
      
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      const playbackContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      playbackContextRef.current = playbackContext;
      nextPlayTimeRef.current = playbackContext.currentTime;

      const sessionPromise = (liveAI as any).live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } }
          },
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
            // Check for audio output
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

            // Also capture server-transcribed text
            if (message.serverContent?.outputAudioTranscription?.text) {
                currentAiTextRef.current += message.serverContent.outputAudioTranscription.text;
            }

            // Check for completed turn
            if (message.serverContent?.turnComplete) {
                const text = currentAiTextRef.current.trim();
                if (text) {
                    // Log to chat with isSilent=true so it triggers command execution in AICopilot but stays hidden in UI
                    onLogAction(text, true);
                    setLastLiveResponse(text);
                }
                currentAiTextRef.current = "";
            }
          },
          onclose: () => stopSession(),
          onerror: (err: any) => {
            console.error("Live session error:", err);
            stopSession();
          }
        }
      });
      
      const session = await sessionPromise;
      liveSessionRef.current = session;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Calculate volume level for waveform visualization
        let sum = 0;
        for(let i=0; i<inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        setVoiceLevel(Math.sqrt(sum / inputData.length));

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

    } catch (err) {
      console.error("Voice Assistant Connection Error:", err);
      setIsConnecting(false);
      addNotification({ title: "Connection Failed", message: "Unable to start voice assistant.", type: "error" });
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

  const stopSession = () => {
    if (liveSessionRef.current) liveSessionRef.current.close();
    if (audioContextRef.current) audioContextRef.current.close();
    if (playbackContextRef.current) playbackContextRef.current.close();
    
    liveSessionRef.current = null;
    audioContextRef.current = null;
    playbackContextRef.current = null;
    
    setIsActive(false);
    setIsConnecting(false);
    setVoiceLevel(0);

    addNotification({
      title: "Assistant Offline",
      message: "Voice assistant session ended.",
      type: "info"
    });
  };

  return (
    <AnimatePresence>
      {(isActive || isConnecting) && (
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
                    Live Session
                  </span>
                </div>
                <button onClick={stopSession} className="p-1 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Waveform Visualization */}
              <div className="h-12 flex items-center justify-center gap-1.5 w-full">
                {[...Array(12)].map((_, i) => (
                  <motion.div
                    key={i}
                    animate={{ 
                      height: isActive ? [8, 8 + (voiceLevel * 100 * Math.random()), 8] : [8, 12, 8]
                    }}
                    transition={{ 
                      duration: 0.2 + (Math.random() * 0.2), 
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                    className={cn(
                      "w-1.5 rounded-full",
                      isActive ? "bg-white" : "bg-white/20"
                    )}
                  />
                ))}
              </div>

              <div className="text-center px-4 w-full">
                <AnimatePresence mode="wait">
                  {lastLiveResponse && isActive ? (
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
                  onClick={stopSession}
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
