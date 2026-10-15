'use client';

/**
 * Modern conversational ChatInput styled after ChatGPT and Gemini prompt bars.
 * Features auto-expanding textarea, action triggers (attachments, reasoning, web search),
 * keyboard shortcuts (Enter to send, Shift+Enter for new line), and an active Stop/Send control.
 */

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  ArrowUp,
  Square,
  Paperclip,
  Globe,
  Sparkles,
  SlidersHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  onSendMessage: (content: string) => void;
  isLoading: boolean;
  onStopStreaming?: () => void;
  disabled?: boolean;
  placeholder?: string;
  onOpenAssistantPicker?: () => void;
  activeAssistantName?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  isLoading,
  onStopStreaming,
  disabled = false,
  placeholder = 'Ask a question, analyze data, or instruct an agent...',
  onOpenAssistantPicker,
  activeAssistantName,
}) => {
  const [prompt, setPrompt] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea according to text height (up to max 220px)
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 220)}px`;
    }
  }, [prompt]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim() || isLoading || disabled) return;
    onSendMessage(prompt.trim());
    setPrompt('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    // [Layout] Align input bar width with max-w-5xl message container for visual consistency
    <div className="w-full max-w-5xl mx-auto px-4 pb-4 pt-2 bg-gradient-to-t from-white via-white/95 to-transparent shrink-0">
      <div
        className={cn(
          'relative flex flex-col bg-white border border-zinc-300 rounded-2xl shadow-xs transition-colors focus-within:border-zinc-500 focus-within:ring-1 focus-within:ring-zinc-400 p-2',
          disabled && 'opacity-60 pointer-events-none'
        )}
      >
        {/* Input Textarea */}
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          disabled={isLoading || disabled}
          className="w-full bg-transparent text-zinc-900 placeholder:text-zinc-400 text-sm px-3 pt-1.5 pb-1 resize-none focus:outline-none min-h-[44px] max-h-[220px] leading-relaxed font-sans"
        />

        {/* Bottom Actions Row */}
        <div className="flex items-center justify-between px-2 pt-1">
          {/* Left Action Attachments & Modifiers */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              title="Attach documents or knowledge data"
              className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-md transition-colors"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onOpenAssistantPicker}
              title="Select AI Assistant"
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:text-zinc-900 bg-white hover:bg-zinc-100 border border-zinc-200 rounded-md transition-colors group"
            >
              <Globe className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-800 transition-colors" />
              <span className="hidden sm:inline">
                {activeAssistantName ? `Assistant: ${activeAssistantName}` : "Enterprise Search"}
              </span>
            </button>
          </div>

          {/* Right Action: Send or Stop */}
          <div className="flex items-center gap-2">
            {isLoading ? (
              <Button
                type="button"
                size="icon"
                onClick={onStopStreaming}
                title="Stop response generation"
                className="rounded-full h-7 w-7 bg-zinc-900 text-white hover:bg-zinc-800 transition-colors shadow-none"
              >
                <Square className="w-3 h-3 fill-white" />
              </Button>
            ) : (
              <Button
                type="button"
                size="icon"
                onClick={() => handleSubmit()}
                disabled={!prompt.trim() || disabled}
                title="Send message (Enter)"
                className={cn(
                  'rounded-full h-7 w-7 transition-colors shadow-none',
                  prompt.trim()
                    ? 'bg-zinc-900 text-white hover:bg-zinc-800'
                    : 'bg-zinc-100 text-zinc-300 hover:bg-zinc-100 cursor-not-allowed'
                )}
              >
                <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Compliance & Verification Disclaimer */}
      <div className="text-[11px] text-center text-zinc-400 mt-2">
        Enterprise AI can make mistakes. Verify critical business data and outputs.
      </div>
    </div>
  );
};
