export interface UserProfile {
  uid: string;
  email: string;
  name?: string;
  photoURL?: string;
  createdAt?: number;
}

export type FileType = "folder" | "script" | "caption" | "thread" | "brainstorm";

export interface Tag {
  id: string;
  name: string;
  type: "status" | "flexible";
  color?: string;
}

export interface FileVersion {
  id: string;
  content: string;
  updatedAt: number;
}

export interface FileItem {
  id: string;
  name: string;
  type: FileType;
  parentId: string | null;
  ownerId: string;
  tags: Tag[];
  content?: string;
  headerImage?: string;
  color?: string;
  isPublic?: boolean;
  createdAt: number;
  updatedAt: number;
  versions?: FileVersion[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  imageUrls?: string[];
  linkMetadata?: {
    url: string;
    title: string;
    description: string;
    image?: string;
  }[];
  createdAt: number;
  isSilent?: boolean;
}

export interface KnowledgeFile {
  id: string;
  name: string;
  content: string;
  type: "md" | "txt";
  label: string;
  isActive: boolean;
  createdAt: number;
}

export type VoiceMode = "text-only" | "voice-only" | "both";

export interface ChatSession {
  id: string;
  ownerId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  knowledgeFiles?: KnowledgeFile[];
  voiceMode?: VoiceMode;
}

export const TAG_COLORS = [
  "#B2AC88", "#F4C2C2", "#87CEEB", "#FFBF00", "#E6E6FA", "#A8E6CF", "#DCEDC1", "#FFD3B6", "#FFAAA5", "#FF8B94"
];
