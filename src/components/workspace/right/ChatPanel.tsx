"use client";

import { useEffect, useRef, useCallback } from "react";
import {
  useCreateChat,
  useMessages,
  useScopedChatSession,
  useSendMessage,
} from "@/hooks/useChat";
import { useChatStore } from "@/stores/chatStore";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import type { Message } from "@/types";

export function ChatPanel() {
  const {
    activeChatId,
    messages,
    isStreaming,
    displayCount,
    isLoadingMore,
    setActiveChat,
    addMessage,
    loadMoreMessages,
  } = useChatStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const creationRequestedForFolder = useRef<string | null>(null);
  const prevMessageCount = useRef(0);
  const isLoadingMoreRef = useRef(false);

  const { folderId, scopedSessionId, isResolving } = useScopedChatSession(activeChatId);
  useMessages(scopedSessionId);
  const sendMessage = useSendMessage();
  const createChat = useCreateChat();
  const scopedMessages = scopedSessionId ? messages : [];

  useEffect(() => {
    if (!folderId || isResolving || scopedSessionId) return;
    if (creationRequestedForFolder.current === folderId) return;
    creationRequestedForFolder.current = folderId;
    createChat.mutate(undefined, {
      onSuccess: (chat) => setActiveChat(chat.id),
      onError: () => {
        creationRequestedForFolder.current = null;
      },
    });
  }, [createChat, folderId, isResolving, scopedSessionId, setActiveChat]);

  // Scroll to bottom on new messages (only when a new message is added)
  useEffect(() => {
    if (scopedMessages.length > prevMessageCount.current) {
      prevMessageCount.current = scopedMessages.length;
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [scopedMessages.length]);

  // Handle scroll to top → load more older messages
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || isLoadingMoreRef.current) return;

    // When scrolled near the top (within 60px)
    if (container.scrollTop < 60) {
      const hasMore = loadMoreMessages();
      if (hasMore) {
        isLoadingMoreRef.current = true;
        // Brief delay to show loading indicator
        setTimeout(() => {
          isLoadingMoreRef.current = false;
        }, 400);
      }
    }
  }, [loadMoreMessages]);

  const handleSend = useCallback(
    async (content: string) => {
      if (!scopedSessionId) return;

      const optimisticUser: Message = {
        id: crypto.randomUUID(),
        session_id: scopedSessionId,
        role: "user",
        content,
        citations: [],
        animation_state: "idle",
        created_at: new Date().toISOString(),
      };
      addMessage(optimisticUser);

      sendMessage.mutate({
        sessionId: scopedSessionId,
        content,
        userMessageId: optimisticUser.id,
      });
    },
    [addMessage, scopedSessionId, sendMessage]
  );

  // Only display the most recent `displayCount` messages
  const displayMessages = scopedMessages.slice(-displayCount);
  const hasMoreMessages = displayMessages.length < scopedMessages.length;

  return (
    <div className="flex h-full flex-col bg-[#12233A] text-[#E7E1D3]">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-[#E7E1D3]/20 px-4 py-4">
        <p className="font-mono text-[9px] tracking-[0.16em] text-[#E85327]">03 / ASSISTANT</p>
        <h2 className="mt-1 text-lg font-semibold text-[#E7E1D3]">Memory AI</h2>
      </div>

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 space-y-4 overflow-y-auto px-4 py-4"
      >
        {/* Load more indicator at top */}
        {hasMoreMessages && (
          <div className="flex justify-center py-2">
            {isLoadingMore ? (
              <div className="flex items-center gap-2 text-xs text-[#E7E1D3]/55">
                <span className="h-1.5 w-1.5 animate-bounce bg-[#E85327]" />
                <span className="h-1.5 w-1.5 animate-bounce bg-[#E7E1D3] [animation-delay:0.1s]" />
                <span className="h-1.5 w-1.5 animate-bounce bg-[#E7E1D3]/35 [animation-delay:0.2s]" />
                <span className="ml-1">加载中...</span>
              </div>
            ) : (
              <span className="text-xs text-[#E7E1D3]/35">
                向上滚动加载更多
              </span>
            )}
          </div>
        )}

        {scopedMessages.length === 0 && (
          <div className="mx-auto mt-12 flex max-w-xs flex-col items-start justify-center gap-3 rounded-[4px] bg-[#E7E1D3] px-6 py-8 text-left text-[#12233A] shadow-[5px_5px_0_#E85327]">
            <span className="h-1 w-12 bg-[#E85327]" />
            <p className="text-sm font-semibold">向你的记忆提问</p>
            <p className="max-w-56 text-xs leading-5 text-[#12233A]/58">
              AI 只基于你上传的内容回答，每个回答都会标注引用来源
            </p>
          </div>
        )}

        {displayMessages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}

        {isStreaming && (
          <div className="flex justify-start">
            <div className="rounded-[4px] bg-[#E7E1D3] px-4 py-3">
              <div className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce bg-[#E85327]" />
                <span className="h-1.5 w-1.5 animate-bounce bg-[#12233A] [animation-delay:0.1s]" />
                <span className="h-1.5 w-1.5 animate-bounce bg-[#12233A]/35 [animation-delay:0.2s]" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <ChatInput onSend={handleSend} isStreaming={isStreaming} />
    </div>
  );
}
