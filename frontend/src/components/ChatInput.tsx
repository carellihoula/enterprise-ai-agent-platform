'use client';

/**
 * Modern conversational ChatInput styled after ChatGPT and Gemini prompt bars.
 * Features auto-expanding textarea, action triggers (attachments, reasoning, web search),
 * keyboard shortcuts (Enter to send, Shift+Enter for new line), and an active Stop/Send control.
 */

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ReasoningEffort } from '@/types/agent';
import { ChatAttachment } from '@/types/chat';
import { AttachmentBadges } from '@/components/playground/AttachmentBadges';
import {
  ArrowUp,
  Square,
  Paperclip,
  Globe,
  Brain,
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
  enableReasoning?: boolean;
  reasoningEffort?: ReasoningEffort;
  onReasoningEffortChange?: (effort: ReasoningEffort) => void;
  pendingAttachments?: ChatAttachment[];
  isUploadingAttachment?: boolean;
  onAttachFiles?: (files: FileList | File[]) => void;
  onRemoveAttachment?: (attachmentId: string) => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  isLoading,
  onStopStreaming,
  disabled = false,
  placeholder = 'Ask a question, analyze data, or instruct an agent...',
  onOpenAssistantPicker,
  activeAssistantName,
  enableReasoning = false,
  reasoningEffort = 'medium',
  onReasoningEffortChange,
  pendingAttachments = [],
  isUploadingAttachment = false,
  onAttachFiles,
  onRemoveAttachment,
}) => {
  const [prompt, setPrompt] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea according to text height (up to max 220px)
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 220)}px`;
    }
  }, [prompt]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!prompt.trim() && pendingAttachments.length === 0) || isLoading || disabled || isUploadingAttachment) {
      return;
    }
    onSendMessage(prompt.trim() || 'Please analyze the attached file(s).');
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

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!onAttachFiles || !e.clipboardData?.files?.length) return;
    e.preventDefault();
    onAttachFiles(e.clipboardData.files);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (!onAttachFiles || !e.dataTransfer?.files?.length) return;
    onAttachFiles(e.dataTransfer.files);
  };

  return (
    // [Layout] Align input bar width with max-w-5xl message container for visual consistency
    <div className="w-full max-w-5xl mx-auto px-4 pb-4 pt-2 bg-gradient-to-t from-white via-white/95 to-transparent shrink-0">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          'relative flex flex-col bg-white border border-zinc-300 rounded-2xl shadow-xs transition-colors focus-within:border-zinc-500 focus-within:ring-1 focus-within:ring-zinc-400 p-2',
          isDragging && 'border-zinc-900 bg-zinc-50/70',
          disabled && 'opacity-60 pointer-events-none'
        )}
      >
        {(pendingAttachments.length > 0 || isUploadingAttachment) && (
          <div className="px-2 pt-1 pb-2 border-b border-zinc-100 mb-1">
            <AttachmentBadges
              attachments={pendingAttachments}
              isUploading={isUploadingAttachment}
              onRemove={onRemoveAttachment}
            />
          </div>
        )}

        {/* Input Textarea */}
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder}
          rows={1}
          disabled={isLoading || disabled}
          className="w-full bg-transparent text-zinc-900 placeholder:text-zinc-400 text-sm px-3 pt-1.5 pb-1 resize-none focus:outline-none min-h-[44px] max-h-[220px] leading-relaxed font-sans"
        />

        {/* Bottom Actions Row */}
        <div className="flex items-center justify-between px-2 pt-1">
          {/* Left Action Attachments & Modifiers */}
          <div className="flex items-center gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".py,.js,.jsx,.ts,.tsx,.json,.yaml,.yml,.md,.txt,.csv,.sql,.sh,.html,.css,.xml,.toml,.ini,.log,.env,.pdf,.png,.jpg,.jpeg,.webp,.gif"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length && onAttachFiles) {
                  onAttachFiles(e.target.files);
                }
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || disabled || isUploadingAttachment}
              title="Attach files, code, PDF, or images (max 5 MB)"
              className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-md transition-colors disabled:opacity-40"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onOpenAssistantPicker}
              title="Select AI Agent"
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:text-zinc-900 bg-white hover:bg-zinc-100 border border-zinc-200 rounded-md transition-colors group"
            >
              <Globe className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-800 transition-colors" />
              <span className="hidden sm:inline">
                {activeAssistantName ? `Agent: ${activeAssistantName}` : "Select Agent"}
              </span>
            </button>

            {enableReasoning && onReasoningEffortChange && (
              <Select
                value={reasoningEffort}
                onValueChange={(val) => onReasoningEffortChange(val as ReasoningEffort)}
                disabled={isLoading || disabled}
              >
                <SelectTrigger
                  aria-label="Reasoning effort"
                  title="Reasoning effort"
                  className="h-7 w-auto min-w-[96px] gap-1.5 px-2 py-0.5 text-xs font-medium text-zinc-700 border-zinc-200 bg-white hover:bg-zinc-100 shadow-none"
                >
                  <Brain className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            )}
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
                disabled={(!prompt.trim() && pendingAttachments.length === 0) || disabled || isUploadingAttachment}
                title="Send message (Enter)"
                className={cn(
                  'rounded-full h-7 w-7 transition-colors shadow-none',
                  (prompt.trim() || pendingAttachments.length > 0) && !isUploadingAttachment
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
