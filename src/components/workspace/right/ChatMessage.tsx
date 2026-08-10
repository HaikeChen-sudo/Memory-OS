"use client";

import type { Message } from "@/types";
import { messageEnter } from "@/animations";

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
      {...messageEnter}
    >
      <div
        className={`max-w-[85%] rounded-[4px] px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "bg-[#E85327] text-[#12233A] shadow-[4px_4px_0_#E7E1D3]"
            : "bg-[#E7E1D3] text-[#12233A]"
        }`}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>

        {/* Citations */}
        {message.citations && message.citations.length > 0 && (
          <div className="mt-3 space-y-1 border-t border-[#12233A]/20 pt-2">
            {message.citations.map((citation, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-xs text-[#12233A]/55"
              >
                <span className="inline-block h-1.5 w-1.5 bg-[#E85327]" />
                <span className="truncate">{citation.text_snippet || `引用 #${i + 1}`}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
