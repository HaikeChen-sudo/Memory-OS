"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useChatStore } from "@/stores/chatStore";
import { useFolderStore } from "@/stores/folderStore";
import { memoryManager, answer, generateSummary } from "@/features";
import { sessionIdForFolder } from "@/features/chat/sessionScope";
import { storage } from "@/storage";
import type { Chat, Message, Citation, AnswerResult } from "@/types";

async function createChat(folderId: string, title?: string): Promise<Chat> {
  const chat: Chat = {
    id: crypto.randomUUID(),
    folder_id: folderId,
    title: title || "新对话",
    color: "#3b82f6",
    animation_state: "idle",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await storage.saveSession(chat);
  return chat;
}

async function fetchMessages(sessionId: string): Promise<Message[]> {
  return storage.readMessagesBySession(sessionId);
}

/** Client-side LLM call helper for summary generation */
async function callLLMForSummary(prompt: string, temperature: number): Promise<string> {
  try {
    const response = await fetch("/api/chat/llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, temperature, max_tokens: 512 }),
    });
    const json = await response.json();
    return json.text || "";
  } catch {
    return "";
  }
}

async function sendMessage(
  sessionId: string,
  content: string,
  opts?: {
    userMessageId?: string;
    folderId?: string;
  }
): Promise<{ userMessage: Message; aiMessage: Message; result: AnswerResult }> {
  const { userMessageId, folderId } = opts || {};

  // 1. Save user message (reuse id from optimistic update when provided)
  const userMessage: Message = {
    id: userMessageId || crypto.randomUUID(),
    session_id: sessionId,
    role: "user",
    content,
    citations: [],
    animation_state: "idle",
    created_at: new Date().toISOString(),
  };
  await storage.saveMessage(userMessage);

  // 2. Retrieve relevant memories (keywords for now, embeddings later)
  const allMemories = await memoryManager.getAll(undefined, folderId);

  // 2.5 Build conversation history from recent messages for context continuity
  // Exclude the current user message (just saved) to avoid duplication
  const recentMessages = await storage.readMessagesBySession(sessionId);
  const conversationHistory = recentMessages
    .filter((message) => message.id !== userMessage.id)
    .slice(-20)   // last 20 messages (10 turns)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  // 2.6 Generate or reuse conversation summary for long conversations
  const totalTurns = Math.floor(recentMessages.length / 2);
  let conversationSummary = useChatStore.getState().conversationSummary;

  // Trigger summary generation when conversation exceeds 10 turns
  // and we don't already have a recent summary
  if (totalTurns >= 10 && !conversationSummary && conversationHistory.length > 0) {
    try {
      const summary = await generateSummary(conversationHistory, callLLMForSummary);
      if (summary) {
        conversationSummary = summary.text;
        useChatStore.getState().setConversationSummary(summary.text);
      }
    } catch {
      // Summary generation is best-effort, don't block the main flow
    }
  }

  // 3. Generate answer using the pipelined workflow
  const result = await answer(content, allMemories, {
    conversationHistory,
    conversationSummary,
  });

  // 4. Save AI message with citations
  const citations: Citation[] = result.sources.map((s) => ({
    memory_id: s.memory.id,
    source_id: null,
    text_snippet: s.memory.title,
    strength: s.relevance,
    position_in_message: null,
  }));

  const aiMessage: Message = {
    id: crypto.randomUUID(),
    session_id: sessionId,
    role: "assistant",
    content: result.answer,
    citations,
    animation_state: "idle",
    created_at: new Date().toISOString(),
  };
  await storage.saveMessage(aiMessage);

  return { userMessage, aiMessage, result };
}

export function useMessages(sessionId: string | null) {
  const { setMessages } = useChatStore();
  return useQuery({
    queryKey: ["messages", sessionId],
    queryFn: async () => {
      if (!sessionId) return [];
      const messages = await fetchMessages(sessionId);
      setMessages(messages);
      return messages;
    },
    enabled: !!sessionId,
  });
}

/** Validates a persisted chat against the active folder before loading messages. */
export function useScopedChatSession(sessionId: string | null) {
  const folderId = useFolderStore((state) => state.activeFolderId);
  const sessionQuery = useQuery({
    queryKey: ["chat-session", sessionId],
    queryFn: () => sessionId ? storage.readSession(sessionId) : null,
    enabled: Boolean(sessionId),
  });
  return {
    folderId,
    scopedSessionId: sessionIdForFolder(sessionQuery.data, folderId),
    isResolving: Boolean(sessionId) && sessionQuery.isLoading,
  };
}

export function useCreateChat() {
  const queryClient = useQueryClient();
  const { setActiveChat } = useChatStore();
  const folderId = useFolderStore((s) => s.activeFolderId);

  return useMutation({
    mutationFn: (title?: string) => {
      if (!folderId) throw new Error("No folder selected");
      return createChat(folderId, title);
    },
    onSuccess: (chat) => {
      setActiveChat(chat.id);
      queryClient.invalidateQueries({ queryKey: ["chats", chat.folder_id] });
    },
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  const { addMessage, setIsStreaming } = useChatStore();
  const folderId = useFolderStore((s) => s.activeFolderId);

  return useMutation({
    mutationFn: ({
      sessionId,
      content,
      userMessageId,
    }: {
      sessionId: string;
      content: string;
      userMessageId?: string;
    }) => sendMessage(sessionId, content, { userMessageId, folderId: folderId ?? undefined }),
    onMutate: () => {
      setIsStreaming(true);
    },
    onSuccess: ({ aiMessage }) => {
      addMessage(aiMessage);
      queryClient.invalidateQueries({ queryKey: ["messages"] });
      setIsStreaming(false);
    },
    onError: () => {
      setIsStreaming(false);
    },
  });
}
