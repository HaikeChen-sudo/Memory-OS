import { create } from "zustand";
import type { Message, DebugLog } from "@/types";

const PAGE_SIZE = 30;
const STORAGE_KEY = "memory-os-chat";

/** Read persisted activeChatId from localStorage (client-side only) */
function getPersistedChatId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      return data?.state?.activeChatId || null;
    }
  } catch { /* ignore parse errors */ }
  return null;
}

/** Persist activeChatId to localStorage */
function persistChatId(chatId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      state: { activeChatId: chatId },
    }));
  } catch { /* ignore quota errors */ }
}

interface ChatState {
  activeChatId: string | null;
  messages: Message[];
  isStreaming: boolean;
  isAnalyzing: boolean;
  displayCount: number;
  isLoadingMore: boolean;
  conversationSummary: string | null;
  debugLogs: DebugLog[];

  setActiveChat: (chatId: string | null) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  setIsStreaming: (streaming: boolean) => void;
  setIsAnalyzing: (analyzing: boolean) => void;
  setConversationSummary: (summary: string | null) => void;
  addDebugLog: (log: DebugLog) => void;
  clearDebugLogs: () => void;
  loadMoreMessages: () => boolean;
  resetDisplayCount: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  // Restore from localStorage on init
  activeChatId: getPersistedChatId(),
  messages: [],
  isStreaming: false,
  isAnalyzing: false,
  displayCount: PAGE_SIZE,
  isLoadingMore: false,
  conversationSummary: null,
  debugLogs: [],

  setActiveChat: (chatId) => {
    if (chatId !== get().activeChatId) {
      persistChatId(chatId);
      set({
        activeChatId: chatId,
        messages: [],
        displayCount: PAGE_SIZE,
        conversationSummary: null,
        debugLogs: [],
      });
    }
  },
  setMessages: (messages) => {
    const sorted = [...messages].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    set({ messages: sorted, displayCount: PAGE_SIZE, isLoadingMore: false });
  },
  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
      displayCount: Math.max(state.displayCount, state.messages.length + 1),
    })),
  setIsStreaming: (streaming) => set({ isStreaming: streaming }),
  setIsAnalyzing: (analyzing) => set({ isAnalyzing: analyzing }),
  setConversationSummary: (summary) => set({ conversationSummary: summary }),
  addDebugLog: (log) =>
    set((state) => ({ debugLogs: [log, ...state.debugLogs].slice(0, 20) })),
  clearDebugLogs: () => set({ debugLogs: [] }),

  loadMoreMessages: () => {
    const { messages, displayCount } = get();
    const newCount = Math.min(messages.length, displayCount + PAGE_SIZE);
    if (newCount > displayCount) {
      set({ displayCount: newCount });
      return newCount < messages.length;
    }
    return false;
  },

  resetDisplayCount: () => set({ displayCount: PAGE_SIZE }),
}));
