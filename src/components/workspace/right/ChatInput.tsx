"use client";

import { useState, useRef, useCallback, KeyboardEvent } from "react";

interface ChatInputProps {
  onSend: (content: string) => void;
  isStreaming: boolean;
}

export function ChatInput({ onSend, isStreaming }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, isStreaming, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  }, []);

  return (
    <div className="flex items-end gap-2 border-t border-[#E7E1D3]/20 bg-[#12233A] px-4 py-3">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        placeholder="询问关于你的记忆..."
        rows={1}
        disabled={isStreaming}
        className="min-h-10 flex-1 resize-none rounded-[4px] bg-[#E7E1D3] px-4 py-2.5 text-sm text-[#12233A] outline-none placeholder:text-[#12233A]/42 focus:shadow-[inset_0_-3px_0_#E85327] disabled:opacity-50"
      />
      <button
        onClick={handleSend}
        disabled={!value.trim() || isStreaming}
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[4px] bg-[#E85327] font-semibold text-[#12233A] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-30"
      >
        ↑
      </button>
    </div>
  );
}
