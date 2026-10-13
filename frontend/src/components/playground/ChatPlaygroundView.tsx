import React, { useRef, useEffect } from "react";
import { Message, ModelConfigState } from "@/types/chat";
import { ChatMessageItem } from "@/components/ChatMessageItem";
import { ChatInput } from "@/components/ChatInput";
import { Sparkles } from "lucide-react";
import { PromptSuggestionsGrid } from "./PromptSuggestionsGrid";

interface ChatPlaygroundViewProps {
  messages: Message[];
  isLoadingMessages: boolean;
  isStreaming: boolean;
  onSendMessage: (content: string) => void;
  onStopStreaming: () => void;
  onRetryLastMessage: () => void;
}

/**
 * Message stream canvas and prompt input area for the Chat Playground view.
 */
export const ChatPlaygroundView: React.FC<ChatPlaygroundViewProps> = ({
  messages,
  isLoadingMessages,
  isStreaming,
  onSendMessage,
  onStopStreaming,
  onRetryLastMessage,
}) => {
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const isUserScrolledUpRef = useRef<boolean>(false);

  // Detect user scroll position to avoid jerking viewport during active token streaming
  const handleScroll = () => {
    if (!chatScrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatScrollRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    isUserScrolledUpRef.current = distanceFromBottom > 120;
  };

  // Smooth pin-to-bottom without animation jitter
  useEffect(() => {
    if (chatScrollRef.current && !isUserScrolledUpRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  return (
    <>
      <div
        ref={chatScrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto w-full bg-white"
      >
        {isLoadingMessages ? (
          <div className="flex items-center justify-center h-full text-zinc-500 gap-2 text-sm">
            <Sparkles className="w-4 h-4 animate-spin text-indigo-600" />
            Loading chat history...
          </div>
        ) : messages.length === 0 ? (
          <PromptSuggestionsGrid onSelectPrompt={onSendMessage} />
        ) : (
          <div className="py-4 divide-y divide-zinc-100/60">
            {messages.map((msg, index) => (
              <ChatMessageItem
                key={msg.id || `${msg.role}-${index}`}
                message={msg}
                isStreaming={
                  isStreaming &&
                  index === messages.length - 1 &&
                  msg.role === "assistant"
                }
                onRetry={
                  index === messages.length - 1 &&
                  msg.role === "assistant"
                    ? onRetryLastMessage
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </div>

      <ChatInput
        onSendMessage={onSendMessage}
        isLoading={isStreaming}
        onStopStreaming={onStopStreaming}
      />
    </>
  );
};
