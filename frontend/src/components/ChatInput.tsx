'use client';

/**
 * ChatInput component styled with light theme prompt bar.
 */

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowUp, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  onSendMessage: (content: string) => void;
  isLoading: boolean;
  disabled?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  isLoading,
  disabled = false,
}) => {
  const [prompt, setPrompt] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [prompt]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
      handleSubmit(e);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pb-4 bg-white">
      <form
        onSubmit={handleSubmit}
        className="relative flex items-end bg-zinc-50 border border-zinc-200 focus-within:border-zinc-300 rounded-3xl shadow-sm p-2 transition-all"
      >
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message AI Platform..."
          rows={1}
          disabled={isLoading || disabled}
          className={cn(
            'w-full bg-transparent text-zinc-900 placeholder-zinc-400 text-sm px-3 py-2 resize-none focus:outline-none min-h-[44px] max-h-[200px] leading-relaxed',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        />

        <Button
          type="submit"
          size="icon"
          disabled={!prompt.trim() || isLoading || disabled}
          className={cn(
            'rounded-full h-8 w-8 mb-1 shrink-0 transition-all',
            prompt.trim() && !isLoading
              ? 'bg-zinc-900 text-white hover:bg-zinc-800'
              : 'bg-zinc-200 text-zinc-400 hover:bg-zinc-200'
          )}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
          ) : (
            <ArrowUp className="w-4 h-4 stroke-[2.5]" />
          )}
        </Button>
      </form>
      <div className="text-[11px] text-center text-zinc-400 mt-2">
        AI Platform can make mistakes. Verify important info.
      </div>
    </div>
  );
};
